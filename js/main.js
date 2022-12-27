import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { ImprovedNoise } from "three/addons/math/ImprovedNoise.js";
import { ConvexObjectBreaker } from "three/addons/misc/ConvexObjectBreaker.js";

const width = window.innerWidth;
const height = window.innerHeight;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 10000);

const renderer = new THREE.WebGLRenderer({logarithmicDepthBuffer: true});
renderer.logarithmicDepthBuffer = true;
renderer.setSize(width, height);
document.body.appendChild(renderer.domElement);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

var wait = 0;
const loader = new OBJLoader();
const breaker = new ConvexObjectBreaker();
var flying = false;
var biome = "islands";
var mode = "dog";
var vehicle = "plane";
var joined = false;
const gamepad = {
    controller: {},
    connected: false,
    connect(e) {
        gamepad.controller = e.gamepad;
        gamepad.connected = true;
        console.log("Gamepad connected.");
    },
    disconnect(e) {
        gamepad.connected = false;
        console.log("Gamepad disconnected.");
    },
    update() {
        if (gamepad.connected) {
            gamepad.axes = navigator.getGamepads()[0].axes;
            gamepad.buttons = navigator.getGamepads()[0].buttons;
        }
        else {
            gamepad.axes = [];
            gamepad.buttons = [];
        }
    },
    axes: [],
    buttons: []
};
var cutscene = false;
var socket = io();
var sid = 0;
var players = [];
const inter = 5;
var prev = -1;
var prev_event = 0;
var ammo = 30;
document.getElementById("ammo-count").innerText = ammo;

// Camera
var cam = {
    pos: vec3(0, 15, 30),
    save: vec3(0, 15, 30),
    offset: vec3(0, 0, 0),
    factor: 500,
    rot: vec3(-0.5, 0, 0),
    incr: vec3(0, 0, 0),
    rot_incr: vec3(0, 0, 0)
};

const render_rad = 500;
const resolution = 25;
const fog_rad = 10000;
const step = 100;
const amplitude = 10;
const multiplier = 2.5;
var prev_plane_step = {x: Math.PI, z: Math.PI};
var plane_step = {x: 0, z: 0};

// Interaction
var keys = {};
var mouse = {x: 0, y: 0, pressed: false, prev: 0};

// Physics
var thrust = 0.0001;
var vel = {
    global: vec3(0, 0, 0),
    local: vec3(0, 0, 0)
}
var rot = {
    yaw: 0,
    roll: 0,
    pitch: 0,
}
var rot_vel = {
    yaw: 0,
    roll: 0,
    pitch: 0
}

const gravity = 0.00005;
const turn_speed = 0.0001;
const tilt_speed = 0.0001;
const roll_speed = 0.0001;
const rot_damp = 0.99;
const power = 0.0001;
const max_vel = 1;

var shards = [];
var collision = false;

// Materials
const plane_color = 0x010101;
const grass_color = 0x3A5F1B;
const snow_color = 0xFFFFFF;
const water_color = 0x0f5e9c;
const sand_color = 0xC2B280;
const stone_color = 0x918E85;
const tree_trunk_color = 0x807153;
const tree_leaves_color = 0x3A5F0B;
const house_color = 0x9e9189;
const window_color = 0x00A2ED;
const balcony_color = 0x9b634c;
const roof_color = 0x656868;
const door_color = 0x9b634c;
const volcano_color = 0x111111;
const weapon_color = 0xffffc0;
const ring_color = 0xffffc0;
const city_color = 0x918E85;
const light_grass_color = 0x416623;
const cherry_color = 0xffb7c5;

const threeTone = new THREE.TextureLoader().load("/assets/textures/fiveTone.jpg");
threeTone.minFilter = THREE.NearestFilter;
threeTone.magFilter = THREE.NearestFilter;

const plane_material = new THREE.MeshToonMaterial({color: plane_color, side: THREE.DoubleSide, gradientMap: threeTone});
const terrain_material = new THREE.MeshToonMaterial({vertexColors: true, side: THREE.DoubleSide, gradientMap: threeTone});
const water_material = new THREE.MeshStandardMaterial({color: water_color, side: THREE.DoubleSide, transparent: true, opacity: 0.8});
const volcano_material = new THREE.MeshToonMaterial({color: volcano_color, side: THREE.DoubleSide, gradientMap: threeTone});
const weapon_material = new THREE.MeshStandardMaterial({color: weapon_color, emissive: weapon_color});
const ring_material = new THREE.MeshStandardMaterial({ color: ring_color, emissive: ring_color });

// Atmosphere
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(scene.background, fog_rad*0.5, fog_rad);

const dir_light = new THREE.DirectionalLight(0xffffff, 1);
dir_light.position.set(1, 1, 1);
dir_light.target.position.set(0, 0, 0);
dir_light.castShadow = true;
dir_light.shadow.bias = -0.01;
scene.add(dir_light);
scene.add(dir_light.target);

dir_light.shadow.mapSize.width = 10000;
dir_light.shadow.mapSize.height = 10000;

const d = 100;
dir_light.shadow.camera.left = -d;
dir_light.shadow.camera.right = d;
dir_light.shadow.camera.top = d;
dir_light.shadow.camera.bottom = -d;

dir_light.shadow.camera.near = 0;
dir_light.shadow.camera.far = 100;

const am_light = new THREE.AmbientLight(0x404040);
scene.add(am_light);

// Load models
var plane;

