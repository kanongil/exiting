'use strict';

const Bounce = require('@hapi/bounce');
const Hoek = require('@hapi/hoek');


const internals = {
    manager: null,
    signals: new Map([
        ['SIGINT', true],
        ['SIGQUIT', true],
        ['SIGTERM', true],
        ['SIGHUP', false]
    ]),
    listeners: new Map(),
    processExit: null
};


internals.addExitHook = function (event, handler, prepend = false) {

    prepend ? process.prependListener(event, handler) : process.on(event, handler);
    internals.listeners.set(event, handler);
};


internals.teardownExitHooks = function () {

    process.exit = internals.processExit;

    for (const listener of internals.listeners) {
        process.removeListener(...listener);
    }

    internals.listeners.clear();
    internals.processExit = null;
};


exports.Manager = class {

    exitTimeout = 5000;
    servers;
    state;       // 'starting', 'started', 'stopping', 'prestopped', 'stopped', 'startAborted', 'errored', 'timeout'
    exitTimer;
    exitCode = 0;
    active = true;

    constructor(servers, options = {}) {

        Hoek.assert(!internals.manager, 'Only one manager can be created');

        this.exitTimeout = options.exitTimeout || this.exitTimeout;
        this.servers = typeof servers[Symbol.iterator] === 'function' ? [...servers] : [servers];

        internals.manager = this;
    }

    async start() {

        if (!this.state) {
            this._setupExitHooks();
        }

        this.state = 'starting';

        let startError = null;
        let active = [];

        const safeStop = async (server) => {

            try {
                await server.stop();
            }
            catch (err) {
                Bounce.rethrow(err, 'system');
            }
        };

        const safeStart = async (server) => {

            // "atomic" start, which immediately stops servers on errors
            try {
                await server.start();
                if (startError) {
                    throw new Error('Start aborted');
                }

                active.push(server);
            }
            catch (err) {
                Bounce.rethrow(err, 'system');

                if (!startError) {
                    startError = err;
                }

                const stopping = active.concat(server);
                active = [];
                await Promise.all(stopping.map(safeStop));
            }
        };

        try {
            await Promise.all(this.servers.map(safeStart));
        }
        finally {
            const aborted = (this.state === 'startAborted');
            this.state = startError ? 'errored' : 'started';

            if (aborted) {                    // Note that throw is not returned when aborted
                return this._exit();          // eslint-disable-line no-unsafe-finally
            }
        }

        if (startError) {
            throw startError;
        }

        // Attach close listeners to catch spurious closes

        for (const server of this.servers) {
            server.listener.once('close', this._listenerClosedHandler.bind(this));
        }

        return this;
    }

    stop(options = {}) {

        Hoek.assert(this.state === 'started', 'Stop requires that server is started');

        return this._stop(options);
    }

    deactivate() {

        if (this.active) {
            if (internals.processExit) {
                internals.teardownExitHooks();
            }

            clearTimeout(this.exitTimer);
            internals.manager = undefined;

            this.active = false;
        }
    }

    // Private

    async _exit(code) {

        if (!this.active) {
            return;
        }

        if (typeof code === 'number' && code > this.exitCode) {
            this.exitCode = code;
        }

        if (!this.exitTimer) {
            this.exitTimer = setTimeout(() => {

                this.state = 'timeout';
                return this._exit(255);
            }, this.exitTimeout);
        }

        if (this.state === 'starting') {
            this.state = 'startAborted';
            return;
        }

        if (this.state === 'startAborted') {        // wait until started
            return;
        }

        if (this.state === 'started') {

            // change state to prestopped as soon as the first server is stopping
            for (const server of this.servers) {
                server.ext('onPreStop', this._listenerStopHandler.bind(this));
            }

            try {
                await this._stop({ timeout: this.exitTimeout - 500 });
            }
            catch (err) {
                this._log('Server stop failed:', err.stack);
            }

            return this._exit();
        }

        if (this.state === 'stopping') {        // wait until stopped
            return;
        }

        if (this.state === 'prestopped') {
            if (this.exitCode === 0) {
                return;                            // defer to prestop logic
            }

            this.state = 'errored';
        }

        // Perform actual exit

        internals.processExit(this.exitCode);
    }

    _abortHandler(event) {

        if (process.listenerCount(event) === 1) {
            return this._exit(1);
        }
    }

    _gracefulHandler(event) {

        if (process.listenerCount(event) === 1) {
            return this._exit(0);
        }
    }

    _unhandledError(type, err) {

        if (err instanceof exports.ProcessExitError) {     // Ignore ProcessExitError, since we are already handling it
            return;
        }

        this._log(`Fatal ${type}:`, (err || {}).stack || err);

        if (this.state === 'stopping') {    // Exceptions while stopping advance to error state immediately
            this.state = 'errored';
        }

        return this._exit(1);
    }

    _uncaughtExceptionHandler(err) {

        return this._unhandledError('exception', err);
    }

    _unhandledRejectionHandler(err) {

        return this._unhandledError('rejection', err);
    }

    _listenerClosedHandler() {

        // If server is closed without stopping, exit with error

        if (this.state === 'started') {
            return this._exit(255);
        }
    }

    _listenerStopHandler(/*server*/) {

        this.state = 'prestopped';

        if (this.exitCode !== 0) {
            throw new Error('Process aborted');
        }
    }

    async _stop(options) {

        try {
            this.state = 'stopping';
            await Promise.all(this.servers.map((server) => server.stop(options)));
            this.state = 'stopped';
        }
        catch (err) {
            this.state = 'errored';
            throw err;
        }
    }

    _badExitCheck() {

        if (this.state !== 'stopped' && this.state !== 'errored' && this.state !== 'timeout') {
            this._log('Process exiting without stopping server (state == ' + this.state + ')');
        }
    }

    _setupExitHooks() {

        internals.addExitHook('uncaughtException', this._uncaughtExceptionHandler.bind(this));
        internals.addExitHook('unhandledRejection', this._unhandledRejectionHandler.bind(this));

        for (const [event, graceful] of internals.signals) {
            const handler = graceful ? this._gracefulHandler.bind(this, event) : this._abortHandler.bind(this, event);
            internals.addExitHook(event, handler, true);
        }

        internals.addExitHook('beforeExit', this._exit.bind(this));
        internals.addExitHook('exit', this._badExitCheck.bind(this));

        // Monkey patch process.exit()

        internals.processExit = process.exit;
        process.exit = (code) => {

            this._exit(code);

            // Since we didn't actually exit, throw an error to escape the current scope

            throw new exports.ProcessExitError();
        };
    }

    _log(...args) {

        try {
            return exports.log(...args);
        }
        catch {}
    }
};


exports.createManager = function (servers, options) {

    return new exports.Manager(servers, options);
};


exports.log = function (...args) {

    console.error('[exiting]', ...args);
};


exports.reset = function () {

    if (internals.manager) {
        internals.manager.deactivate();
    }
};


exports.ProcessExitError = class extends TypeError {

    constructor() {

        super('process.exit() was called');
    }
};
