'use strict';

// Load modules

const Code = require('code');
const Exiting = require('../lib');
const Hapi = require('hapi');
const Hoek = require('hoek');
const Lab = require('lab');


// Declare internals

const internals = {};


// Test shortcuts

const lab = exports.lab = Lab.script();
const describe = lab.describe;
const it = lab.it;
const expect = Code.expect;


describe('Manager', () => {

    const processExit = process.exit;

    const grabExit = (manager, emit) => {

        return new Promise((resolve) => {

            process.exit = (code) => {

                if (emit) {
                    process.emit('exit', code);
                }

                resolve({ code, state: manager.state });
            };
        });
    };

    lab.before(async () => {

        // Silence log messages

        const log = Exiting.log;
        Exiting.log = function () {

            const consoleError = console.error;
            console.error = Hoek.ignore;
            log.apply(Exiting, arguments);
            console.error = consoleError;
        };
    });

    lab.beforeEach(async () => {

        Exiting.reset();
    });

    lab.afterEach(async () => {

        process.exit = processExit;
    });

    it('creates new object', async () => {

        const manager = Exiting.Manager({});
        expect(manager).to.exist();
        expect(manager).to.be.an.instanceof(Exiting.Manager);
    });

    it('can start and stop without exiting', async () => {

        const server = new Hapi.Server();
        const manager = new Exiting.Manager(server);

        await manager.start();
        await Hoek.wait(0);
        await manager.stop();
    });

    it('can restart server', async () => {

        const server = new Hapi.Server();
        const manager = new Exiting.Manager(server);
        const exited = grabExit(manager);

        await manager.start();
        await Hoek.wait(0);
        await manager.stop();

        await manager.start();

        process.exit(0);

        const { code, state } = await exited;
        expect(state).to.equal('stopped');
        expect(code).to.equal(0);
    });

    it('supports stop options', async () => {

        const server = new Hapi.Server();
        const manager = new Exiting.Manager(server);

        await manager.start();
        await manager.stop({ timeout: 5 });
    });

    it('alerts on unknown exit', async () => {

        const server = new Hapi.Server();
        const manager = new Exiting.Manager(server);

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

        const server = new Hapi.Server();
        const manager = new Exiting.Manager(server);

        server.ext('onPreStart', () => {

            throw new Error('start fail');
        });

        await expect(manager.start()).to.reject(Error, 'start fail');
    });

    it('cancels exit when reset', async () => {

        const server = new Hapi.Server();
        const manager = new Exiting.Manager(server);

        server.ext('onPreStop', () => {

            Exiting.reset();
        });

        await manager.start();
        await manager.stop();
    });

    it('cancels exit when reset after close', async () => {

        const server = new Hapi.Server();
        const manager = new Exiting.Manager(server);

        server.ext('onPostStop', () => {

            Exiting.reset();
        });

        await manager.start();
        process.exit(0);
    });

    describe('exits gracefully', () => {

        it('on process.exit with code 0', async () => {

            const server = new Hapi.Server();
            const manager = new Exiting.Manager(server);
            const exited = grabExit(manager, true);

            await manager.start();
            await Hoek.wait(0);
            process.exit(0);

            const { code, state } = await exited;
            expect(state).to.equal('stopped');
            expect(code).to.equal(0);
        });

        it('while starting', async () => {

            const server = new Hapi.Server();
            const manager = new Exiting.Manager(server);
            const exited = grabExit(manager);

            manager.start();     // No await here

            process.exit(0);
            process.exit(0);

            const { code, state } = await exited;
            expect(state).to.equal('stopped');
            expect(code).to.equal(0);
        });

        it('on double exit', async () => {

            const server = new Hapi.Server();
            const manager = new Exiting.Manager(server);
            const exited = grabExit(manager);

            await manager.start();
            await Hoek.wait(0);
            process.exit(0);
            process.exit(0);

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
            process.exit(0);
            process.exit(0);

            const { code, state } = await exited;
            expect(state).to.equal('stopped');
            expect(code).to.equal(0);
        });

        it('on SIGINT', async () => {

            const server = new Hapi.Server();
            const manager = new Exiting.Manager(server);
            const exited = grabExit(manager);

            await manager.start();
            process.kill(process.pid, 'SIGINT');

            const { code, state } = await exited;
            expect(state).to.equal('stopped');
            expect(code).to.equal(0);
        });

        it('on SIGQUIT', async () => {

            const server = new Hapi.Server();
            const manager = new Exiting.Manager(server);
            const exited = grabExit(manager);

            await manager.start();
            process.kill(process.pid, 'SIGQUIT');

            const { code, state } = await exited;
            expect(state).to.equal('stopped');
            expect(code).to.equal(0);
        });

        it('on SIGTERM', async () => {

            const server = new Hapi.Server();
            const manager = new Exiting.Manager(server);
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

            const server = new Hapi.Server();
            const manager = new Exiting.Manager(server);
            const exited = grabExit(manager, true);

            await manager.start();
            await Hoek.wait(0);
            process.exit(10);

            const { code, state } = await exited;
            expect(state).to.equal('errored');
            expect(code).to.equal(10);
        });

        it('on thrown errors', async () => {

            const server = new Hapi.Server();
            const manager = new Exiting.Manager(server);
            const exited = grabExit(manager, true);

            await manager.start();

            // Immitate a throw by faking an uncaughtException

            process.emit('uncaughtException', new Error('fail'));

            const { code, state } = await exited;
            expect(state).to.equal('errored');
            expect(code).to.equal(255);
        });

        it('on non-error throw', async () => {

            const server = new Hapi.Server();
            const manager = new Exiting.Manager(server);
            const exited = grabExit(manager, true);

            await manager.start();

            // Immitate a throw by faking an uncaughtException

            process.emit('uncaughtException', 10);

            const { code, state } = await exited;
            expect(state).to.equal('errored');
            expect(code).to.equal(255);
        });

        it('on "undefined" throw', async () => {

            const server = new Hapi.Server();
            const manager = new Exiting.Manager(server);
            const exited = grabExit(manager, true);

            await manager.start();

            // Immitate a throw by faking an uncaughtException

            process.emit('uncaughtException', undefined);

            const { code, state } = await exited;
            expect(state).to.equal('errored');
            expect(code).to.equal(255);
        });

        it('on thrown errors while prestopping', async () => {

            const server = new Hapi.Server();
            const manager = new Exiting.Manager(server);
            const exited = grabExit(manager, true);

            server.ext('onPreStop', () => {

                process.emit('uncaughtException', new Error('fail'));
            });

            await manager.start();
            manager.stop();          // No await

            const { code, state } = await exited;
            expect(state).to.equal('errored');
            expect(code).to.equal(255);
        });

        it('on thrown errors while poststopping', async () => {

            const server = new Hapi.Server();
            const manager = new Exiting.Manager(server);
            const exited = grabExit(manager, true);

            server.ext('onPostStop', () => {

                process.emit('uncaughtException', new Error('fail'));
            });

            await manager.start();
            manager.stop();          // No await

            const { code, state } = await exited;
            expect(state).to.equal('errored');
            expect(code).to.equal(255);
        });

        it('on SIGHUP', async () => {

            const server = new Hapi.Server();
            const manager = new Exiting.Manager(server);
            const exited = grabExit(manager, true);

            await manager.start();
            process.kill(process.pid, 'SIGHUP');

            const { code, state } = await exited;
            expect(state).to.equal('errored');
            expect(code).to.equal(1);
        });

        it('on server "close"', async () => {

            const server = new Hapi.Server();
            const manager = new Exiting.Manager(server);
            const exited = grabExit(manager, true);

            await manager.start();
            server.listener.close();

            const { code, state } = await exited;
            expect(state).to.equal('errored');
            expect(code).to.equal(255);
        });

        it('on exit timeout', async () => {

            const server = new Hapi.Server();
            const manager = new Exiting.Manager(server, { exitTimeout: 1 });
            const exited = grabExit(manager, true);

            const preStopped = new Promise((resolve) => {

                server.ext('onPreStop', async () => {

                    await Hoek.wait(100);
                    resolve(manager.state);
                    expect(manager.state).to.equal('timeout');
                });
            });

            await manager.start();
            process.exit(0);

            const { code, state } = await exited;
            expect(state).to.equal('timeout');
            expect(code).to.equal(255);

            expect(await preStopped).to.equal('timeout');
        });
    });
});
