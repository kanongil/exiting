'use strict';

const Hoek = require('hoek');


const internals = {
    manager: null,
    signals: {
        SIGINT: true,
        SIGQUIT: true,
        SIGTERM: true,
        SIGHUP: false
    },
    processExit: null
};


internals.exit = function (code) {

    const manager = internals.manager;

    if (!manager) {
        return;          // exit processing was disabled
    }

    if (typeof code === 'number' && code > manager.exitCode) {
        manager.exitCode = code;
    }

    if (!manager.exitTimer) {
        manager.exitTimer = setTimeout(() => {

            manager.state = 'timeout';
            return internals.exit(255);
        }, manager.exitTimeout);
    }

    if (manager.state === 'starting') {
        manager.state = 'startAborted';
        return;
    }

    if (manager.state === 'startAborted') {        // wait until started
        return;
    }

    if (manager.state === 'started') {

        internals.manager.server.ext('onPreStop', (server, next) => {

            manager.state = 'prestopped';

            if (manager.exitCode !== 0) {
                return next(new Error('Process aborted'));
            }

            return next();
        });

        internals.stop({ timeout: manager.exitTimeout - 500 }, (err) => {

            if (err) {
                exports.log('Server stop failed:', err.stack);
            }

            return internals.exit();
        });

        return;
    }

    if (manager.state === 'stopping') {        // wait until stopped
        return;
    }

    if (manager.state === 'prestopped' && manager.exitCode === 0) {
        return;
    }

    // Perform actual exit

    internals.processExit(manager.exitCode);
};


internals.abortHandler = function abort() {

    return internals.exit(1);
};


internals.gracefulHandler = function graceful() {

    return internals.exit(0);
};


internals.uncaughtExceptionHandler = function uncaughtException(err) {

    exports.log('Fatal Exception:', (err || {}).stack || err);

    if (internals.manager.state === 'stopping' ||
        internals.manager.state === 'prestopped') {    // Exceptions while stopping advance to error state immediately

        internals.manager.state = 'errored';
    }

    return internals.exit(255);
};


internals.listenerClosedHandler = function close() {

    // If server is closed without stopping, exit with error

    if (/*internals.manager &&*/ internals.manager.state === 'started') {
        return internals.exit(255);
    }
};


internals.stop = function (options, callback) {

    const manager = internals.manager;

    manager.state = 'stopping';
    manager.server.stop(options, (err) => {

        manager.state = err ? 'errored' : 'stopped';
        return callback(err);
    });
};


internals.badExitCheck = function () {

    const state = internals.manager.state;
    if (state !== 'stopped' && state !== 'errored' && state !== 'timeout') {
        exports.log('Process exiting without stopping server (state == ' + state + ')');
    }
};

internals.hasExternalSIGHUPListener = function () {

    const listeners = process.listeners('SIGHUP');
    let externalExists = false;

    listeners.forEach((listener) => {

        if (listener.name !== 'abort' && listener.name !== 'graceful') {
            externalExists = true;
        }
    });

    return externalExists;
};


internals.setupExitHooks = function () {

    process.on('uncaughtException', internals.uncaughtExceptionHandler);

    Object.keys(internals.signals).forEach((signal) => {

        const handler = internals.signals[signal] ? internals.gracefulHandler : internals.abortHandler;
        if (signal === 'SIGHUP' && internals.hasExternalSIGHUPListener()) {
            return;
        }

        process.on(signal, handler);
    });

    process.on('beforeExit', internals.exit);
    process.on('exit', internals.badExitCheck);

    // Monkey patch process.exit()

    internals.processExit = process.exit;
    process.exit = internals.exit;
};


internals.teardownExitHooks = function () {

    process.exit = internals.processExit;

    Object.keys(internals.signals).forEach((signal) => {

        const handler = internals.signals[signal] ? internals.gracefulHandler : internals.abortHandler;
        process.removeListener(signal, handler);
    });

    process.removeListener('beforeExit', internals.exit);
    process.removeListener('exit', internals.badExitCheck);
    process.removeListener('uncaughtException', internals.uncaughtExceptionHandler);

    internals.processExit = null;
};


exports.Manager = function (server, options) {

    if (!(this instanceof exports.Manager)) {
        return new exports.Manager(server, options);
    }

    Hoek.assert(!internals.manager, 'Only one manager can be created');

    options = options || {};

    this.exitTimeout = options.exitTimeout || 5000;

    this.server = server;

    this.state = null;       // ['starting', 'started', 'stopping', 'prestopped', 'stopped', 'startAborted', 'errored', 'timeout']
    this.exitTimer = null;
    this.exitCode = 0;

    internals.manager = this;
};


exports.Manager.prototype.start = function start(callback) {

    const self = this;

    Hoek.assert(typeof callback === 'function', 'Missing required start callback function');

    if (!self.state) {
        internals.setupExitHooks();
    }

    self.state = 'starting';

    self.server.start((err) => {

        const aborted = (self.state === 'startAborted');
        self.state = 'started';

        if (aborted) {        // Note that callback is not triggered when aborted
            return internals.exit();
        }

        // Attach close listeners to catch spurious closes

        for (let i = 0; i < self.server.connections.length; ++i) {
            self.server.connections[i].listener.once('close', internals.listenerClosedHandler);
        }

        return callback(err);
    });

    return this;
};


exports.Manager.prototype.stop = function stop(options, callback) {

    if (typeof options === 'function') {
        callback = options;
        options = {};
    }

    Hoek.assert(typeof callback === 'function', 'Missing required stop callback function');
    Hoek.assert(this.state === 'started', 'Stop requires that server is started');

    this.state = 'stopping';
    return internals.stop(options, callback);
};


exports.log = function () {

    console.error.apply(console, ['[exiting]'].concat(Array.prototype.slice.call(arguments)));
};


exports.reset = function () {

    if (internals.processExit) {
        internals.teardownExitHooks();
    }
    internals.manager = null;
};
