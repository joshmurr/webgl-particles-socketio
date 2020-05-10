let express = require('express');
let app = require('express')();
let server = require('http').Server(app);
let io = require('socket.io')(server);
let path = require('path');

const port = process.env.PORT || 8989;

app.use(express.static(__dirname + '/dist'));

let users = {};

getUsers = () => {
    return Object.keys(users).map(function(key){
        return {
            uid : users[key].uid,
            location : users[key].location,
        }
    });
};

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '/index.html'));
});

server.listen(port, () => {
    console.log(`Listening on port ${port}`);
});

io.on('connection', (socket) => {
    socket.on("newUser", (data) => {
        console.log(`Adding new user on socket: ${socket.id}, UID: ${data}`);
        users[socket.id] = {
            location : null,
            uid: data,
        };
    });

    socket.on('updateParticleSystem', (data) => {
        if(users[socket.id]){
            users[socket.id].location = data.location;
            socket.broadcast.emit('updateParticleSystems', users);
        } 
    });

    socket.on('disconnect', () => {
        console.log("Removing user");
        let clone_users = Object.assign({}, users);
        delete clone_users[socket.id];
        users = clone_users;
        socket.broadcast.emit('updateParticleSystems', users);
    });
});
