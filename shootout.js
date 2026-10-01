// ============================================================================
// SHOOTOUT ⚔️ — High-Walled Voxel FPS Arena (shootout.js)
// ============================================================================

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('renderCanvas');
  if (!canvas) {
    console.error("Canvas element 'renderCanvas' not found!");
    return;
  }

  // 1. Initialize Babylon Engine
  const engine = new BABYLON.Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true
  });

  // --- GAME STATE ---
  const state = {
    stageIndex: 0,
    bossesDefeated: 0,
    playerHp: 100,
    playerMaxHp: 100,
    bossHp: 240,
    bossMaxHp: 240,
    isTransitioning: false,
    isGameOver: false,
    isMobile: /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 820
  };

  const ARENA_W = 60;
  const ARENA_L = 80;
  const WALL_HEIGHT = 16; // High voxel stadium walls

  let scene, camera, sunLight, fillLight;
  let currentBoss = null;
  let stageMeshes = [];
  let boneObstacles = [];
  let projectiles = [];

  // FPS Viewmodel & Muzzle
  let weaponRoot, muzzleMesh, weaponRecoil = 0;

  // Kinematics & Input
  const input = { forward: 0, right: 0 };
  let playerVy = 0;
  let walkBob = 0;
  let isPointerLocked = false;

  // ========================================================================
  // PROCEDURAL AUDIO SYNTHESIZER
  // ========================================================================
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'fire') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(950, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.1);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.1);
      osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'enemy_fire') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.18);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.18);
      osc.start(now); osc.stop(now + 0.18);
    } else if (type === 'hit') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(130, now);
      osc.frequency.linearRampToValueAtTime(30, now + 0.14);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.14);
      osc.start(now); osc.stop(now + 0.14);
    } else if (type === 'fanfare') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.exponentialRampToValueAtTime(750, now + 0.35);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.35);
      osc.start(now); osc.stop(now + 0.35);
    }
  }

  // ========================================================================
  // ZERO-DEPENDENCY HTML/CSS HUD & CROSSHAIR (Never crashes)
  // ========================================================================
  function setupDOMOverlay() {
    let oldOverlay = document.getElementById('fps-hud-container');
    if (oldOverlay) oldOverlay.remove();

    const overlay = document.createElement('div');
    overlay.id = 'fps-hud-container';
    overlay.innerHTML = `
      <style>
        #fps-crosshair {
          position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
          width: 24px; height: 24px; pointer-events: none; z-index: 100;
        }
        #fps-crosshair::before {
          content: ''; position: absolute; top: 0; left: 10px; width: 4px; height: 24px;
          background: #00f0ff; box-shadow: 0 0 8px rgba(0,240,255,0.8);
        }
        #fps-crosshair::after {
          content: ''; position: absolute; top: 10px; left: 0; width: 24px; height: 4px;
          background: #00f0ff; box-shadow: 0 0 8px rgba(0,240,255,0.8);
        }
        #fps-hud {
          position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
          width: 90%; max-width: 620px; z-index: 100; pointer-events: none;
          font-family: monospace, sans-serif; text-shadow: 1px 1px 3px #000;
        }
        #fps-title {
          font-size: 15px; font-weight: bold; color: #ffea00; margin-bottom: 6px;
          display: flex; justify-content: space-between;
        }
        .fps-bar-wrap {
          background: rgba(10, 15, 30, 0.7); border: 2px solid #fff;
          height: 16px; border-radius: 8px; overflow: hidden; margin-bottom: 6px;
        }
        #fps-p-bar { height: 100%; width: 100%; background: #00ffaa; transition: width 0.1s linear; }
        #fps-b-bar { height: 100%; width: 100%; background: #ff0055; transition: width 0.1s linear; }
        #fps-stage-fade {
          position: fixed; inset: 0; background: #fff; opacity: 0;
          pointer-events: none; transition: opacity 0.5s ease; z-index: 200;
        }
      </style>
      <div id="fps-crosshair"></div>
      <div id="fps-stage-fade"></div>
      <div id="fps-hud">
        <div id="fps-title">
          <span id="fps-stage-name">STAGE 1: VOXEL CITADEL</span>
          <span id="fps-score">DEFEATED: 0</span>
        </div>
        <div class="fps-bar-wrap"><div id="fps-p-bar"></div></div>
        <div class="fps-bar-wrap"><div id="fps-b-bar"></div></div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  function updateHUD() {
    const stageName = document.getElementById('fps-stage-name');
    const score = document.getElementById('fps-score');
    const pBar = document.getElementById('fps-p-bar');
    const bBar = document.getElementById('fps-b-bar');

    const titles = [
      "STAGE 1: VOXEL CITADEL 🏰",
      "STAGE 2: DESERT CANYON 🏜️",
      "STAGE 3: JUNGLE CLEARING 🌴"
    ];

    if (stageName && currentBoss) stageName.innerText = `${titles[state.stageIndex]} — ${currentBoss.name}`;
    if (score) score.innerText = `DEFEATED: ${state.bossesDefeated}`;
    if (pBar) pBar.style.width = `${Math.max(0, (state.playerHp / state.playerMaxHp) * 100)}%`;
    if (bBar && currentBoss) bBar.style.width = `${Math.max(0, (state.bossHp / state.bossMaxHp) * 100)}%`;
  }

  // ========================================================================
  // SCENE CREATION & LIGHTING
  // ========================================================================
  function createScene() {
    scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.48, 0.78, 0.98, 1.0); // Bright sky

    // First Person Camera (At eye-height 2.0 looking forward)
    camera = new BABYLON.UniversalCamera("FpsCam", new BABYLON.Vector3(0, 2.0, 24), scene);
    camera.setTarget(new BABYLON.Vector3(0, 2.0, 0));
    camera.speed = 0; // Manual FPS kinematics
    camera.angularSensibility = 2200;
    camera.minZ = 0.1;
    camera.fov = 1.15;
    camera.attachControl(canvas, true);

    // Bright Cheerful Ambient Fill + Directional Sun
    fillLight = new BABYLON.HemisphericLight("FillLight", new BABYLON.Vector3(0, 1, 0), scene);
    fillLight.intensity = 0.9;
    fillLight.diffuse = new BABYLON.Color3(1.0, 0.98, 0.92);

    sunLight = new BABYLON.DirectionalLight("SunLight", new BABYLON.Vector3(-0.6, -1.2, -0.7), scene);
    sunLight.position = new BABYLON.Vector3(30, 60, 40);
    sunLight.intensity = 1.25;

    // Viewmodel Blaster in Hand
    buildViewmodelBlaster();

    // DOM HUD and Crosshair
    setupDOMOverlay();

    // Build Initial Stage
    loadStage(0);

    return scene;
  }

  // ========================================================================
  // FIRST PERSON VIEWMODEL BLASTER (Rigged to Camera)
  // ========================================================================
  function buildViewmodelBlaster() {
    weaponRoot = new BABYLON.TransformNode("WeaponRoot", scene);
    weaponRoot.parent = camera;
    weaponRoot.position.set(0.38, -0.32, 0.75); // Lower-right FPS hand position

    const matVoxelBlue = new BABYLON.StandardMaterial("VM_Blue", scene);
    matVoxelBlue.diffuseColor = new BABYLON.Color3(0.2, 0.45, 0.85);

    const matVoxelGold = new BABYLON.StandardMaterial("VM_Gold", scene);
    matVoxelGold.diffuseColor = new BABYLON.Color3(1.0, 0.75, 0.1);

    // Blocky Voxel Receiver
    const body = BABYLON.MeshBuilder.CreateBox("GunBody", { width: 0.18, height: 0.22, depth: 0.65 }, scene);
    body.parent = weaponRoot;
    body.material = matVoxelBlue;

    // Top Barrel Rails
    const rail = BABYLON.MeshBuilder.CreateBox("GunRail", { width: 0.12, height: 0.08, depth: 0.5 }, scene);
    rail.parent = weaponRoot;
    rail.position.set(0, 0.12, 0.05);
    rail.material = matVoxelGold;

    // Twin square barrels
    [-0.04, 0.04].forEach(bx => {
      const b = BABYLON.MeshBuilder.CreateBox("GunBarrel", { width: 0.06, height: 0.06, depth: 0.45 }, scene);
      b.parent = weaponRoot;
      b.position.set(bx, 0.02, 0.45);
      b.material = matVoxelGold;
    });

    // Muzzle Flash
    muzzleMesh = BABYLON.MeshBuilder.CreateBox("Muzzle", { size: 0.18 }, scene);
    muzzleMesh.parent = weaponRoot;
    muzzleMesh.position.set(0, 0.02, 0.72);
    const mMat = new BABYLON.StandardMaterial("MuzMat", scene);
    mMat.emissiveColor = new BABYLON.Color3(0, 1, 1);
    muzzleMesh.material = mMat;
    muzzleMesh.isVisible = false;
  }

  // ========================================================================
  // VOXEL ARENA BUILDERS (High stepped walls like Poxel / Pixel Games)
  // ========================================================================
  function clearCurrentStage() {
    stageMeshes.forEach(m => m.dispose());
    stageMeshes = [];
    boneObstacles = [];
    if (currentBoss && currentBoss.root) {
      currentBoss.root.dispose();
      currentBoss = null;
    }
  }

  // Build high stacked stepped voxel battlements along perimeter
  function buildHighVoxelWalls(wallMat, trimMat) {
    const hw = ARENA_W / 2;
    const hl = ARENA_L / 2;

    // 1. Towering Main Perimeter Walls
    function makeWallSegment(x, z, w, d) {
      const wall = BABYLON.MeshBuilder.CreateBox("HighWall", { width: w, height: WALL_HEIGHT, depth: d }, scene);
      wall.position.set(x, WALL_HEIGHT / 2, z);
      wall.material = wallMat;

      // Stepped Top Rampart
      const rampart = BABYLON.MeshBuilder.CreateBox("Rampart", { width: w + 0.6, height: 1.5, depth: d + 0.6 }, scene);
      rampart.position.set(x, WALL_HEIGHT + 0.75, z);
      rampart.material = trimMat;

      stageMeshes.push(wall, rampart);
    }

    makeWallSegment(0, -hl, ARENA_W, 2.5);
    makeWallSegment(0, hl, ARENA_W, 2.5);
    makeWallSegment(-hw, 0, 2.5, ARENA_L);
    makeWallSegment(hw, 0, 2.5, ARENA_L);

    // 2. High Towering Corner Bastions (Voxel Pillars)
    [[-hw, -hl], [hw, -hl], [-hw, hl], [hw, hl]].forEach(([cx, cz]) => {
      const tower = BABYLON.MeshBuilder.CreateBox("CornerTower", { width: 7, height: WALL_HEIGHT + 6, depth: 7 }, scene);
      tower.position.set(cx, (WALL_HEIGHT + 6) / 2, cz);
      tower.material = wallMat;

      const towerCap = BABYLON.MeshBuilder.CreateBox("TowerCap", { width: 8, height: 2, depth: 8 }, scene);
      towerCap.position.set(cx, WALL_HEIGHT + 7, cz);
      towerCap.material = trimMat;

      stageMeshes.push(tower, towerCap);
    });

    // 3. Voxel Crenellation Teeth Along the Top Edge
    for (let x = -hw + 4; x <= hw - 4; x += 6) {
      [-hl, hl].forEach(z => {
        const cren = BABYLON.MeshBuilder.CreateBox("Cren", { width: 3, height: 2, depth: 2.8 }, scene);
        cren.position.set(x, WALL_HEIGHT + 2.2, z);
        cren.material = trimMat;
        stageMeshes.push(cren);
      });
    }
  }

  // --- STAGE 1: VOXEL CASTLE COURTYARD ---
  function buildCastleStage() {
    scene.clearColor = new BABYLON.Color4(0.48, 0.78, 0.98, 1.0);
    fillLight.diffuse = new BABYLON.Color3(1.0, 0.98, 0.92);

    // Checkered Green Turf Floor
    const ground = BABYLON.MeshBuilder.CreateGround("Ground", { width: ARENA_W, height: ARENA_L }, scene);
    const gMat = new BABYLON.StandardMaterial("GroundMat", scene);
    gMat.diffuseColor = new BABYLON.Color3(0.45, 0.82, 0.28);
    ground.material = gMat;
    stageMeshes.push(ground);

    // High Castle Stone Walls + Crimson Battlements
    const stoneMat = new BABYLON.StandardMaterial("CastleStone", scene);
    stoneMat.diffuseColor = new BABYLON.Color3(0.85, 0.88, 0.92);

    const redTrim = new BABYLON.StandardMaterial("RedTrim", scene);
    redTrim.diffuseColor = new BABYLON.Color3(0.9, 0.22, 0.18);

    buildHighVoxelWalls(stoneMat, redTrim);

    currentBoss = createCastleBoss();
  }

  // --- STAGE 2: DESERT CANYON (High Sandstone Walls & Jumpable Bone Ribs) ---
  function buildDesertStage() {
    scene.clearColor = new BABYLON.Color4(0.96, 0.82, 0.52, 1.0);
    fillLight.diffuse = new BABYLON.Color3(1.0, 0.88, 0.7);

    const ground = BABYLON.MeshBuilder.CreateGround("DesertGround", { width: ARENA_W, height: ARENA_L }, scene);
    const gMat = new BABYLON.StandardMaterial("DGround", scene);
    gMat.diffuseColor = new BABYLON.Color3(0.92, 0.72, 0.38);
    ground.material = gMat;
    stageMeshes.push(ground);

    const sandstoneMat = new BABYLON.StandardMaterial("SSand", scene);
    sandstoneMat.diffuseColor = new BABYLON.Color3(0.78, 0.52, 0.28);

    const darkSandMat = new BABYLON.StandardMaterial("SDark", scene);
    darkSandMat.diffuseColor = new BABYLON.Color3(0.58, 0.36, 0.18);

    buildHighVoxelWalls(sandstoneMat, darkSandMat);

    // Jumpable Bone Obstacles
    const boneMat = new BABYLON.StandardMaterial("BoneMat", scene);
    boneMat.diffuseColor = new BABYLON.Color3(0.96, 0.94, 0.86);

    for (let i = 0; i < 14; i++) {
      const bx = (Math.random() - 0.5) * (ARENA_W - 14);
      const bz = (Math.random() - 0.5) * (ARENA_L - 18);
      if (Math.hypot(bx, bz) < 10) continue;

      const rib = BABYLON.MeshBuilder.CreateTorus("BoneRib", { diameter: 5.2, thickness: 0.9, tessellation: 12 }, scene);
      rib.position.set(bx, 0.4, bz);
      rib.rotation.z = Math.PI / 2;
      rib.rotation.y = Math.random() * Math.PI;
      rib.material = boneMat;
      stageMeshes.push(rib);

      boneObstacles.push({ x: bx, z: bz, radius: 2.8, jumpHeight: 2.2 });
    }

    currentBoss = createDesertBoss();
  }

  // --- STAGE 3: JUNGLE CLEARING (Towering Forest Walls & Visual Bushes) ---
  function buildJungleStage() {
    scene.clearColor = new BABYLON.Color4(0.48, 0.85, 0.65, 1.0);
    fillLight.diffuse = new BABYLON.Color3(0.9, 1.0, 0.85);

    const ground = BABYLON.MeshBuilder.CreateGround("JungleGround", { width: ARENA_W, height: ARENA_L }, scene);
    const gMat = new BABYLON.StandardMaterial("JGround", scene);
    gMat.diffuseColor = new BABYLON.Color3(0.2, 0.65, 0.28);
    ground.material = gMat;
    stageMeshes.push(ground);

    const woodWallMat = new BABYLON.StandardMaterial("WoodWall", scene);
    woodWallMat.diffuseColor = new BABYLON.Color3(0.38, 0.24, 0.14);

    const foliageTrim = new BABYLON.StandardMaterial("FoliageTrim", scene);
    foliageTrim.diffuseColor = new BABYLON.Color3(0.18, 0.78, 0.32);

    buildHighVoxelWalls(woodWallMat, foliageTrim);

    // Foliage Bushes (Visual concealment only)
    for (let i = 0; i < 22; i++) {
      const fx = (Math.random() - 0.5) * (ARENA_W - 14);
      const fz = (Math.random() - 0.5) * (ARENA_L - 18);
      if (Math.hypot(fx, fz) < 10) continue;

      const bushNode = new BABYLON.TransformNode("BushRoot", scene);
      bushNode.position.set(fx, 0, fz);

      for (let b = 0; b < 3; b++) {
        const clump = BABYLON.MeshBuilder.CreateBox("LeafBox", { size: 2.2 + Math.random() }, scene);
        clump.parent = bushNode;
        clump.position.set((Math.random() - 0.5) * 1.5, 1.1 + Math.random() * 0.4, (Math.random() - 0.5) * 1.5);
        clump.material = foliageTrim;
      }
      stageMeshes.push(bushNode);
    }

    currentBoss = createJungleBoss();
  }

  // ========================================================================
  // ANIMATED BOSSES
  // ========================================================================
  function createCastleBoss() {
    const root = new BABYLON.TransformNode("CastleBoss", scene);
    root.position.set(0, 0, -22);

    const matStone = new BABYLON.StandardMaterial("BStone", scene);
    matStone.diffuseColor = new BABYLON.Color3(0.55, 0.62, 0.75);

    const matGold = new BABYLON.StandardMaterial("BGold", scene);
    matGold.diffuseColor = new BABYLON.Color3(1.0, 0.75, 0.1);

    const body = BABYLON.MeshBuilder.CreateBox("BBody", { width: 4.6, height: 4.8, depth: 4.0 }, scene);
    body.parent = root;
    body.position.y = 3.8;
    body.material = matStone;

    const crown = BABYLON.MeshBuilder.CreateBox("BCrown", { width: 3.2, height: 1.8, depth: 3.2 }, scene);
    crown.parent = body;
    crown.position.y = 3.2;
    crown.material = matGold;

    [-1.8, 1.8].forEach(x => {
      const cannon = BABYLON.MeshBuilder.CreateBox("BCannon", { width: 0.8, height: 0.8, depth: 3.5 }, scene);
      cannon.parent = body;
      cannon.position.set(x, 0.2, 2.2);
      cannon.material = matGold;
    });

    return {
      root, body, type: 0, name: "CITADEL GUARDIAN",
      speed: 6.0, attackTimer: 1.2, radius: 3.4, hp: 240, maxHp: 240, animTick: 0
    };
  }

  function createDesertBoss() {
    const root = new BABYLON.TransformNode("DesertBoss", scene);
    root.position.set(0, 0, -22);

    const matChitin = new BABYLON.StandardMaterial("BChitin", scene);
    matChitin.diffuseColor = new BABYLON.Color3(0.88, 0.55, 0.24);

    const matAmber = new BABYLON.StandardMaterial("BAmber", scene);
    matAmber.diffuseColor = new BABYLON.Color3(1.0, 0.4, 0.1);

    const body = BABYLON.MeshBuilder.CreateBox("DBody", { width: 5.2, height: 4.8, depth: 5.2 }, scene);
    body.parent = root;
    body.position.y = 3.4;
    body.material = matChitin;

    const horn = BABYLON.MeshBuilder.CreateBox("DHorn", { width: 1.4, height: 1.4, depth: 3.8 }, scene);
    horn.parent = body;
    horn.position.set(0, 0.2, 3.4);
    horn.material = matAmber;

    return {
      root, body, type: 1, name: "DUNE COLOSSUS",
      speed: 9.5, attackTimer: 0.7, radius: 3.4, hp: 320, maxHp: 320, animTick: 0
    };
  }

  function createJungleBoss() {
    const root = new BABYLON.TransformNode("JungleBoss", scene);
    root.position.set(0, 0, -22);

    const matBark = new BABYLON.StandardMaterial("BBark", scene);
    matBark.diffuseColor = new BABYLON.Color3(0.18, 0.55, 0.22);

    const matBloom = new BABYLON.StandardMaterial("BBloom", scene);
    matBloom.diffuseColor = new BABYLON.Color3(1.0, 0.15, 0.5);

    const body = BABYLON.MeshBuilder.CreateBox("JBody", { width: 4.2, height: 5.0, depth: 3.4 }, scene);
    body.parent = root;
    body.position.y = 3.8;
    body.material = matBark;

    const head = BABYLON.MeshBuilder.CreateBox("JHead", { size: 2.4 }, scene);
    head.parent = body;
    head.position.y = 3.2;
    head.material = matBloom;

    return {
      root, body, type: 2, name: "VERDANT STALKER",
      speed: 8.0, attackTimer: 1.4, radius: 3.4, hp: 400, maxHp: 400, animTick: 0
    };
  }

  function loadStage(idx) {
    clearCurrentStage();
    state.stageIndex = idx % 3;
    if (state.stageIndex === 0) buildCastleStage();
    else if (state.stageIndex === 1) buildDesertStage();
    else buildJungleStage();

    state.bossHp = currentBoss.maxHp;
    state.bossMaxHp = currentBoss.maxHp;
    updateHUD();
  }

  // ========================================================================
  // PROJECTILES & SHOOTING
  // ========================================================================
  function shootProjectile(origin, dir, isPlayer = false, color = new BABYLON.Color3(0, 1, 1), speed = 55) {
    const box = BABYLON.MeshBuilder.CreateBox("Bullet", { size: 0.6 }, scene);
    const bMat = new BABYLON.StandardMaterial("BMat", scene);
    bMat.emissiveColor = color;
    box.material = bMat;
    box.position.copyFrom(origin);

    projectiles.push({
      mesh: box,
      isPlayer,
      dir: dir.normalize(),
      speed,
      life: 2.6
    });

    playSound(isPlayer ? 'fire' : 'enemy_fire');
  }

  function playerFire() {
    if (weaponRecoil > 0.05) return;
    weaponRecoil = 0.35;
    muzzleMesh.isVisible = true;
    setTimeout(() => { muzzleMesh.isVisible = false; }, 45);

    // Fire directly into the center crosshair
    const forward = camera.getForwardRay().direction;
    const spawnPos = camera.position.add(forward.scale(1.2));
    shootProjectile(spawnPos, forward, true, new BABYLON.Color3(0.0, 0.95, 1.0), 65);
  }

  function advanceStage() {
    if (state.isTransitioning) return;
    state.isTransitioning = true;
    playSound('fanfare');

    const fade = document.getElementById('fps-stage-fade');
    if (fade) fade.style.opacity = '1';

    setTimeout(() => {
      state.bossesDefeated++;
      loadStage(state.bossesDefeated);
      projectiles.forEach(p => p.mesh.dispose());
      projectiles = [];
      camera.position.set(0, 2.0, 24);

      if (fade) fade.style.opacity = '0';
      state.isTransitioning = false;
    }, 600);
  }

  // ========================================================================
  // DUAL CONTROLS: DESKTOP & MOBILE
  // ========================================================================
  function setupControls() {
    const keys = {};

    window.addEventListener('keydown', (e) => {
      keys[e.code] = true;
      if (e.code === 'Space' && Math.abs(camera.position.y - 2.0) < 0.1) {
        playerVy = 13.0;
      }
      if (e.key === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        playerFire();
      }
    });

    window.addEventListener('keyup', (e) => {
      keys[e.code] = false;
    });

    // Pointer Lock on Canvas Click
    canvas.addEventListener('click', () => {
      if (!state.isMobile && !isPointerLocked) {
        canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock;
        if (canvas.requestPointerLock) canvas.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      isPointerLocked = (document.pointerLockElement === canvas);
    });

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 0 && !state.isMobile) {
        playerFire();
      }
    });

    scene.registerBeforeRender(() => {
      if (!state.isMobile) {
        input.forward = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
        input.right = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
      }
    });

    // Mobile Virtual Joystick & Touch Controls
    if (state.isMobile) {
      const mobUI = document.getElementById('mobile-ui');
      if (mobUI) mobUI.style.display = 'block';

      const base = document.getElementById('joystick-base');
      const knob = document.getElementById('joystick-knob');
      let touchId = null, baseRect = null;

      if (base) {
        base.addEventListener('touchstart', (e) => {
          e.preventDefault();
          touchId = e.changedTouches[0].identifier;
          baseRect = base.getBoundingClientRect();
        }, { passive: false });

        window.addEventListener('touchmove', (e) => {
          if (touchId === null) return;
          for (let t of e.changedTouches) {
            if (t.identifier === touchId) {
              const dx = t.clientX - (baseRect.left + baseRect.width / 2);
              const dy = t.clientY - (baseRect.top + baseRect.height / 2);
              const dist = Math.min(48, Math.hypot(dx, dy));
              const angle = Math.atan2(dy, dx);

              if (knob) knob.style.transform = `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist}px))`;
              input.right = (Math.cos(angle) * dist) / 48;
              input.forward = -(Math.sin(angle) * dist) / 48;
            }
          }
        }, { passive: false });

        const endTouch = (e) => {
          for (let t of e.changedTouches) {
            if (t.identifier === touchId) {
              touchId = null;
              if (knob) knob.style.transform = 'translate(-50%, -50%)';
              input.forward = 0; input.right = 0;
            }
          }
        };
        window.addEventListener('touchend', endTouch);
        window.addEventListener('touchcancel', endTouch);
      }

      const btnJump = document.getElementById('btn-jump');
      if (btnJump) {
        btnJump.addEventListener('touchstart', (e) => {
          e.preventDefault();
          if (Math.abs(camera.position.y - 2.0) < 0.1) playerVy = 13.0;
        });
      }

      const btnFire = document.getElementById('btn-fire');
      if (btnFire) {
        btnFire.addEventListener('touchstart', (e) => {
          e.preventDefault();
          playerFire();
        });
      }
    }
  }

  // ========================================================================
  // MAIN GAME ENGINE LOOP
  // ========================================================================
  const currentScene = createScene();
  setupControls();

  engine.runRenderLoop(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.1);

    if (!state.isGameOver) {
      // 1. Move FPS Player Kinematics
      const moveMag = Math.hypot(input.forward, input.right);
      const camForward = camera.getForwardRay().direction;
      camForward.y = 0;
      camForward.normalize();

      const camRight = new BABYLON.Vector3(camForward.z, 0, -camForward.x);

      if (moveMag > 0.05) {
        const moveDir = camForward.scale(input.forward).add(camRight.scale(input.right)).normalize();
        const nextX = camera.position.x + moveDir.x * 16 * dt;
        const nextZ = camera.position.z + moveDir.z * 16 * dt;

        // Bone Obstacle Collision (Desert)
        let blocked = false;
        for (let b of boneObstacles) {
          if (Math.hypot(nextX - b.x, nextZ - b.z) < 1.6 + b.radius) {
            if (camera.position.y < b.jumpHeight + 1.2) {
              blocked = true;
              break;
            }
          }
        }

        if (!blocked) {
          camera.position.x = nextX;
          camera.position.z = nextZ;
        }

        // Viewmodel Sway
        walkBob += dt * 10;
        weaponRoot.position.y = -0.32 + Math.sin(walkBob) * 0.02;
        weaponRoot.position.x = 0.38 + Math.cos(walkBob * 0.5) * 0.015;
      } else {
        weaponRoot.position.y = -0.32;
        weaponRoot.position.x = 0.38;
      }

      // Constrain inside Arena bounds
      camera.position.x = Math.max(-ARENA_W / 2 + 3, Math.min(ARENA_W / 2 - 3, camera.position.x));
      camera.position.z = Math.max(-ARENA_L / 2 + 3, Math.min(ARENA_L / 2 - 3, camera.position.z));

      // Gravity & Vertical Jumping
      camera.position.y += playerVy * dt;
      if (camera.position.y > 2.0) {
        playerVy -= 32 * dt;
      } else {
        camera.position.y = 2.0;
        playerVy = 0;
      }

      // Weapon Recoil Recovery
      if (weaponRecoil > 0) {
        weaponRoot.position.z = 0.75 - weaponRecoil * 0.35;
        weaponRoot.rotation.x = -weaponRecoil * 0.45;
        weaponRecoil -= dt * 2.2;
      } else {
        weaponRoot.position.z = 0.75;
        weaponRoot.rotation.x = 0;
      }

      // 2. Boss AI
      if (currentBoss && !state.isTransitioning) {
        const toPlayer = camera.position.subtract(currentBoss.root.position);
        toPlayer.y = 0;
        const dist = toPlayer.length();
        toPlayer.normalize();

        currentBoss.root.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
        currentBoss.animTick += dt * 4;
        currentBoss.body.position.y = 3.6 + Math.sin(currentBoss.animTick) * 0.4;

        if (dist > 14) {
          currentBoss.root.position.x += toPlayer.x * currentBoss.speed * dt;
          currentBoss.root.position.z += toPlayer.z * currentBoss.speed * dt;
        }

        currentBoss.attackTimer -= dt;
        if (currentBoss.attackTimer <= 0) {
          const spawnPos = currentBoss.root.position.add(new BABYLON.Vector3(0, 3.2, 0));
          if (currentBoss.type === 0) {
            // Citadel Guardian: Triple Shells
            for (let a = -0.25; a <= 0.25; a += 0.25) {
              const dir = new BABYLON.Vector3(toPlayer.x + a * toPlayer.z, 0, toPlayer.z - a * toPlayer.x);
              shootProjectile(spawnPos, dir, false, new BABYLON.Color3(1.0, 0.2, 0.1), 35);
            }
            currentBoss.attackTimer = 1.4;
          } else if (currentBoss.type === 1) {
            // Dune Colossus: Rapid Sand Burst
            shootProjectile(spawnPos, toPlayer, false, new BABYLON.Color3(1.0, 0.6, 0.0), 45);
            currentBoss.attackTimer = 0.45;
          } else {
            // Verdant Stalker: Radial Nova Blast
            for (let i = 0; i < 10; i++) {
              const ang = (i / 10) * Math.PI * 2;
              shootProjectile(spawnPos, new BABYLON.Vector3(Math.cos(ang), 0, Math.sin(ang)), false, new BABYLON.Color3(0.2, 0.9, 0.3), 28);
            }
            currentBoss.attackTimer = 2.0;
          }
        }
      }

      // 3. Projectiles Simulation
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.mesh.position.addInPlace(p.dir.scale(p.speed * dt));
        p.life -= dt;

        if (Math.abs(p.mesh.position.x) > ARENA_W / 2 || Math.abs(p.mesh.position.z) > ARENA_L / 2 || p.life <= 0) {
          p.mesh.dispose();
          projectiles.splice(i, 1);
          continue;
        }

        // Bones in Desert block enemy bullets
        if (!p.isPlayer) {
          let hitBone = false;
          for (let b of boneObstacles) {
            if (Math.hypot(p.mesh.position.x - b.x, p.mesh.position.z - b.z) < b.radius) {
              hitBone = true;
              break;
            }
          }
          if (hitBone) {
            p.mesh.dispose();
            projectiles.splice(i, 1);
            continue;
          }
        }

        // Player bullet hits Boss
        if (p.isPlayer && currentBoss) {
          const distToBoss = Math.hypot(p.mesh.position.x - currentBoss.root.position.x, p.mesh.position.z - currentBoss.root.position.z);
          if (distToBoss < currentBoss.radius) {
            state.bossHp -= 14;
            playSound('hit');
            p.mesh.dispose();
            projectiles.splice(i, 1);

            if (state.bossHp <= 0) advanceStage();
            updateHUD();
            continue;
          }
        }

        // Boss bullet hits Player
        if (!p.isPlayer) {
          const distToPlayer = Math.hypot(p.mesh.position.x - camera.position.x, p.mesh.position.z - camera.position.z);
          if (distToPlayer < 1.6) {
            state.playerHp -= 12;
            playSound('hit');
            p.mesh.dispose();
            projectiles.splice(i, 1);

            if (state.playerHp <= 0) {
              // Instant Restart
              state.playerHp = state.playerMaxHp;
              state.bossesDefeated = 0;
              loadStage(0);
              camera.position.set(0, 2.0, 24);
            }
            updateHUD();
            continue;
          }
        }
      }
    }

    currentScene.render();
  });

  window.addEventListener('resize', () => {
    engine.resize();
  });
});