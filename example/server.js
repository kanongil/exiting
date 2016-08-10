'use strict';

const Exiting = require('../lib');
const Hapi = require('hapi');

const server = new Hapi.Server();
server.connection();

server.on('stop', () => {

    console.log('Server stopped.');
});

server.route({
    method: 'GET',
    path: '/',
    handler: function (request, reply) {

        return reply('Hello');
    }
});

/*const manager =*/ new Exiting.Manager(server).start((err) => {

    if (err) {
        throw err;
    }

    console.log('Server started at:', server.info.uri);
});