var plane_mesh;
load("/assets/models/vehicle/airplane.obj", plane_material, 0.1, (mesh) => {
    plane_mesh = mesh;
    plane = plane_mesh.clone();
});
var balloon_mesh;
load("/assets/models/vehicle/balloon.obj", plane_material, 0.1, (mesh) => balloon_mesh = mesh);

var plane_bbox;

const perlin = new ImprovedNoise();
const noise = (vec, a) => perlin.noise(vec.x, vec.y, 0) * a;
const t_noise = (vec, s, a) => noise(vec.divideScalar(s), amplitude*a);

var terrain = new THREE.Object3D();
scene.add(terrain);
terrain.position.y = -10;

var water = new THREE.Mesh(new THREE.PlaneGeometry(fog_rad, fog_rad, 1000, 1000), water_material);
scene.add(water);
water.rotation.x = Math.PI/2;
var water_level = -10;
water.receiveShadow = true;

var collider = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 20), plane_material);
collider.visible = false;

var stand = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2, 32), new THREE.MeshToonMaterial({color: 0x808080}));

var g_tree = [];
g_load([
    {path: "/assets/models/tree/tree_trunk.obj", color: tree_trunk_color},
    {path: "/assets/models/tree/tree_leaves.obj", color: tree_leaves_color}
], (mesh) => {
    g_tree.push(mesh);
});

var g_pine = [];
g_load([
    { path: "/assets/models/tree/tree_trunk.obj", color: tree_trunk_color },
    { path: "/assets/models/tree/tree_leaves.obj", color: snow_color }
], (mesh) => {
    g_pine.push(mesh);
});

var g_palm = [];
g_load([
    { path: "/assets/models/palm_tree/trunk.obj", color: tree_trunk_color },
    { path: "/assets/models/palm_tree/leaves.obj", color: tree_leaves_color }
], (mesh) => {
    g_palm.push(mesh);
});

var g_cherry = [];
g_load([
    { path: "/assets/models/tree/tree_trunk.obj", color: tree_trunk_color },
    { path: "/assets/models/tree/tree_leaves.obj", color: cherry_color }
], (mesh) => {
    g_cherry.push(mesh);
});

var g_house1 = [];
g_load([
    { path: "/assets/models/house/balcony.obj", color: balcony_color },
    { path: "/assets/models/house/body.obj", color: house_color },
    { path: "/assets/models/house/windows.obj", color: window_color },
    { path: "/assets/models/house/doors.obj", color: door_color },
    { path: "/assets/models/house/roof.obj", color: roof_color }
], (mesh) => {
    g_house1.push(mesh);
});

var g_city = [];
g_load([
    { path: "/assets/models/city/city.obj", color: city_color }
], (mesh) => {
    g_city.push(mesh);
});

var island_geo, arch_geo, volcano_geo, cald_geo, island, volcano;
load_geometry("/assets/models/maps/volcano_base.obj", (p, g) => island_geo = g);
load_geometry("/assets/models/maps/volcano.obj", (p, g) => volcano_geo = g);
load_geometry("/assets/models/maps/archipelago.obj", (p, g) => arch_geo = g);
load_geometry("/assets/models/maps/caldera.obj", (p, g) => cald_geo = g);

var weapon = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 5), weapon_material); 
var weapons = [];

const geometry = new THREE.RingGeometry(1, 5, 32);
const material = new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide });
var ring = new THREE.Mesh(new THREE.TorusGeometry(12, 0.5, 3, 14), ring_material);
var rings = [];

// Config

const terrain_shades = {
    lim0: { value: 0, color: sand_color },
    lim1: { value: 10, color: grass_color },
    lim2: { value: 100, color: light_grass_color },
    lim3: { value: 175, color: snow_color }
}
const noise_fn = (vec2) => {
    return t_noise(vec2, 1, 1) // scale, amplitude
        + t_noise(vec2, 10, 10)
        + t_noise(vec2, 100, 50) - 5;
}
const populations = [
    {
        group: g_tree,
        rarity: 0.02,
        min: 10,
        max: 150,
        seed: 1000,
        scale: 0.5,
        offset: 3,
        rand_rot: () => new THREE.Euler(Math.random() * 0.2, Math.random() * Math.PI * 2, Math.random() * 0.2)
    },
    {
        group: g_pine,
        rarity: 0.01,
        min: 175,
        max: 250,
        seed: 1000,
        scale: 0.75,
        offset: 3,
        rand_rot: () => new THREE.Euler(Math.random() * 0.2, Math.random() * Math.PI * 2, Math.random() * 0.2)
    },
    {
        group: g_palm,
        rarity: 0.01,
        min: 0,
        max: 40,
        seed: 1000,
        scale: 0.5,
        offset: 0,
        rand_rot: () => new THREE.Euler(Math.random() * 0.2, Math.random() * Math.PI * 2, Math.random() * 0.2)
    },
    {
        group: g_cherry,
        rarity: 0.001,
        min: 160,
        max: 250,
        seed: 1000,
        scale: 1,
        offset: 3,
        rand_rot: () => new THREE.Euler(Math.random() * 0.2, Math.random() * Math.PI * 2, Math.random() * 0.2)
    }
];

// Render
on_load(() => {
    static_scene();
    animate();
})

