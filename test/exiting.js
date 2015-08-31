// Load modules

var Code = require('code');
var Exiting = require('../lib');
var Hapi = require('hapi');
var Hoek = require('hoek');
var Lab = require('lab');


// Declare internals

var internals = {};


// Test shortcuts

var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var expect = Code.expect;


describe('Manager', function () {

    var processExit = process.exit;

    lab.before(function (done) {

        // Silence log messages

        var log = Exiting.log;
        Exiting.log = function () {

            var consoleError = console.error;
            console.error = Hoek.ignore;
            log.apply(Exiting, arguments);
            console.error = consoleError;
        };

        done();
    });

    lab.beforeEach(function (done) {

        Exiting.reset();
        done();
    });

    lab.afterEach(function (done) {

        process.exit = processExit;
        done();
    });

    it('creates new object', function (done) {

        var manager = Exiting.Manager({});
        expect(manager).to.exist();
        expect(manager).to.be.an.instanceof(Exiting.Manager);
        done();
    });

    it('requires a start callback', function (done) {

        var manager = Exiting.Manager({});
        var start = function () {

            manager.start();
        };
        expect(start).to.throw('Missing required start callback function');
        done();
    });

    it('can start and stop without exiting', function (done) {

        var server = new Hapi.Server();
        server.connection();

        var manager = new Exiting.Manager(server).start(function (err) {

            expect(err).to.not.exist();

            setImmediate(function () {

                manager.stop(function (err) {

                    expect(err).to.not.exist();
                    done();
                });
            });
        });
    });

    it('can restart server', function (done) {

        process.exit = function (code) {

            expect(code).to.equal(0);
            expect(manager.state).to.equal('stopped');
            done();
        };

        var server = new Hapi.Server();
        server.connection();

        var manager = new Exiting.Manager(server).start(function (err) {

            expect(err).to.not.exist();

            setImmediate(function () {

                manager.stop(function (err) {

                    expect(err).to.not.exist();
                    manager.start(function (err) {

                        expect(err).to.not.exist();
                        process.exit(0);
                    });
                });
            });
        });
    });

    it('requires a stop callback', function (done) {

        var server = new Hapi.Server();
        server.connection();

        var stop = function () {

            manager.stop();
        };

        var manager = new Exiting.Manager(server).start(function (err) {

            expect(err).to.not.exist();
            expect(stop).to.throw('Missing required stop callback function');
            done();
        });
    });

    it('supports stop options', function (done) {

        var server = new Hapi.Server();
        server.connection();

        var manager = new Exiting.Manager(server).start(function (err) {

            expect(err).to.not.exist();
            manager.stop({ timeout: 5 }, function (err) {

                expect(err).to.not.exist();
                done();
            });
        });
    });

    it('alerts on unknown exit', function (done) {

        var server = new Hapi.Server();
        server.connection();

        var manager = new Exiting.Manager(server).start(function (err) {

            expect(err).to.not.exist();

            var log = Exiting.log;
            Exiting.log = function (message) {

                Exiting.log = log;

                expect(message).to.equal('Process exiting without stopping server (state == started)');
                manager.stop(function (err) {

                    expect(err).to.not.exist();
                    done();
                });
            };

            // Fake a spurious process "exit" event

            process.emit('exit', 0);
        });
    });

    describe('exits gracefully', function () {

        it('on process.exit with code 0', function (done) {

            process.exit = function (code) {

                process.emit('exit', code);

                expect(code).to.equal(0);
                expect(manager.state).to.equal('stopped');
                done();
            };

            var server = new Hapi.Server();
            server.connection();

            var manager = new Exiting.Manager(server).start(function (err) {

                expect(err).to.not.exist();

                setImmediate(function () {

                    process.exit(0);
                });
            });
        });

        it('while starting', function (done) {

            process.exit = function (code) {

                expect(code).to.equal(0);
                expect(manager.state).to.equal('stopped');
                done();
            };

            var server = new Hapi.Server();
            server.connection();

            var manager = new Exiting.Manager(server).start(Hoek.ignore);

            process.exit(0);
            process.exit(0);
        });

        it('on double exit', function (done) {

            process.exit = function (code) {

                expect(code).to.equal(0);
                expect(manager.state).to.equal('stopped');
                done();
            };

            var server = new Hapi.Server();
            server.connection();

            var manager = new Exiting.Manager(server).start(function (err) {

                expect(err).to.not.exist();

                setImmediate(function () {

                    process.exit(0);
                    process.exit(0);
                });
            });
        });

        it('on double exit with preStop delay', function (done) {

            process.exit = function (code) {

                expect(code).to.equal(0);
                expect(manager.state).to.equal('stopped');
                done();
            };

            var server = new Hapi.Server();
            server.connection();

            server.ext('onPreStop', function (server1, next) {

                return setImmediate(next);
            });

            var manager = new Exiting.Manager(server).start(function (err) {

                expect(err).to.not.exist();

                setImmediate(function () {

                    process.exit(0);
                    process.exit(0);
                });
            });
        });

        it('on SIGINT', function (done) {

            process.exit = function (code) {

                expect(code).to.equal(0);
                expect(manager.state).to.equal('stopped');
                done();
            };

            var server = new Hapi.Server();
            server.connection();

            var manager = new Exiting.Manager(server).start(function (err) {

                expect(err).to.not.exist();

                process.kill(process.pid, 'SIGINT');
            });
        });

        it('on SIGQUIT', function (done) {

            process.exit = function (code) {

                expect(code).to.equal(0);
                expect(manager.state).to.equal('stopped');
                done();
            };

            var server = new Hapi.Server();
            server.connection();

            var manager = new Exiting.Manager(server).start(function (err) {

                expect(err).to.not.exist();

                process.kill(process.pid, 'SIGQUIT');
            });
        });

        it('on SIGTERM', function (done) {

            process.exit = function (code) {

                expect(code).to.equal(0);
                expect(manager.state).to.equal('stopped');
                done();
            };

            var server = new Hapi.Server();
            server.connection();

            var manager = new Exiting.Manager(server).start(function (err) {

                expect(err).to.not.exist();

                process.kill(process.pid, 'SIGTERM');
            });
        });
    });

    describe('aborts', function () {

        it('on process.exit with non-zero exit code', function (done) {

            process.exit = function (code) {

                process.emit('exit', code);

                expect(code).to.equal(10);
                expect(manager.state).to.equal('errored');
                done();
            };

            var server = new Hapi.Server();
            server.connection();

            var manager = new Exiting.Manager(server).start(function (err) {

                expect(err).to.not.exist();

                setImmediate(function () {

                    process.exit(10);
                });
            });
        });

        it('on thrown errors', function (done) {

            process.exit = function (code) {

                expect(code).to.equal(255);
                expect(manager.state).to.equal('errored');
                done();
            };

            var server = new Hapi.Server();
            server.connection();

            var manager = new Exiting.Manager(server).start(function (err) {

                expect(err).to.not.exist();

                // Immitate a throw by faking an uncaughtException

                process.emit('uncaughtException', new Error('fail'));
            });
        });

        it('on non-error throw', function (done) {

            process.exit = function (code) {

                expect(code).to.equal(255);
                expect(manager.state).to.equal('errored');
                done();
            };

            var server = new Hapi.Server();
            server.connection();

            var manager = new Exiting.Manager(server).start(function (err) {

                expect(err).to.not.exist();

                process.emit('uncaughtException', 10);
            });
        });

        it('on "undefined" throw', function (done) {

            process.exit = function (code) {

                expect(code).to.equal(255);
                expect(manager.state).to.equal('errored');
                done();
            };

            var server = new Hapi.Server();
            server.connection();

            var manager = new Exiting.Manager(server).start(function (err) {

                expect(err).to.not.exist();

                process.emit('uncaughtException', undefined);
            });
        });

        it('on thrown errors while prestopping', function (done) {

            process.exit = function (code) {

                expect(code).to.equal(255);
                expect(manager.state).to.equal('errored');
                done();
            };

            var server = new Hapi.Server();
            server.connection();

            server.ext('onPreStop', function (server1, next) {

                process.emit('uncaughtException', new Error('fail'));
            });

            var manager = new Exiting.Manager(server).start(function (err) {

                expect(err).to.not.exist();

                manager.stop(Hoek.ignore);
            });
        });

        it('on thrown errors while poststopping', function (done) {

            process.exit = function (code) {

                expect(code).to.equal(255);
                expect(manager.state).to.equal('errored');
                done();
            };

            var server = new Hapi.Server();
            server.connection();

            server.ext('onPostStop', function (server1, next) {

                process.emit('uncaughtException', new Error('fail'));
            });

            var manager = new Exiting.Manager(server).start(function (err) {

                expect(err).to.not.exist();

                manager.stop(Hoek.ignore);
            });
        });

        it('on SIGHUP', function (done) {

            process.exit = function (code) {

                expect(code).to.equal(1);
                expect(manager.state).to.equal('errored');
                done();
            };

            var server = new Hapi.Server();
            server.connection();

            var manager = new Exiting.Manager(server).start(function (err) {

                expect(err).to.not.exist();

                process.kill(process.pid, 'SIGHUP');
            });
        });

        it('on server "close"', function (done) {

            process.exit = function (code) {

                expect(code).to.equal(255);
                expect(manager.state).to.equal('errored');
                done();
            };

            var server = new Hapi.Server();
            server.connection();

            var manager = new Exiting.Manager(server).start(function (err) {

                expect(err).to.not.exist();

                process.nextTick(function () {

                    server.listener.close();
                });
            });
        });

        it('on exit timeout', function (done) {

            process.exit = function (code) {

                expect(code).to.equal(255);
                expect(manager.state).to.equal('timeout');
                Exiting.reset(); // reset immediately so we don't see double exits
            };

            var server = new Hapi.Server();
            server.connection();

            server.ext('onPreStop', function (srv, next) {

                setTimeout(function () {

                    expect(manager.state).to.equal('timeout');
                    next();
                    done();
                }, 100);
            });

            var manager = new Exiting.Manager(server, { exitTimeout: 1 }).start(function (err) {

                expect(err).to.not.exist();

                process.exit(0);
            });
        });
    });
});
