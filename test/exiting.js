'use strict';

// Load modules

const Events = require('events');

const Code = require('@hapi/code');
const Exiting = require('..');
const Hapi = require('@hapi/hapi');
const Hoek = require('@hapi/hoek');
const Lab = require('@hapi/lab');


// Test shortcuts

const lab = exports.lab = Lab.script();
const { describe, it, before, beforeEach, after, afterEach } = lab;
const { expect } = Code;


describe('Manager', () => {

    const processExit = process.exit;

    const grabExit = (manager, emit) => {

        const promise = new Promise((resolve) => {

            process.exit = (code) => {

                if (emit) {
                    process.emit('exit', code);
                }

                resolve({ code, state: manager.state });
            };
        });

        promise.exit = (code) => {

            try {
                process.exit(code);
            }
            catch (err) {
                if (!(err instanceof Exiting.ProcessExitError)) {
                    throw err;
                }
            }

            return promise;
        };

        return promise;
    };

    const ignoreProcessExitError = (err) => {

        if (err instanceof Exiting.ProcessExitError) {
            return;
        }

        throw err;
    };

    before(() => {

        // Silence log messages

        const log = Exiting.log;
        Exiting.log = function (...args) {

            const consoleError = console.error;
            console.error = Hoek.ignore;
            log.apply(Exiting, args);
            console.error = consoleError;
        };
    });

    beforeEach(() => {

        Exiting.reset();
    });

    after(() => {

        Exiting.reset();
        process.exit = processExit;
    });

    afterEach(() => {

        process.exit = processExit;
    });

    it('creates new object', () => {

        const manager = Exiting.createManager({});
        expect(manager).to.exist();
        expect(manager).to.be.an.instanceof(Exiting.Manager);
    });

    it('can start and stop without exiting', async () => {

        const manager = Exiting.createManager(Hapi.Server());

        await manager.start();

        expect(manager.state).to.equal('started');

        await Hoek.wait(0);
        await manager.stop();

        expect(manager.state).to.equal('stopped');
    });

    it('can start and stop with multiple servers', async () => {

        const manager = Exiting.createManager([Hapi.Server(), Hapi.Server(), Hapi.Server()]);

        await manager.start();

        expect(manager.state).to.equal('started');

        await Hoek.wait(0);
        await manager.stop();

        expect(manager.state).to.equal('stopped');
    });

    it('can restart servers', async () => {

        const manager = Exiting.createManager([Hapi.Server(), Hapi.Server(), Hapi.Server()]);
        const exited = grabExit(manager);

        await manager.start();
        await Hoek.wait(0);
        await manager.stop();

        expect(manager.state).to.equal('stopped');

        await manager.start();

        expect(manager.state).to.equal('started');

        const { code, state } = await exited.exit(0);
        expect(state).to.equal('stopped');
        expect(code).to.equal(0);
    });

    it('supports stop options', async () => {

        const manager = Exiting.createManager([Hapi.Server(), Hapi.Server(), Hapi.Server()]);

        await manager.start();

        expect(manager.state).to.equal('started');

        await manager.stop({ timeout: 5 });

        expect(manager.state).to.equal('stopped');
    });

    it('alerts on unknown exit', async () => {

        const manager = Exiting.createManager(Hapi.Server());

        await manager.start();

        const logged = new Promise((resolve) => {

            const log = Exiting.log;
            Exiting.log = (message) => {

                Exiting.log = log;
                resolve(message);
            };
        });

        // Fake a spurious process "exit" event

        process.emit('exit', 0);

        expect(await logged).to.equal('Process exiting without stopping server (state == started)');
        await manager.stop();
    });

    it('forwards start rejections', async () => {

        const servers = [Hapi.Server(), Hapi.Server(), Hapi.Server()];
        const manager = new Exiting.Manager(servers);

        let stops = 0;
        servers.forEach((server) => {

            server.events.on('stop', () => ++stops);
        });

        servers[1].ext('onPreStart', () => {

            throw new Error('start fail');
        });

        servers[2].ext('onPostStop', () => {

            throw new Error('stop fail');
        });

        await expect(manager.start()).to.reject(Error, 'start fail');

        expect(manager.state).to.equal('errored');
        expect(stops).to.equal(3);
    });

    it('cancels exit when reset', async () => {

        const server = new Hapi.Server();
        const manager = new Exiting.Manager([Hapi.Server(), server, Hapi.Server()]);

        server.ext('onPreStop', () => {

            Exiting.reset();
        });

        await manager.start();
        await manager.stop();
    });

    it('cancels exit when reset after close', async () => {

        const server = new Hapi.Server();
        const manager = new Exiting.Manager([Hapi.Server(), server, Hapi.Server()]);
        const exited = grabExit(manager);

        server.ext('onPostStop', () => {

            Exiting.reset();
        });

        await manager.start();
        exited.exit(0);
    });

    it('uncaughtException handler ignores ProcessExitErrors', async (flags) => {

        const manager = Exiting.createManager([Hapi.Server(), Hapi.Server(), Hapi.Server()]);
        const exited = grabExit(manager, true);

        await manager.start();

        // Immitate a throw by faking an uncaughtException

        flags.onUncaughtException = ignoreProcessExitError;
        process.emit('uncaughtException', new Exiting.ProcessExitError());

        const { code, state } = await exited.exit(0);
        expect(state).to.equal('stopped');
        expect(code).to.equal(0);
    });

    it('unhandledRejection handler ignores ProcessExitErrors', async (flags) => {

        const manager = Exiting.createManager([Hapi.Server(), Hapi.Server(), Hapi.Server()]);
        const exited = grabExit(manager, true);

        await manager.start();

        await new Promise((resolve, reject) => {

            flags.onUnhandledRejection = (err) => {

                (err instanceof Exiting.ProcessExitError) ? resolve() : reject(err);
            };

            Promise.reject(new Exiting.ProcessExitError());
        });

        const { code, state } = await exited.exit(0);
        expect(state).to.equal('stopped');
        expect(code).to.equal(0);
    });

    it('does not exit for registered signal handlers', async () => {

        const sigint = Events.once(process, 'SIGINT');
        const manager = Exiting.createManager([Hapi.Server(), Hapi.Server(), Hapi.Server()]);

        await manager.start();

        setImmediate(() => {

            process.kill(process.pid, 'SIGINT');
        });

        await sigint;
        await Hoek.wait(1);

        expect(manager.state).to.equal('started');
    });

    it('does not exit for registered aborting signal handlers', async () => {

        const sighub = Events.once(process, 'SIGHUP');
        const manager = Exiting.createManager([Hapi.Server(), Hapi.Server(), Hapi.Server()]);

        await manager.start();

        setImmediate(() => {

            process.kill(process.pid, 'SIGHUP');
        });

        await sighub;
        await Hoek.wait(1);

        expect(manager.state).to.equal('started');
    });

    it('can deactivate', async () => {

        const manager = Exiting.createManager(Hapi.Server());
        await manager.start();

        expect(process.listenerCount('exit')).to.equal(1);
        expect(manager.active).to.be.true();

        manager.deactivate();
        expect(process.listenerCount('exit')).to.equal(0);
        expect(manager.active).to.be.false();
    });

    it('deactivate does nothing after reset', async () => {

        const manager = Exiting.createManager(Hapi.Server());
        await manager.start();

        expect(process.listenerCount('exit')).to.equal(1);
        expect(manager.active).to.be.true();

        Exiting.reset();
        expect(process.listenerCount('exit')).to.equal(0);
        expect(manager.active).to.be.false();

        manager.deactivate();
        expect(process.listenerCount('exit')).to.equal(0);
        expect(manager.active).to.be.false();
    });

    describe('exits gracefully', () => {

        it('on process.exit with code 0', async () => {

            const manager = Exiting.createManager([Hapi.Server(), Hapi.Server(), Hapi.Server()]);
            const exited = grabExit(manager, true);

            await manager.start();
            await Hoek.wait(0);

            const { code, state } = await exited.exit(0);
            expect(state).to.equal('stopped');
            expect(code).to.equal(0);
        });

        it('while starting', async () => {

            const manager = Exiting.createManager([Hapi.Server(), Hapi.Server(), Hapi.Server()]);
            const exited = grabExit(manager);

            manager.start();     // No await here

            exited.exit(0);
            exited.exit(0);

            const { code, state } = await exited;
            expect(state).to.equal('stopped');
            expect(code).to.equal(0);
        });

        it('on double exit', async () => {

            const manager = Exiting.createManager([Hapi.Server(), Hapi.Server(), Hapi.Server()]);
            const exited = grabExit(manager);

            await manager.start();
            await Hoek.wait(0);
            exited.exit(0);
            exited.exit(0);

            const { code, state } = await exited;
            expect(state).to.equal('stopped');
            expect(code).to.equal(0);
        });

        it('on double exit with preStop delay', async () => {

            const server = new Hapi.Server();
            const manager = new Exiting.Manager(server);
            const exited = grabExit(manager);

            server.ext('onPreStop', async () => {

                await Hoek.wait(0);
            });

            await manager.start();
            await Hoek.wait(0);
            exited.exit(0);
            exited.exit(0);

            const { code, state } = await exited;
            expect(state).to.equal('stopped');
            expect(code).to.equal(0);
        });

        it('on SIGINT', async () => {

            const manager = Exiting.createManager([Hapi.Server(), Hapi.Server(), Hapi.Server()]);
            const exited = grabExit(manager);

            await manager.start();
            process.kill(process.pid, 'SIGINT');

            const { code, state } = await exited;
            expect(state).to.equal('stopped');
            expect(code).to.equal(0);
        });

        it('on SIGQUIT', async () => {

            const manager = Exiting.createManager([Hapi.Server(), Hapi.Server(), Hapi.Server()]);
            const exited = grabExit(manager);

            await manager.start();
            process.kill(process.pid, 'SIGQUIT');

            const { code, state } = await exited;
            expect(state).to.equal('stopped');
            expect(code).to.equal(0);
        });

        it('on SIGTERM', async () => {

            const manager = Exiting.createManager([Hapi.Server(), Hapi.Server(), Hapi.Server()]);
            const exited = grabExit(manager);

            await manager.start();
            process.kill(process.pid, 'SIGTERM');

            const { code, state } = await exited;
            expect(state).to.equal('stopped');
            expect(code).to.equal(0);
        });
    });

    describe('aborts', () => {

        it('on process.exit with non-zero exit code', async () => {

            const manager = Exiting.createManager([Hapi.Server(), Hapi.Server(), Hapi.Server()]);
            const exited = grabExit(manager, true);

            await manager.start();
            await Hoek.wait(0);

            const { code, state } = await exited.exit(10);
            expect(state).to.equal('errored');
            expect(code).to.equal(10);
        });

        it('on thrown errors', async () => {

            process.removeAllListeners('uncaughtException');         // Disable lab integration

            const manager = Exiting.createManager([Hapi.Server(), Hapi.Server(), Hapi.Server()]);
            const exited = grabExit(manager, true);

            await manager.start();

            // Immitate a throw by faking an uncaughtException

            process.emit('uncaughtException', new Error('fail'));

            const { code, state } = await exited;
            expect(state).to.equal('errored');
            expect(code).to.equal(1);
        });

        it('on non-error throw', async () => {

            process.removeAllListeners('uncaughtException');         // Disable lab integration

            const manager = Exiting.createManager([Hapi.Server(), Hapi.Server(), Hapi.Server()]);
            const exited = grabExit(manager, true);

            await manager.start();

            // Immitate a throw by faking an uncaughtException

            process.emit('uncaughtException', 10);

            const { code, state } = await exited;
            expect(state).to.equal('errored');
            expect(code).to.equal(1);
        });

        it('on "undefined" throw', async () => {

            process.removeAllListeners('uncaughtException');         // Disable lab integration

            const manager = Exiting.createManager([Hapi.Server(), Hapi.Server(), Hapi.Server()]);
            const exited = grabExit(manager, true);

            await manager.start();

            // Immitate a throw by faking an uncaughtException

            process.emit('uncaughtException', undefined);

            const { code, state } = await exited;
            expect(state).to.equal('errored');
            expect(code).to.equal(1);
        });

        it('on unhandled rejections', async () => {

            process.removeAllListeners('unhandledRejection');        // Disable lab integration

            const manager = Exiting.createManager([Hapi.Server(), Hapi.Server(), Hapi.Server()]);
            const exited = grabExit(manager, true);

            await manager.start();

            new Promise((resolve, reject) => reject(new Error('unhandled')));

            const { code, state } = await exited;
            expect(state).to.equal('errored');
            expect(code).to.equal(1);
        });

        it('on thrown errors while prestopping', async () => {

            process.removeAllListeners('uncaughtException');         // Disable lab integration

            const server = new Hapi.Server();
            const manager = new Exiting.Manager([Hapi.Server(), server, Hapi.Server()]);
            const exited = grabExit(manager, true);

            server.ext('onPreStop', () => {

                process.emit('uncaughtException', new Error('fail'));
            });

            await manager.start();
            manager.stop();          // No await

            const { code, state } = await exited;
            expect(state).to.equal('errored');
            expect(code).to.equal(1);
        });

        it('on thrown errors while poststopping', async () => {

            process.removeAllListeners('uncaughtException');         // Disable lab integration

            const server = new Hapi.Server();
            const manager = new Exiting.Manager([Hapi.Server(), server, Hapi.Server()]);
            const exited = grabExit(manager, true);

            server.ext('onPostStop', () => {

                process.emit('uncaughtException', new Error('fail'));
            });

            await manager.start();
            manager.stop();          // No await

            const { code, state } = await exited;
            expect(state).to.equal('errored');
            expect(code).to.equal(1);
        });

        it('on SIGHUP', async () => {

            const manager = Exiting.createManager([Hapi.Server(), Hapi.Server(), Hapi.Server()]);
            const exited = grabExit(manager, true);

            await manager.start();
            process.kill(process.pid, 'SIGHUP');

            const { code, state } = await exited;
            expect(state).to.equal('errored');
            expect(code).to.equal(1);
        });

        it('on server "close"', async () => {

            const server = new Hapi.Server();
            const manager = new Exiting.Manager([Hapi.Server(), server, Hapi.Server()]);
            const exited = grabExit(manager, true);

            await manager.start();
            server.listener.close();

            const { code, state } = await exited;
            expect(state).to.equal('errored');
            expect(code).to.equal(255);
        });

        it('on exit timeout', async () => {

            const server = new Hapi.Server();
            const manager = new Exiting.Manager([Hapi.Server(), server, Hapi.Server()], { exitTimeout: 1 });
            const exited = grabExit(manager, true);

            const preStopped = new Promise((resolve) => {

                server.ext('onPreStop', async () => {

                    await Hoek.wait(100);
                    resolve(manager.state);
                    expect(manager.state).to.equal('timeout');
                });
            });

            await manager.start();

            const { code, state } = await exited.exit(0);
            expect(state).to.equal('timeout');
            expect(code).to.equal(255);

            expect(await preStopped).to.equal('timeout');
        });

        it('on double exit with error', async () => {

            const manager = Exiting.createManager([Hapi.Server(), Hapi.Server(), Hapi.Server()]);
            const exited = grabExit(manager);

            await manager.start();
            await Hoek.wait(0);
            exited.exit(0);
            exited.exit(1);

            const { code, state } = await exited;
            expect(state).to.equal('errored');
            expect(code).to.equal(1);
        });
    });
});