function init() {
    document.getElementById("menu").style.display = "none";
    document.getElementById("blackout").classList.add("right");
    document.getElementById("loading").classList.remove("active");
    document.getElementById("waiting").classList.remove("active");

    plane.position.set(0, 5, 0);
    plane.rotation.set(0, 0, 0);
    vel.local.z = -0.05;
    
    camera.position.set(...cam.pos);
    plane.add(camera);

    breaker.prepareBreakableObject(collider, 1, new THREE.Vector3(), new THREE.Vector3(), true);
    plane.add(collider);

    plane_bbox = new THREE.Box3().setFromObject(plane);

    flying = true;
}

function static_scene() {
    scene.add(plane);

    document.getElementById("menu").style.display = "flex";
    document.getElementById("blackout").classList.add("left");
    const offset = vec3(145, -2, 0);
    plane.position.set(0, 0, 0);
    camera.rotation.set(0, -0.1, 0);
    plane.rotation.set(...add3(camera.rotation, vec3(-0.1, Math.PI * 0.75, 0.1)));
    camera.position.set(-1, 0.5, 2);
    plane.remove(camera);
    plane.position.add(offset);
    camera.position.add(offset);
    stand.position.set(...add3(plane.position, vec3(0, -1.4, 0)));
    stand.castShadow = true;
    stand.receiveShadow = true;
    scene.add(stand);
    dir_light.target.position.set(plane.position);
    dir_light.target.position.set(plane.position.x, 10, plane.position.z);
    dir_light.position.set(...add3(dir_light.target.position, vec3(1, 1, 1)));
    handle_terrain();
    cam.save = camera.position.clone();
}

function static_update() {
    var displacement = {x: mouse.x - window.innerWidth/2, y: mouse.y - window.innerHeight/2}
    camera.position.set(...add3(cam.save, vec3(-displacement.x/4000, displacement.y/4000, 0)));
    var h = document.getElementsByClassName("heading")[0];
    var x = document.getElementsByClassName("select")[0];
    h.style.transform = `translate(${displacement.x/100}px, ${displacement.y/100}px)`;
    x.style.transform = `translate(${displacement.x/200}px, ${displacement.y/200}px)`;
}

function enter(mo) {
    document.getElementById("blackout").classList.remove("left");
    document.getElementById("blackout").classList.remove("right");
    setTimeout(() => {
        scene.remove(stand);
        mode = mo;
        if (mode == "dog") wait_room();
        else if (mode == "free") init();
        else if (mode == "air") init_balloon();
    }, 1000);
}

function init_balloon() {
    document.getElementById("blackout").classList.add("right");
    scene.remove(plane);
    vehicle = "balloon";
    plane = balloon_mesh.clone();
    scene.add(plane);
    plane.add(camera);
    cam.pos = vec3(0, 30, 60);
    init();
}

function wait_room() {
    document.getElementById("loading").classList.add("active");
    document.getElementById("waiting").classList.add("active");
    socket.emit("join-request", (msg) => {
        joined = true;
        sid = msg.sid;
        console.log("Assigned SID " + sid);
        island_init(msg.selection);
    });
    socket.on("player-joined", (msg) => {
        console.log("Player joined with SID " + msg.sid);
        if (msg.sid != sid) {
            var player = msg;
            player.mesh = plane.clone();
            player.collider = collider.clone();
            player.collider.position.set(...unpack3(player.mesh.position));
            breaker.prepareBreakableObject(player.collider, 1, new THREE.Vector3(), new THREE.Vector3(), true);
            player.mesh.add(player.collider);
            players.push(player);
            scene.add(player.mesh);
        }
    });
    socket.on("data", (msg) => {
        if (msg.sid != sid && !cutscene) {
            var player = ssearch(msg.sid);
            player.mesh.position.set(...msg.position);
            player.mesh.rotation.set(...msg.rotation);
        }
    });
    socket.on("shoot", (msg) => {
        if (msg.sid != sid && !cutscene) {
            var player = ssearch(msg.sid);
            spawn_weapon(player.mesh);
        }
    });
    socket.on("eliminated", (msg) => {
        console.log("Player with SID " + msg.sid + " eliminated because of " + msg.cause);
        if (msg.sid != sid && !cutscene && msg.cause != "disconnect") {
            var player = ssearch(msg.sid);
            collide(player.mesh, player.collider);
        }
    });
}

function handle_server() {
    handle_events();
    if (!cutscene) {
        // handle_ui();
        socket.emit("data", {
            sid: sid,
            position: unpack3(plane.position),
            rotation: unpack3(plane.rotation)
        });
    }
}

function handle_ui() {
    var canvas = document.getElementById("ui");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.fillStyle = "red";
    const m = -10;
    const off = 10;
    for (var p of players) {
        var pos = screen_position(p.mesh);
        console.log(pos);
        ctx.beginPath();

        ctx.moveTo(0+pos.x-m/2, m+pos.y-off-m/2);
        ctx.lineTo(m/2+pos.x-m/2, 0+pos.y-off-m/2);
        ctx.lineTo(m+pos.x-m/2, m+pos.y-off-m/2);

        ctx.moveTo(0+pos.x-m/2, -m+pos.y-m/2);
        ctx.lineTo(m/2+pos.x-m/2, 0+pos.y-m/2);
        ctx.lineTo(m+pos.x-m/2, -m+pos.y-m/2);

        ctx.moveTo(m+pos.x-off-m/2, 0+pos.y-m/2);
        ctx.lineTo(0+pos.x-off-m/2, m/2+pos.y-m/2);
        ctx.lineTo(m+pos.x-off-m/2, m+pos.y-m/2);

        ctx.moveTo(-m+pos.x-m/2, 0+pos.y-m/2);
        ctx.lineTo(0+pos.x-m/2, m/2+pos.y-m/2);
        ctx.lineTo(-m+pos.x-m/2, m+pos.y-m/2);

        ctx.fill();
    }
}

