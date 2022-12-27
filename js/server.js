const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const child_process = require("child_process");
const path = require("path");
var users = [];
var cid = 0;
var selection = Math.round(Math.random() * 2);
console.log("Selected map " + selection);

const root = path.resolve(__dirname, "..");
app.use(express.static(root));

app.get("/", function (req, res, next) {
    res.sendFile("/views/index.html", { root: root });
});

io.on("connection", (socket) => {
    console.log("user connected");
    users.push({sid: parseInt(cid.toString()), joined: false, waiting: false, socket: socket});
    cid++;
    socket.on("disconnect", () => {
        socket.broadcast.emit("eliminated", { sid: fsock(socket).sid, cause: "disconnect" });
        users.splice(isock(socket), 1);
        console.log("user disconnected");
        if (users.length == 0) {
            selection = Math.round(Math.random() * 2);
            cid = 0;
        }
    });
    socket.on("data", (msg) => {
        socket.broadcast.emit("data", msg);
    });
    socket.on("shoot", (msg) => {
        socket.broadcast.emit("shoot", msg);
    });
    socket.on("eliminated", (msg) => {
        socket.broadcast.emit("eliminated", msg);
    });
    socket.on("join-request", (respond) => {
        fsock(socket).waiting = true;
        console.log("user requested to join; " + users.length + " users waiting");
        ping_users(socket, respond);
    });
});

function ping_users(socket, respond) {
    if (users.filter((x) => x.waiting || x.joined).length > 1) {
        var user = fsock(socket);
        console.log("user accepted and assigned SID " + user.sid);
        respond({ sid: user.sid, selection: selection });
        user.waiting = false;
        user.joined = true;
        socket.broadcast.emit("player-joined", { sid: user.sid, position: [0, 0, 0], rotation: [0, 0, 0] });
    }
    else setTimeout(() => ping_users(socket, respond), 1000);
}

function dsearch(prop, val) {
    return users.filter((x) => x[prop] == val)[0];
}

function fsock(val) {
    return dsearch("socket", val);
}

function isock(val) {
    return users.indexOf(fsock(val));
}

server.listen(8000, "0.0.0.0", () => {
    console.log("listening on *:8000");
    child_process.exec('explorer "http://%COMPUTERNAME%:8000"');
});