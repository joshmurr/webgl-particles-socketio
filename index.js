let express = require('express');
let app = require('express')();
let server = require('http').Server(app);
let io = require('socket.io')(server);
let port = 8989;

app.use(express.static(__dirname + '/dist'));

let users = {};

getUsers = () => {
    return Object.keys(users).map(function(key){
        return users[key].uid;
    });
};

getUserToRemove = (socket_id) => {
    let uid = '';
    Object.keys(users).map(function(key){
        let sockets = users[key].sockets;
        if(sockets.indexOf(socket_id) !== -1){
            console.log(key);
            uid = key;
        }
    });
    console.log(`Removing user: ${uid}`);
    return uid;
};

createSocket = (user) => {
    let cur_user = users[user.uid];
    let updated_user = {
        [user.uid] : Object.assign(cur_user, {
            sockets : [...cur_user.sockets, user.socket_id]
        })
    };
    users = Object.assign(users, updated_user);
};

createUser = (user) => {
    users = Object.assign({
        [user.uid] : {
            uid : user.uid,
            sockets : [user.socket_id],
        }
    }, users)
};

removeSocket = (socket_id) => {
    let uid = '';
    Object.keys(users).map(function(key){
        let sockets = users[key].sockets;
        if(sockets.indexOf(socket_id) !== -1){
            uid = key;
        }
    });
    let user = users[uid];
    if(user.sockets.length > 1){
        // Remove only the socket
        let index = user.sockets.indexOf(socket_id);
        let updated_user = {
            [uid] : Object.assign(user, {
                sockets : user.sockets.slice(0, index).concat(user.sockets.slice(index+1))

            })
        }
        users = Object.assign(users, updated_user);
    } else {
        // Remove user by key
        let clone_users = Object.assign({}, users);
        delete clone_users[uid];
        users = clone_users;
    }
};

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

    if(users[user.uid] !== undefined){
        createSocket(user);
        socket.emit('updateUsersList', getUsers());
    } else {
        createUser(user);
        io.emit('updateUsersList', getUsers());
    }

    socket.on('updateParticleSystem', (data) => {
        socket.broadcast.emit('newLocations', {
            uid: data.uid,
            location: data.location,
        });
    });

    socket.on('disconnect', () => {
        removeSocket(socket.id);
        io.emit('updateUsersList', getUsers());
    });
});
