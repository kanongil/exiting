import { Server } from '@hapi/hapi';
import { ExitingManagerOptions, createManager, Manager, ProcessExitError } from '..';

(async () => {

    const manager = createManager(new Server, {
        exitTimeout: 30 * 1000
    });


    const x = new ProcessExitError();

    if (x instanceof TypeError) {

        console.log('error!');
    }

    await manager.start();
    await manager.stop();

    await manager.deactive();


    const options: ExitingManagerOptions = {
        exitTimeout: 30 * 1000
    };

    const manager2 = new Manager(new Server, options);
})()