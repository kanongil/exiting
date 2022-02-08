import * as Hapi from '@hapi/hapi';
import * as Lab from '@hapi/lab';
import * as Exiting from '..';

const { expect } = Lab.types;

const manager = Exiting.createManager(new Hapi.Server(), {
    exitTimeout: 30 * 1000
});

expect.type<Exiting.Manager<Hapi.Server>>(manager);

expect.type<TypeError>(new Exiting.ProcessExitError());

await manager.start();
await manager.stop();

manager.deactivate();

const options: Exiting.ManagerOptions = {
    exitTimeout: 30 * 1000
};

new Exiting.Manager(new Hapi.Server(), options);
Exiting.reset();

expect.error(new Exiting.Manager(new Hapi.Server(), { unknown: true }));
Exiting.reset();

new Exiting.Manager(new Hapi.Server());
Exiting.reset();

expect.error(new Exiting.Manager());
Exiting.reset();
