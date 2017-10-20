'use strict';

const Exiting = require('../lib');
const Hapi = require('hapi');

const server = Hapi.Server();
const manager = Exiting.createManager(server);

server.events.on('stop', () => {

    console.log('Server stopped.');
});

const provision = async () => {

    server.route({
        method: 'GET',
        path: '/',
        handler() {

            return 'Hello';
        }
    });

    await manager.start();

    console.log('Server started at:', server.info.uri);
};

provision();