function handle_events() {
    for (var r of rings) {
        r.scale.set(r.size, r.size, r.size);
        if (plane.position.distanceTo(r.position) > 10) {
            r.lookAt(plane.position);
            r.rotation.x = 0;
            r.rotation.z = 0;
        };
        if (check_ring_collision(plane, r) && r.state != "shrinking") {
            r.state = "shrinking";
            r.size_vel = 0.01;
            setTimeout(() => {
                rings.splice(rings.indexOf(r), 1);
                scene.remove(r);
            }, 1000);
            ammo += 10;
            document.getElementById("ammo-count").innerText = ammo;
        }
        if (r.state == "growing" && r.size <= 1) {
            r.size += r.size_vel;
            r.size_vel *= 0.99;
        }
        else if (r.state == "shrinking" && r.size >= 0) {
            r.size -= r.size_vel;
            r.size_vel *= 1.01;
        }
    }
    if (performance.now() - prev_event > 10000) {
        var r = ring.clone();
        r.position.x = (Math.random() - 0.5)*1000;
        r.position.y = Math.random()*500;
        r.position.z = (Math.random() - 0.5)*1000;
        rings.push(r);
        scene.add(r);
        r.size = 0;
        r.size_vel = 0.01;
        r.state = "growing";
        prev_event = performance.now();
    }
}

function island_init(selection) {
    plane.position.set(0, 0, 0);
    init();
    const sel_map = {
        1: island_geo,
        0: arch_geo,
        2: cald_geo
    }
    island_geo = sel_map[selection];

    scene.remove(terrain);
    water_level = 40;
    water.material.opacity = 1;
    water.position.set(camera.position.x, water_level, camera.position.z);
    island = new THREE.Mesh(island_geo, terrain_material);
    if (selection == 1) volcano = new THREE.Mesh(volcano_geo, volcano_material);
    island.scale.set(20, 20, 20);
    if (selection == 1) volcano.scale.set(20, 20, 20);
    plane.position.y = 120;
    terrain_shader(island, {
        lim0: { value: 1, color: sand_color },
        lim1: { value: 2.5, color: grass_color },
        lim2: { value: 7, color: stone_color },
        lim3: { value: 8, color: snow_color }
    });
    scene.add(island);
    if (selection == 1) scene.add(volcano);
    island.receiveShadow = true;
    if (selection == 1) volcano.receiveShadow = true;
    island.geometry.computeVertexNormals();
    if (selection == 1) volcano.geometry.computeVertexNormals();
    populate_g_mesh(island, g_tree, {
        rarity: 0.1,
        biome: "islands",
        min: 2.5,
        max: 6,
        seed: 1000,
        scale: 0.02,
        offset: 0.15,
        rand_rot: () => new THREE.Euler(Math.random() * 0.2, Math.random() * Math.PI * 2, Math.random() * 0.2)
    });
    populate_g_mesh(island, g_palm, {
        rarity: 0.01,
        biome: "islands",
        min: 2,
        max: 2.5,
        seed: 1000,
        scale: 0.02,
        offset: 0.15,
        rand_rot: () => new THREE.Euler(Math.random() * 0.2, Math.random() * Math.PI * 2, Math.random() * 0.2)
    });
    populate_g_mesh(island, g_house1, {
        rarity: selection == 1 ? 0.001 : 0.0001,
        biome: "islands",
        min: 2,
        max: 4,
        seed: 1000,
        scale: 0.05,
        offset: 0,
        rand_rot: () => new THREE.Euler(0, Math.random() * Math.PI * 2, 0)
    });

    if (selection == 1) {
        enter_cutscene("THE VOLCANO");
        camera.position.set(-5000, -500, -5000);
        camera.rotation.set(0, -Math.PI * 0.75, 0);
        cam.incr = vec3(1, 0, 1);
        setTimeout(() => {
            camera.position.set(0, 0, 0);
            camera.rotation.set(0, -Math.PI / 2, 0);
            cam.rot_incr = vec3(0, Math.PI/10000, 0);
            cam.incr = vec3(1, 1, 1);
        }, 4000);
        setTimeout(() => {
            camera.position.set(-2000, -500, -2000);
            camera.rotation.set(0, -Math.PI * 0.75, 0);
            cam.rot_incr = vec3(0, Math.PI/10000, 0);
            cam.incr = vec3(-1, 0, 0);
        }, 8000);
    }
    else if (selection == 0) {
        enter_cutscene("THE ARCHIPELAGO");
        camera.position.set(-5000, -500, -5000);
        camera.rotation.set(0, -Math.PI * 0.75, 0);
        cam.incr = vec3(1, 0, 1);
        setTimeout(() => {
            camera.position.set(0, -500, 0);
            camera.rotation.set(0, -Math.PI / 2, 0);
            cam.rot_incr = vec3(0, Math.PI / 10000, 0);
            cam.incr = vec3(1, 1, 1);
        }, 4000);
        setTimeout(() => {
            camera.position.set(-2000, -500, -2000);
            camera.rotation.set(0, -Math.PI * 0.75, 0);
            cam.rot_incr = vec3(0, Math.PI / 10000, 0);
            cam.incr = vec3(-1, 0, 0);
        }, 8000);
    }
    else if (selection == 2) {
        enter_cutscene("THE CALDERA");
        camera.position.set(-5000, -500, -5000);
        camera.rotation.set(0, -Math.PI * 0.75, 0);
        cam.incr = vec3(1, 0, 1);
        setTimeout(() => {
            camera.position.set(0, -500, 0);
            camera.rotation.set(0, -Math.PI / 2, 0);
            cam.rot_incr = vec3(0, Math.PI / 10000, 0);
            cam.incr = vec3(1, 1, 1);
        }, 4000);
        setTimeout(() => {
            camera.position.set(-2000, -500, -2000);
            camera.rotation.set(0, -Math.PI * 0.75, 0);
            cam.rot_incr = vec3(0, Math.PI / 10000, 0);
            cam.incr = vec3(-1, 0, 0);
        }, 8000);
    }
    setTimeout(exit_cutscene, 10000);
    flying = true;

    setTimeout(() => plane.position.set((Math.random() - 0.5) * 500, 500, (Math.random() - 0.5) * 500), 10500);
    vel.local.z = 0.01;
    vel.global.y = 0;
}

