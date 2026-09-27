<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SHOOTOUT</title>

<script src="https://cdn.babylonjs.com/babylon.js"></script>

<style>
html,body{
    margin:0;
    width:100%;
    height:100%;
    overflow:hidden;
    background:#111;
}
#game{
    width:100%;
    height:100%;
    touch-action:none;
}
#mobile{
    display:none;
    position:absolute;
    inset:0;
    pointer-events:none;
}
button{
    pointer-events:auto;
    border:0;
    border-radius:50%;
    background:#ffffff55;
    color:white;
    font-size:20px;
    width:70px;
    height:70px;
}
#jump{position:absolute;right:110px;bottom:40px}
#shoot{position:absolute;right:25px;bottom:100px}
#joy{
    position:absolute;
    left:25px;
    bottom:35px;
    width:130px;
    height:130px;
    border-radius:50%;
    background:#ffffff22;
    pointer-events:auto;
}
#stick{
    position:absolute;
    left:40px;
    top:40px;
    width:50px;
    height:50px;
    border-radius:50%;
    background:#ffffff66;
}
</style>
</head>

<body>

<canvas id="game"></canvas>

<div id="mobile">
    <div id="joy"><div id="stick"></div></div>
    <button id="jump">JUMP</button>
    <button id="shoot">🔫</button>
</div>

<script>
const canvas = document.getElementById("game");
const engine = new BABYLON.Engine(canvas,true);

const isMobile =
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

if(isMobile)
    document.getElementById("mobile").style.display="block";

/* ---------- SCENE ---------- */

const scene = new BABYLON.Scene(engine);
scene.clearColor = new BABYLON.Color3(.08,.08,.1);

const camera = new BABYLON.ArcRotateCamera(
    "camera",
    -Math.PI/2,
    1.05,
    18,
    new BABYLON.Vector3(0,1,0),
    scene
);

camera.attachControl(canvas,!isMobile);

const light = new BABYLON.HemisphericLight(
    "light",
    new BABYLON.Vector3(0,1,0),
    scene
);

light.intensity = .9;

/* ---------- MATERIAL ---------- */

function mat(name,color){
    const m = new BABYLON.StandardMaterial(name,scene);
    m.diffuseColor = new BABYLON.Color3(...color);
    return m;
}

const playerMat = mat("player",[0.1,0.7,1]);
const enemyMat  = mat("enemy",[1,0.15,0.15]);
const wallMat   = mat("wall",[0.25,0.25,0.3]);
const obstacleMat = mat("obstacle",[0.2,0.8,0.25]);
const bulletMat  = mat("bullet",[1,0.8,0.1]);

/* ---------- ARENA ---------- */

const ground = BABYLON.MeshBuilder.CreateGround(
    "ground",
    {width:30,height:30},
    scene
);
ground.material = wallMat;

function wall(x,z,w,d){
    const m = BABYLON.MeshBuilder.CreateBox(
        "wall",
        {width:w,height:2,depth:d},
        scene
    );
    m.position.set(x,1,z);
    m.material = wallMat;
    return m;
}

wall(0,-15,30,1);
wall(0,15,30,1);
wall(-15,0,1,30);
wall(15,0,1,30);

/* ---------- OBSTACLE ---------- */

const obstacle = BABYLON.MeshBuilder.CreateBox(
    "obstacle",
    {width:3,height:2,depth:3},
    scene
);

obstacle.position.set(3,1,2);
obstacle.material = obstacleMat;

/* ---------- PLAYER ---------- */

const player = BABYLON.MeshBuilder.CreateBox(
    "player",
    {size:1},
    scene
);

player.position.set(0,.5,8);
player.material = playerMat;

let velocityY = 0;
let grounded = true;

/* ---------- INPUT ---------- */

const keys = {};

window.addEventListener("keydown",e=>{
    keys[e.key.toLowerCase()] = true;

    if(e.code==="Space")
        jump();
});

window.addEventListener("keyup",e=>{
    keys[e.key.toLowerCase()] = false;
});

canvas.addEventListener("pointerdown",()=>{
    if(!isMobile) shoot(player,enemy);
});

/* ---------- PLAYER ACTIONS ---------- */

function jump(){
    if(!grounded)return;

    velocityY = .25;
    grounded = false;
}

