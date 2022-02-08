import * as http from 'http';

// We can't use the DT @hapi/hapi typings, so declare something that matches what we use

interface HapiServerInterface {

    start(...args: any[]): Promise<any>;

    stop(options?: {}, ...args: any[]): Promise<any>;

    ext(...args: any[]): any;

    listener: http.Server;
}

export interface ManagerOptions {

    /**
     * In milliseconds. Default 5000.
     */
    exitTimeout: number;
}

export class Manager<S extends HapiServerInterface> {

    readonly servers: readonly Omit<S, 'stop' | 'start'>[];
    readonly state?: 'starting' | 'started' | 'stopping' | 'prestopped' | 'stopped' | 'startAborted' | 'errored' | 'timeout';

    constructor(servers: S | Iterable<S>, options?: ManagerOptions);

    /**
     * Starts the Hapi servers.
     * 
     * Returns manager if the server starts succcessfully.
     */
    start(): Promise<this | void>;

    /**
     * Stops the Hapi servers.
     * 
     * Rejects if any server fails to stop.
     */
    stop(): Promise<void>;

    /**
     * Removes process listeners and resets process exit.
     */
    deactivate(): void;
}

/**
 * Creates a new manager for given servers.
 * 
 * @param servers
 * @param options
 */
export function createManager<S extends HapiServerInterface>(
    servers: S | Iterable<S>,
    options?: ManagerOptions
): Manager<S>;

/**
 * Console.error helper.
 * 
 * @param args log arguments
 */
export function log(...args: any[]): void;

/**
 * Deactivates the existing manager.
 */
export function reset(): void;

/**
 * Custom exiting error thrown when process.exit() is called.
 */
export class ProcessExitError extends TypeError {
}