function enter_cutscene(title) {
    document.getElementById("preview").classList.add("active");
    document.getElementById("preview").childNodes[0].innerText = title;
    cutscene = true;
    scene.remove(plane);
}

function exit_cutscene() {
    document.getElementById("blackout").classList.remove("left");
    document.getElementById("blackout").classList.remove("right");
    document.getElementById("preview").classList.remove("active");
    setTimeout(() => {
        cutscene = false;
        document.getElementById("blackout").classList.add("right");
        document.getElementById("ammo").classList.add("active");
        scene.add(plane);
        plane.add(camera);
    }, 1000);
}

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
    gamepad.update();

    if (flying) {
        if (prev < 0) prev = performance.now() - inter;
        var repeat = Math.floor((performance.now() - prev) / inter);
        if (repeat > 1000) {
            // collide(plane, collider);
            // if (mode == "dog") socket.emit("eliminated", { sid: sid, cause: "timeout" });
            prev = performance.now();
        }
        else {
            for (var i = 0; i < repeat; i++) {
                handle_camera();
                if (mode == "dog") handle_weapons();
                handle_collisions();
                if (vehicle == "plane") {
                    handle_physics();
                }
                if (!cutscene) {
                    if (vehicle == "plane") handle_keys();
                    else if (vehicle == "balloon") handle_balloon();
                    if (mode == "free" || mode == "air") handle_terrain();
                    if (gamepad.connected && mode != "air") handle_joystick();
                    if (mode == "dog") handle_server();
                }
                prev = performance.now();
            }
        }
    }
    else {
        static_update();
    }
}

function handle_camera() {
    if (cutscene) {
        camera.position.add(cam.incr);
        camera.rotation.set(...add3(camera.rotation, cam.rot_incr));
    }
    else {
        cam.offset = vec3(-rot_vel.yaw * cam.factor, rot_vel.pitch * cam.factor, -vel.local.z / 10 * cam.factor);
        camera.position.set(...add3(cam.pos, cam.offset));
        camera.rotation.set(...unpack3(cam.rot));

        dir_light.target.position.set(plane.position.x, plane.position.y, plane.position.z);
        dir_light.position.set(...add3(dir_light.target.position, vec3(1, 1, 1)));
    }
}

function handle_physics() {
    plane.position.set(...add3(plane.position, vel.global));
    plane.translateX(vel.local.x);
    plane.translateY(vel.local.y);
    plane.translateZ(vel.local.z);

    vel.local.z -= thrust;
    if (vel.local.z > 0) vel.local.z = 0;
    vel.global.y -= vel.local.z < 0 ? 0.000001/-vel.local.z : 0.00001;

    rot_vel.pitch *= rot_damp;
    rot_vel.roll *= rot_damp;
    rot_vel.yaw *= rot_damp;
    rot.pitch += rot_vel.pitch;
    rot.roll += rot_vel.roll;
    rot.yaw += rot_vel.yaw;

    plane.rotateX(rot_vel.pitch);
    plane.rotateZ(rot_vel.roll);
    plane.rotateY(rot_vel.yaw);

    if (cutscene) vel.global.y = 0;
}

function handle_keys() {
    if (key_pressed("w")) { // negative pitch / nose up
        rot_vel.pitch -= tilt_speed;
    }
    if (key_pressed("a")) { // negative roll / roll left
        rot_vel.yaw += turn_speed;
        rot_vel.roll += roll_speed;
    }
    if (key_pressed("s")) { // positive picth / nose down
        rot_vel.pitch += tilt_speed;
    }
    if (key_pressed("d")) { // positive roll / roll right
        rot_vel.yaw -= turn_speed;
        rot_vel.roll -= roll_speed;
    }
    if (key_pressed("e")) { // positive roll / roll right
        thrust = power;
    }
    else if (key_pressed("q")) { // positive roll / roll right
        thrust = -power;
    }
    else {
        thrust = 0;
    }
}

