var Hoek = require('hoek');


var internals = {
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

    var manager = internals.manager;

    if (!manager) {
        return;          // exit processing was disabled
    }

    if (typeof code === 'number' && code > manager.exitCode) {
        manager.exitCode = code;
    }

    if (!manager.exitTimer) {
        manager.exitTimer = setTimeout(function () {

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

        internals.manager.server.ext('onPreStop', function (server, next) {

            manager.state = 'prestopped';

            if (manager.exitCode !== 0) {
                return next(new Error('Process aborted'));
            }

            return next();
        });

        internals.stop({ timeout: manager.exitTimeout - 500 }, function (err) {

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


internals.abortHandler = function abort () {

    return internals.exit(1);
};


internals.gracefulHandler = function graceful () {

    return internals.exit(0);
};


internals.uncaughtExceptionHandler = function uncaughtException (err) {

    exports.log('Fatal Exception:', (err || {}).stack || err);

    if (internals.manager.state === 'stopping' ||
        internals.manager.state === 'prestopped') {    // Exceptions while stopping advance to error state immediately

        internals.manager.state = 'errored';
    }

    return internals.exit(255);
};


internals.listenerClosedHandler = function close () {

    // If server is closed without stopping, exit with error

    if (/*internals.manager &&*/ internals.manager.state === 'started') {
        return internals.exit(255);
    }
};


internals.stop = function (options, callback) {

    var manager = internals.manager;

    manager.state = 'stopping';
    manager.server.stop(options, function (err) {

        manager.state = err ? 'errored' : 'stopped';
        return callback(err);
    });
};


internals.badExitCheck = function () {

    var state = internals.manager.state;
    if (state !== 'stopped' && state !== 'errored' && state !== 'timeout') {
        exports.log('Process exiting without stopping server (state == ' + state + ')');
    }
};


internals.setupExitHooks = function () {

    process.on('uncaughtException', internals.uncaughtExceptionHandler);

    var signals = Object.keys(internals.signals);
    for (var idx = 0; idx < signals.length; idx++) {
        var handler = internals.signals[signals[idx]] ? internals.gracefulHandler : internals.abortHandler;
        process.on(signals[idx], handler);
    }

    process.on('beforeExit', internals.exit);
    process.on('exit', internals.badExitCheck);

    // Monkey patch process.exit()

    internals.processExit = process.exit;
    process.exit = internals.exit;
};


internals.teardownExitHooks = function () {

    process.exit = internals.processExit;

    var signals = Object.keys(internals.signals);
    for (var idx = 0; idx < signals.length; idx++) {
        var handler = internals.signals[signals[idx]] ? internals.gracefulHandler : internals.abortHandler;
        process.removeListener(signals[idx], handler);
    }

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


exports.Manager.prototype.start = function start (callback) {

    var self = this;

    Hoek.assert(typeof callback === 'function', 'Missing required start callback function');

    if (!self.state) {
        internals.setupExitHooks();
    }

    self.state = 'starting';

    self.server.start(function (err) {

        var aborted = (self.state === 'startAborted');
        self.state = 'started';

        if (aborted) {        // Note that callback is not triggered when aborted
            return internals.exit();
        }

        // Attach close listeners to catch spurious closes

        for (var idx = 0; idx < self.server.connections.length; idx++) {
            self.server.connections[idx].listener.once('close', internals.listenerClosedHandler);
        }

        return callback(err);
    });

    return this;
};


exports.Manager.prototype.stop = function stop (options, callback) {

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
