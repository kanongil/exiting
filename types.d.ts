import { Server } from '@hapi/hapi';

export interface ExitingManagerOptions {
    exitTimeout: number
}

export class Manager<S = Server | Server[], O = ExitingManagerOptions> {

    exitTimeout: number;
    servers: Server[];
    state: 'starting' | 'started' | 'stopping' | 'prestopped' | 'stopped' | 'startAborted' | 'errored' | 'timeout';
    exitTimer: number;
    exitCode: number;
    active: boolean

    constructor(servers: S, options: O)

    /**
     * Starts the Hapi servers.
     * Returns manager if the server starts succcessfully.
     */
    start(): Promise<Manager | void>

    /**
     * Stops the Hapi servers.
     * Throws if any server fails to stop.
     */
    stop(): Promise<Error | void>

    /**
     * Removes process listeners and resets process exit
     */
    deactive(): Promise<void>
}

/**
 * Creates a new manager for given servers
 * @param servers
 * @param options
 */
export function createManager <
    S = Server | Server[],
    O = ExitingManagerOptions
>(
    servers: S,
    options: O
): Manager<S, O>

/**
 * Console.error helper
 * @param args log arguments
 */
export function log (...args: any[]): void;

/**
 * Deactivates the existing manager
 */
export function reset(): void

/**
 * Custom exiting error thrown when process.exit() is called
 */
export class ProcessExitError extends TypeError {}