function handle_weapons() {
    if (!cutscene && !collision) {
        var primary_button = gamepad.connected ? gamepad.buttons[0].pressed : mouse.pressed;
        if (primary_button && (performance.now() - mouse.prev > 500 || !mouse.prev) && ammo > 0) {
            spawn_weapon(plane);
            socket.emit("shoot", { sid: sid });
            mouse.prev = performance.now();
            ammo--;
            document.getElementById("ammo-count").innerText = ammo;
        }
    }
    for (var i = 0; i < weapons.length; i++) {
        var w = weapons[i];
        w.translateZ(-1);
        if (w.owner != plane && check_weapon_collision(plane, w) && !collision) {
            collide(plane, collider);
            socket.emit("eliminated", { sid: sid, cause: "weapon collision" });
        }
        if (w.position.distanceTo(plane.position) > 500) {
            weapons.splice(i, 1);
            scene.remove(w);
        }
    }
}

function check_weapon_collision(plane, weapon) {
    var p_bbox = new THREE.Box3().setFromObject(plane);
    var w = weapon.position;
    return in_bounds3(w.x, w.y, w.z, p_bbox.min.x, p_bbox.min.y, p_bbox.min.z, p_bbox.max.x, p_bbox.max.y, p_bbox.max.z);
}

function check_ring_collision(plane, ring) {
    var r_bbox = new THREE.Box3().setFromObject(ring);
    var p = plane.position;
    return in_bounds3(p.x, p.y, p.z, r_bbox.min.x, r_bbox.min.y, r_bbox.min.z, r_bbox.max.x, r_bbox.max.y, r_bbox.max.z);
}

function spawn_weapon(mesh) {
    var fin_pos = (off) => mesh.localToWorld(vec3(add3(cam.pos.clone().multiplyScalar(-1), vec3(off, 2, -10))));
    var ws = [weapon.clone(), weapon.clone()];
    ws[0].position.set(...unpack3(fin_pos(10)));
    ws[1].position.set(...unpack3(fin_pos(-10)));
    for (var w of ws) {
        w.rotation.set(...unpack3(mesh.rotation));
        w.owner = mesh;
        scene.add(w);
        weapons.push(w);
    }
}

function handle_balloon() {
    vel.local.z = -0.05;
    if (gamepad.connected) {
        vel.local.y += gamepad.axes[6] * power;
    }
    if (key_pressed("e")) {
        vel.local.y += power*20;
    }
    else if (key_pressed("q")) {
        vel.local.y -= power*20;
    }

    vel.local.y *= 0.99;
    vel.local.y -= 0.001;

    plane.translateX(vel.local.x);
    plane.translateY(vel.local.y);
    plane.translateZ(vel.local.z);
}

function handle_joystick() {
    rot_vel.pitch += gamepad.axes[1]*tilt_speed;
    rot_vel.yaw -= gamepad.axes[5]*turn_speed;
    rot_vel.roll -= gamepad.axes[0]*roll_speed*1.5;
    thrust = -gamepad.axes[6]*power;
}

function handle_terrain() {
    water_level = -10;
    water.position.set(plane.position.x, water_level, plane.position.z);

    plane_step.x = Math.round(plane.position.x/step)
    plane_step.z = Math.round(plane.position.z/step);
    var low_step = -Math.floor(render_rad/step);
    var high_step = Math.ceil(render_rad/step);
    if (plane_step.x != prev_plane_step.x || plane_step.z != prev_plane_step.z) {
        var bounds = [low_step + plane_step.x, low_step + plane_step.z, high_step + plane_step.x, high_step + plane_step.z]
        remove_terrain_bounds(...bounds);
        fill_terrain_bounds(...bounds);
    }
    prev_plane_step.x = plane_step.x + 0;
    prev_plane_step.z = plane_step.z + 0;
}

function terrain_noise(mesh, shift) {
    var pos = mesh.geometry.attributes.position;
    var uv = mesh.geometry.attributes.uv;
    var vec2 = new THREE.Vector2();
    for (var i = 0; i < pos.count; i++) {
        vec2.fromBufferAttribute(uv, i).add(shift).multiplyScalar(multiplier);
        var z = noise_fn(vec2);
        pos.setZ(i, z);
    }
}

function terrain_shader(mesh, u) {
    var string3 = (c) => `vec3(${hex3(c)[0]}, ${hex3(c)[1]}, ${hex3(c)[2]})`;
    var material = new THREE.MeshToonMaterial({
        onBeforeCompile: shader => {
            shader.uniforms.lim0 = u.lim0;
            shader.uniforms.lim1 = u.lim1;
            shader.uniforms.lim2 = u.lim2;
            shader.uniforms.lim3 = u.lim3;


            shader.vertexShader = `
    	varying vec3 vPos;
      ${shader.vertexShader}
    `.replace(
                `#include <begin_vertex>`,
                `#include <begin_vertex>
      vPos = vec3(position);`
            );

            shader.fragmentShader = `
    	uniform float lim0;
      uniform float lim1;
      uniform float lim2;
      uniform float lim3;
    
    	varying vec3 vPos;
      ${shader.fragmentShader}
    `.replace(
                `vec4 diffuseColor = vec4( diffuse, opacity );`,
                `
      vec3 col = vPos.y >= lim3 ? ${string3(u.lim3.color)} : vPos.y >= lim2 ? ${string3(u.lim2.color)} : vPos.y >= lim1 ? ${string3(u.lim1.color)} : ${string3(u.lim0.color)};
      vec4 diffuseColor = vec4( col, opacity );`
            );
        },
        side: THREE.DoubleSide
    })
    mesh.material = material;
}

