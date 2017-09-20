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

    lab.before((done) => {

        // Silence log messages

        const log = Exiting.log;
        Exiting.log = function () {

            const consoleError = console.error;
            console.error = Hoek.ignore;
            log.apply(Exiting, arguments);
            console.error = consoleError;
        };

        done();
    });

    lab.beforeEach((done) => {

        Exiting.reset();
        done();
    });

    lab.afterEach((done) => {

        process.exit = processExit;
        done();
    });

    it('creates new object', (done) => {

        const manager = Exiting.Manager({});
        expect(manager).to.exist();
        expect(manager).to.be.an.instanceof(Exiting.Manager);
        done();
    });

    it('requires a start callback', (done) => {

        const manager = Exiting.Manager({});
        const start = () => {

            manager.start();
        };
        expect(start).to.throw('Missing required start callback function');
        done();
    });

    it('can start and stop without exiting', (done) => {

        const server = new Hapi.Server();
        server.connection();

        const manager = new Exiting.Manager(server).start((err) => {

            expect(err).to.not.exist();

            setImmediate(() => {

                manager.stop((err) => {

                    expect(err).to.not.exist();
                    done();
                });
            });
        });
    });

    it('can restart server', (done) => {

        process.exit = (code) => {

            expect(code).to.equal(0);
            expect(manager.state).to.equal('stopped');
            done();
        };

        const server = new Hapi.Server();
        server.connection();

        const manager = new Exiting.Manager(server).start((err) => {

            expect(err).to.not.exist();

            setImmediate(() => {

                manager.stop((err) => {

                    expect(err).to.not.exist();
                    manager.start((err) => {

                        expect(err).to.not.exist();
                        process.exit(0);
                    });
                });
            });
        });
    });

    it('requires a stop callback', (done) => {

        const server = new Hapi.Server();
        server.connection();

        const stop = () => {

            manager.stop();
        };

        const manager = new Exiting.Manager(server).start((err) => {

            expect(err).to.not.exist();
            expect(stop).to.throw('Missing required stop callback function');
            done();
        });
    });

    it('supports stop options', (done) => {

        const server = new Hapi.Server();
        server.connection();

        const manager = new Exiting.Manager(server).start((err) => {

            expect(err).to.not.exist();
            manager.stop({ timeout: 5 }, (err) => {

                expect(err).to.not.exist();
                done();
            });
        });
    });

    it('alerts on unknown exit', (done) => {

        const server = new Hapi.Server();
        server.connection();

        const manager = new Exiting.Manager(server).start((err) => {

            expect(err).to.not.exist();

            const log = Exiting.log;
            Exiting.log = (message) => {

                Exiting.log = log;

                expect(message).to.equal('Process exiting without stopping server (state == started)');
                manager.stop((err) => {

                    expect(err).to.not.exist();
                    done();
                });
            };

            // Fake a spurious process "exit" event

            process.emit('exit', 0);
        });
    });

    describe('exits gracefully', () => {

        it('on process.exit with code 0', (done) => {

            process.exit = (code) => {

                process.emit('exit', code);

                expect(code).to.equal(0);
                expect(manager.state).to.equal('stopped');
                done();
            };

            const server = new Hapi.Server();
            server.connection();

            const manager = new Exiting.Manager(server).start((err) => {

                expect(err).to.not.exist();

                setImmediate(() => {

                    process.exit(0);
                });
            });
        });

        it('while starting', (done) => {

            process.exit = (code) => {

                expect(code).to.equal(0);
                expect(manager.state).to.equal('stopped');
                done();
            };

            const server = new Hapi.Server();
            server.connection();

            const manager = new Exiting.Manager(server).start(Hoek.ignore);

            process.exit(0);
            process.exit(0);
        });

        it('on double exit', (done) => {

            process.exit = (code) => {

                expect(code).to.equal(0);
                expect(manager.state).to.equal('stopped');
                done();
            };

            const server = new Hapi.Server();
            server.connection();

            const manager = new Exiting.Manager(server).start((err) => {

                expect(err).to.not.exist();

                setImmediate(() => {

                    process.exit(0);
                    process.exit(0);
                });
            });
        });

        it('on double exit with preStop delay', (done) => {

            process.exit = (code) => {

                expect(code).to.equal(0);
                expect(manager.state).to.equal('stopped');
                done();
            };

            const server = new Hapi.Server();
            server.connection();

            server.ext('onPreStop', (server1, next) => {

                return setImmediate(next);
            });

            const manager = new Exiting.Manager(server).start((err) => {

                expect(err).to.not.exist();

                setImmediate(() => {

                    process.exit(0);
                    process.exit(0);
                });
            });
        });

        it('on SIGINT', (done) => {

            process.exit = (code) => {

                expect(code).to.equal(0);
                expect(manager.state).to.equal('stopped');
                done();
            };

            const server = new Hapi.Server();
            server.connection();

            const manager = new Exiting.Manager(server).start((err) => {

                expect(err).to.not.exist();

                process.kill(process.pid, 'SIGINT');
            });
        });

        it('on SIGQUIT', (done) => {

            process.exit = (code) => {

                expect(code).to.equal(0);
                expect(manager.state).to.equal('stopped');
                done();
            };

            const server = new Hapi.Server();
            server.connection();

            const manager = new Exiting.Manager(server).start((err) => {

                expect(err).to.not.exist();

                process.kill(process.pid, 'SIGQUIT');
            });
        });

        it('on SIGTERM', (done) => {

            process.exit = (code) => {

                expect(code).to.equal(0);
                expect(manager.state).to.equal('stopped');
                done();
            };

            const server = new Hapi.Server();
            server.connection();

            const manager = new Exiting.Manager(server).start((err) => {

                expect(err).to.not.exist();

                process.kill(process.pid, 'SIGTERM');
            });
        });
    });

    describe('aborts', () => {

        it('on process.exit with non-zero exit code', (done) => {

            process.exit = (code) => {

                process.emit('exit', code);

                expect(code).to.equal(10);
                expect(manager.state).to.equal('errored');
                done();
            };

            const server = new Hapi.Server();
            server.connection();

            const manager = new Exiting.Manager(server).start((err) => {

                expect(err).to.not.exist();

                setImmediate(() => {

                    process.exit(10);
                });
            });
        });

        it('on thrown errors', (done) => {

            process.exit = (code) => {

                expect(code).to.equal(255);
                expect(manager.state).to.equal('errored');
                done();
            };

            const server = new Hapi.Server();
            server.connection();

            const manager = new Exiting.Manager(server).start((err) => {

                expect(err).to.not.exist();

                // Immitate a throw by faking an uncaughtException

                process.emit('uncaughtException', new Error('fail'));
            });
        });

        it('on non-error throw', (done) => {

            process.exit = (code) => {

                expect(code).to.equal(255);
                expect(manager.state).to.equal('errored');
                done();
            };

            const server = new Hapi.Server();
            server.connection();

            const manager = new Exiting.Manager(server).start((err) => {

                expect(err).to.not.exist();

                process.emit('uncaughtException', 10);
            });
        });

        it('on "undefined" throw', (done) => {

            process.exit = (code) => {

                expect(code).to.equal(255);
                expect(manager.state).to.equal('errored');
                done();
            };

            const server = new Hapi.Server();
            server.connection();

            const manager = new Exiting.Manager(server).start((err) => {

                expect(err).to.not.exist();

                process.emit('uncaughtException', undefined);
            });
        });

        it('on thrown errors while prestopping', (done) => {

            process.exit = (code) => {

                expect(code).to.equal(255);
                expect(manager.state).to.equal('errored');
                done();
            };

            const server = new Hapi.Server();
            server.connection();

            server.ext('onPreStop', (server1, next) => {

                process.emit('uncaughtException', new Error('fail'));
            });

            const manager = new Exiting.Manager(server).start((err) => {

                expect(err).to.not.exist();

                manager.stop(Hoek.ignore);
            });
        });

        it('on thrown errors while poststopping', (done) => {

            process.exit = (code) => {

                expect(code).to.equal(255);
                expect(manager.state).to.equal('errored');
                done();
            };

            const server = new Hapi.Server();
            server.connection();

            server.ext('onPostStop', (server1, next) => {

                process.emit('uncaughtException', new Error('fail'));
            });

            const manager = new Exiting.Manager(server).start((err) => {

                expect(err).to.not.exist();

                manager.stop(Hoek.ignore);
            });
        });

        it('on SIGHUP', (done) => {

            process.exit = (code) => {

                expect(code).to.equal(1);
                expect(manager.state).to.equal('errored');
                done();
            };

            const server = new Hapi.Server();
            server.connection();

            const manager = new Exiting.Manager(server).start((err) => {

                expect(err).to.not.exist();

                process.kill(process.pid, 'SIGHUP');
            });
        });

        it('on SIGHUP when external listener named "abort" exists', (done) => {

            const abort = function abort() {

                // nothing to do here
            };

            process.on('SIGHUP', abort);

            process.exit = (code) => {

                expect(code).to.equal(1);
                expect(manager.state).to.equal('errored');
                done();
            };

            const server = new Hapi.Server();
            server.connection();

            const manager = new Exiting.Manager(server).start((err) => {

                expect(err).to.not.exist();

                process.emit('SIGHUP');
            });
        });

        it('on server "close"', (done) => {

            process.exit = (code) => {

                expect(code).to.equal(255);
                expect(manager.state).to.equal('errored');
                done();
            };

            const server = new Hapi.Server();
            server.connection();

            const manager = new Exiting.Manager(server).start((err) => {

                expect(err).to.not.exist();

                process.nextTick(() => {

                    server.listener.close();
                });
            });
        });

        it('on exit timeout', (done) => {

            process.exit = (code) => {

                expect(code).to.equal(255);
                expect(manager.state).to.equal('timeout');
                Exiting.reset(); // reset immediately so we don't see double exits
            };

            const server = new Hapi.Server();
            server.connection();

            server.ext('onPreStop', (srv, next) => {

                setTimeout(() => {

                    expect(manager.state).to.equal('timeout');
                    next();
                    done();
                }, 100);
            });

            const manager = new Exiting.Manager(server, { exitTimeout: 1 }).start((err) => {

                expect(err).to.not.exist();

                process.exit(0);
            });
        });
    });

    describe('allows SIGHUP', () => {

        it('to be handled if a listener exists', (done) => {

            process.removeAllListeners('SIGHUP');

            process.exit = (code) => {

                expect(manager.state).to.equal('stopped');
                done();
            };

            process.on('SIGHUP', () => {

                expect(manager.state).to.equal('started');
                process.exit(0);
            });

            const server = new Hapi.Server();
            server.connection();

            const manager = new Exiting.Manager(server).start((err) => {

                expect(err).to.not.exist();

                process.emit('SIGHUP');
            });
        });
    });
});
