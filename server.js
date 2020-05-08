let express = require('express');
let app = require('express')();
let server = require('http').Server(app);
let io = require('socket.io')(server);
let port = 8989;

app.use(express.static(__dirname + '/dist'));

let users = {};

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

server.listen(port, () => {
    console.log('Running server on 127.0.0.1:' + port);
});

io.on('connection', (socket) => {
    let query = socket.request._query;
    let user = {
        uid: query.uid,
        socket_id: socket.id
    };

    console.log(`User connected, UID: ${user.uid}, Socket ID: ${user.socket_id}`);

    // if(users[user.uid] !== undefined){
        // createSocket(user);
        // socket.emit('updateUsersList', getUsers());
    // } else {
        // createUser(user);
        // io.emit('updateUsersList', getUsers());
    // }

    socket.on('particleSystem', (data) => {
        socket.broadcast.emit('particleSystem', {
            uid: data.uid,
            location: data.location,
        });
    });

    socket.on('disconnect', () => {
        removeSocket(socket.id);
        io.emit('updateUsersList', getUsers());
    });
});