function terrain_colors(mesh) {
    var colors = [];
    mesh.geometry = mesh.geometry.toNonIndexed();
    var pos = mesh.geometry.attributes.position;
    for (var i = 2; i < pos.count; i+=3) {
        var vy = pos.getY(i);
        var color = grass_color;
        if (vy > 50) color = snow_color;
        else if (vy > 40) color = stone_color;
        if (vy < -10) color = sand_color;
        colors.push(...hex3(color));
        colors.push(...hex3(color));
        colors.push(...hex3(color));
    }
    mesh.geometry.attributes["color"] = new THREE.BufferAttribute(new Float32Array(colors), 3);
    //BufferGeometryUtils.mergeVertices(mesh.geometry);
}

function add_terrain(x, z) {
    var geometry = new THREE.PlaneGeometry(step, step, resolution, resolution);
    var mesh = new THREE.Mesh(geometry, terrain_material);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    terrain_noise(mesh, new THREE.Vector2(x, z));
    geometry.rotateX(Math.PI / 2);
    mesh.position.set(x, 0, z).multiplyScalar(step);
    geometry.computeVertexNormals();
    terrain.add(mesh);
    terrain_shader(mesh, terrain_shades);
    populate_terrain(mesh);
}

function populate_terrain(t_mesh) {
    for (var p of populations) populate_g_mesh(t_mesh, p.group, p);
}

function populate_g_mesh(t_mesh, g_mesh, options) {
    var pos = t_mesh.geometry.attributes.position;
    var matrices = [];
    for (var i = 0; i < pos.count; i++) {
        if (Math.random() > 1 - options.rarity) {
            var position = new THREE.Vector3();
            position.fromBufferAttribute(pos, i);
            t_mesh.localToWorld(position);
            position.y += options.offset;
            if (position.y - options.offset > options.min && position.y < options.max && perlin.noise(position.x/step + options.seed, position.z/step + options.seed, 0) >= -0.1) {
                var rotation = options.rand_rot();
                var factor = Math.random()/2 + 0.5;
                var scale = vec3(factor, factor, factor).multiplyScalar(options.scale);
                matrices.push(to_matrix(position, rotation, scale));
            }
        }
    }
    for (var m of g_mesh) t_mesh.add(instance_mesh(m, matrices));
}

function to_matrix(position, rotation, scale) {
    var q = new THREE.Quaternion();
    q.setFromEuler(rotation);
    return new THREE.Matrix4().compose(position, q, scale);
}

function instance_mesh(mesh, matrices) {
    var m = new THREE.InstancedMesh(mesh.geometry, mesh.material, matrices.length);
    m.castShadow = true;
    m.receiveShadow = true;
    for (var i = 0; i < matrices.length; i++) m.setMatrixAt(i, matrices[i]);
    return m;
}

function fill_terrain_bounds(start_x, start_z, end_x, end_z) {
    for (var x = start_x; x <= end_x; x++) {
        for (var z = start_z; z <= end_z; z++) {
            if (!exists_terrain(x, z)) add_terrain(x, z);
        }
    }
}

function exists_terrain(x, z) {
    for (var mesh of terrain.children) {
        var position = mesh.position.clone().divideScalar(step);
        if (position.x == x && position.z == z) return true;
    }
}

function remove_terrain_bounds(start_x, start_z, end_x, end_z) {
    for (var mesh of terrain.children) {
        var position = mesh.position.clone().divideScalar(step);
        var min = vec3(start_x, 0, start_z), max = vec3(end_x, 0, end_z);
        if (position.x < min.x || position.x > max.x || position.z < min.z || position.z > max.z) terrain.remove(mesh);
    }
}

function handle_collisions() {
    if (check_terrain_collision() && !collision) {
        if (mode == "dog") socket.emit("eliminated", { sid: sid, cause: "terrain collision" });
        collide(plane, collider);
    }
    for (var d of shards) {
        d.g_vel -= 0.001;
        d.rotateX(d.c_dir.x);
        d.rotateY(d.c_dir.y);
        d.rotateZ(d.c_dir.z);
        d.c_dir.x *= 0.995;
        d.c_dir.y *= 0.995;
        d.c_dir.z *= 0.995;
        // d.c_vel.x *= 0.99;
        // d.c_vel.y *= 0.99;
        // d.c_vel.z *= 0.99;
        d.position.x += d.c_vel.x;
        d.position.y += d.c_vel.y + d.g_vel;
        d.position.z += d.c_vel.z;
        d.time++;
        if (d.time > 500) {
            scene.remove(d);
        }
    }
}

function collide(p, collider) {
    var contact = vec3(1, 0.5, 1);
    var normal = vec3(0, 100, 0);
    shards = breaker.subdivideByImpact(collider, contact, normal, 1, 5, 1.5);
    var popper = (call) => vec3(call(), call(), call());
    var maxes = {x:[], y:[], z:[]};
    for (var d of shards) {
        d.position.set(...unpack3(collider.localToWorld(collider.position)));
        scene.add(d);
        d.c_dir = popper(() => Math.random() * 0.1);
        d.c_vel = popper(() => Math.random() * 0.5);
        d.g_vel = 0.01;
        d.time = 0;
    }
    shards[0].c_vel.y = 0.3;
    //shards[0].c_vel = vec3(Math.random() * 0.1, 0.2, Math.random() * 0.1);
    //shards[0].c_dir.x = 0;
    scene.remove(p);
    if (p == plane) {
        collision = true;
        shards[0].add(camera);
        setTimeout(() => {
            document.getElementById("blackout").classList.remove("left");
            document.getElementById("blackout").classList.remove("right");
            setTimeout(() => window.location.replace("/views/flight_ended.html"), 1500);
        }, 3000);
    }
}