function shoot(from,target){
    if(!target)return;

    const bullet = BABYLON.MeshBuilder.CreateSphere(
        "bullet",
        {diameter:.18},
        scene
    );

    bullet.position = from.position.clone();
    bullet.position.y += .2;

    bullet.material = bulletMat;

    const dir = target.position
        .subtract(from.position)
        .normalize();

    bullet.metadata = {
        velocity:dir.scale(.45),
        life:0
    };

    bullets.push(bullet);
}

const bullets=[];

/* ---------- ENEMY ---------- */

const enemy = BABYLON.MeshBuilder.CreateBox(
    "enemy",
    {size:1},
    scene
);

enemy.position.set(0,.5,-7);
enemy.material = enemyMat;

let enemyTimer=0;

function enemyShoot(){
    shoot(enemy,player);
}

/* ---------- MOBILE JOYSTICK ---------- */

let joyX=0;
let joyY=0;

if(isMobile){

    const joy=document.getElementById("joy");
    const stick=document.getElementById("stick");

    joy.addEventListener("pointermove",e=>{
        const r=joy.getBoundingClientRect();

        joyX=(e.clientX-(r.left+r.width/2))/45;
        joyY=(e.clientY-(r.top+r.height/2))/45;

        joyX=Math.max(-1,Math.min(1,joyX));
        joyY=Math.max(-1,Math.min(1,joyY));

        stick.style.left=(40+joyX*35)+"px";
        stick.style.top=(40+joyY*35)+"px";
    });

    joy.addEventListener("pointerup",resetJoy);
    joy.addEventListener("pointercancel",resetJoy);

    function resetJoy(){
        joyX=joyY=0;
        stick.style.left="40px";
        stick.style.top="40px";
    }

    document.getElementById("jump")
        .addEventListener("pointerdown",jump);

    document.getElementById("shoot")
        .addEventListener("pointerdown",()=>{
            shoot(player,enemy);
        });

    /* Swipe camera */
    let lastX=0;

    canvas.addEventListener("pointerdown",e=>{
        lastX=e.clientX;
    });

    canvas.addEventListener("pointermove",e=>{
        if(!lastX)return;

        camera.alpha += (e.clientX-lastX)*.008;
        lastX=e.clientX;
    });

    canvas.addEventListener("pointerup",()=>{
        lastX=0;
    });
}

/* ---------- GAME LOOP ---------- */

scene.onBeforeRenderObservable.add(()=>{

    const dt=engine.getDeltaTime()/16.67;

    /* Player movement */

    let x=0,z=0;

    if(keys["w"])z-=1;
    if(keys["s"])z+=1;
    if(keys["a"])x-=1;
    if(keys["d"])x+=1;

    if(isMobile){
        x=joyX;
        z=joyY;
    }

    player.position.x += x*.12*dt;
    player.position.z += z*.12*dt;

    /* Gravity */

    velocityY -= .015*dt;
    player.position.y += velocityY*dt;

    if(player.position.y<=.5){
        player.position.y=.5;
        velocityY=0;
        grounded=true;
    }

    /* Arena limits */

    player.position.x =
        BABYLON.Scalar.Clamp(player.position.x,-14,14);

    player.position.z =
        BABYLON.Scalar.Clamp(player.position.z,-14,14);

    /* Camera follows player */

    camera.target = player.position;

    /* Enemy movement */

    enemy.lookAt(player.position);

    const dir=player.position
        .subtract(enemy.position);

    dir.y=0;

    if(dir.length()>4)
        enemy.position.addInPlace(
            dir.normalize().scale(.035*dt)
        );

    /* Enemy shooting */

    enemyTimer+=dt;

    if(enemyTimer>120){
        enemyTimer=0;
        enemyShoot();
    }

    /* Bullets */

    for(let i=bullets.length-1;i>=0;i--){

        const b=bullets[i];

        b.position.addInPlace(
            b.metadata.velocity.scale(dt)
        );

        b.metadata.life+=dt;

        /* Bullet hits enemy */

        if(b!==null &&
           BABYLON.Vector3.Distance(
               b.position,
               enemy.position
           )<.7){

            enemy.position.set(
                Math.random()*12-6,
                .5,
                Math.random()*12-6
            );

            b.dispose();
            bullets.splice(i,1);
            continue;
        }

        /* Remove old bullets */

        if(b.metadata.life>120){
            b.dispose();
            bullets.splice(i,1);
        }
    }
});

/* ---------- START ---------- */

engine.runRenderLoop(()=>{
    scene.render();
});

window.addEventListener("resize",()=>{
    engine.resize();
});
</script>

</body>
</html>