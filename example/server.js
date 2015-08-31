var Exiting = require('../lib');
var Hapi = require('hapi');

var server = new Hapi.Server();
server.connection();

server.on('stop', function () {

    console.log('Server stopped.');
});

server.route({
    method: 'GET',
    path: '/',
    handler: function (request, reply) {

        return reply('Hello');
    }
});

var manager = new Exiting.Manager(server).start(function (err) {

    if (err) {
        throw err;
    }

    console.log('Server started at:', server.info.uri);
});