function check_terrain_collision() {
    if (!collision) {
        plane_bbox = new THREE.Box3().setFromObject(plane);
        if (water.position.y < plane_bbox.min.y) {
            var target;
            if (mode == "free" || mode == "air") {
                for (var mesh of terrain.children) {
                    var position = mesh.position.clone().divideScalar(step);
                    if (position.x == plane_step.x && position.z == plane_step.z) target = mesh;
                }
                return collision_check(target, 0);
            }
            else {
                if (volcano) var a = collision_check(volcano, 10);
                return collision_check(island, 10) || a;
            }
            function collision_check(target, off) {
                var pos = target.geometry.attributes.position;
                for (var i = 0; i < pos.count; i++) {
                    const vertex = new THREE.Vector3();
                    vertex.fromBufferAttribute(pos, i);
                    target.localToWorld(vertex);
                    if (vertex.y > plane_bbox.min.y) {
                        if (in_bounds2(vertex.x, vertex.z, plane_bbox.min.x - off, plane_bbox.min.z - off, plane_bbox.max.x + off, plane_bbox.max.z + off)) return true;
                    }
                }
                return false;
            }
        }
        else return true;
    }
}

function in_bounds2(x, y, start_x, start_y, end_x, end_y) {
    return x >= start_x && x <= end_x && y >= start_y && y <= end_y;
}

function in_bounds3(x, y, z, start_x, start_y, start_z, end_x, end_y, end_z) {
    return x >= start_x && x <= end_x && y >= start_y && y <= end_y && z >= start_z && z <= end_z;
}

function load(path, material, scale, callback) {
    wait += 1;
    loader.load(path,
        (mesh) => {
            mesh.traverse(function (child) {
                if (child instanceof THREE.Mesh) {
                    child.material = material;
                    child.geometry.computeVertexNormals(true);
                    child.material.shading = THREE.SmoothShading;
                    child.castShadow = true;
                }
            });
            mesh.scale.set(scale, scale, scale);
            callback(mesh);
            wait -= 1;
        },
        (xhr) => {
            console.log((xhr.loaded / xhr.total * 100) + "% loaded");
        },
        (err) => {
            console.error("Error loading from " + path);
        }
    );
}

function load_geometry(path, callback) {
    wait += 1;
    var geo;
    loader.load(path,
        (mesh) => {
            mesh.traverse(function (child) {
                if (child instanceof THREE.Mesh) {
                    child.geometry.computeVertexNormals(true);
                    geo = child.geometry;
                }
            });
            wait -= 1;
            callback(path, geo);
        },
        (xhr) => {
            console.log((xhr.loaded / xhr.total * 100) + "% loaded");
        },
        (err) => {
            console.error("Error loading from " + path);
        }
    );
}

function g_load(dirs, callback) {
    var materials = []
    var search = (path) => dirs.findIndex((dir) => dir.path == path);
    for (var dir of dirs) {
        materials.push(new THREE.MeshToonMaterial({color: dir.color, side: THREE.DoubleSide, gradientMap: threeTone}));
        load_geometry(dir.path, (p, g) => callback(new THREE.Mesh(g, materials[search(p)])));
    }
}

function on_load(callback) {
    if (wait != 0) setTimeout(() => on_load(callback), 100);
    else callback();
}

function unpack3(vector) {
    return [vector.x, vector.y, vector.z];
}

function vec3() {
    return arguments.length == 1 ? (arguments[0] instanceof THREE.Vector3 ? arguments[0] : new THREE.Vector3(...arguments[0])) : new THREE.Vector3(...arguments)
}

function add3(a, b) {
    return unpack3(vec3(a).clone().add(vec3(b)));
}

function key_pressed(key) {
    return keys.hasOwnProperty(key) ? keys[key] : false;
}

function hex3(hex) {
    var string = hex.toString(16);
    var scale = (from, to) => Math.round(parseInt(string.substring(from, to), 16)/255*10000000000)/10000000000;
    return [scale(0, 2), scale(2, 4), scale(4, 6)];
}

function ssearch(id) {
    return players.filter((x) => x.sid == id)[0];
}

function screen_position(object) {
    var vector = new THREE.Vector3();
    object.updateMatrixWorld();
    vector.setFromMatrixPosition(object.matrixWorld);
    vector.project(camera);
    vector.x = (vector.x*window.innerWidth/2) + window.innerWidth/2;
    vector.y = -(vector.y*window.innerHeight/2) + window.innerHeight/2;
    return {x: vector.x, y: vector.y};
}

document.onkeydown = document.onkeyup = (e) => keys[e.key] = e.type == "keydown";
document.onmouseover = document.onmousemove = (e) => mouse = {x:e.clientX, y:e.clientY};
document.onmousedown = document.onmouseup = (e) => mouse.pressed = e.button == 0 ? e.type == "mousedown" : mouse.pressed;
document.getElementById("free").onclick = (e) => enter("free");
document.getElementById("dog").onclick = (e) => enter("dog");
document.getElementById("air").onclick = (e) => enter("air");
window.addEventListener("gamepadconnected", gamepad.connect);
window.addEventListener("gamepaddisconnected", gamepad.disconnect);