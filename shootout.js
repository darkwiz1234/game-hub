// ============================================================================
// SHOOTOUT ⚔️ — Babylon.js Game Runtime (shootout.js)
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
    stencil: true,
    antialias: true
  });

  // --- GAME STATE ---
  const state = {
    stage: 0,
    score: 0,
    playerHp: 100,
    maxHp: 100,
    bossHp: 260,
    maxBossHp: 260,
    isTransitioning: false,
    isMobile: /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 820
  };

  const ARENA_W = 100;
  const ARENA_L = 100;
  const WALL_H = 18;

  let scene, camera, sun, fillLight, shadowGen;
  let boss = null;
  let stageMeshes = [];
  let solidObstacles = []; // Solid collision meshes (block movement & 100% block bullets)
  let ladders = [];        // Climbable ladder zones
  let bullets = [];

  // Health Orb Drop (20-25 seconds)
  let healthOrb = null;
  let orbDropTimer = 22.0;

  // FPS Viewmodel Rig
  let weaponRoot, muzzleFlash, recoil = 0;
  let walkBob = 0, playerVy = 0;
  let isPointerLocked = false;
  let isClimbing = false;
  const input = { forward: 0, right: 0 };

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
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(130, now + 0.1);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.1);
      osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'enemy_fire') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.18);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.18);
      osc.start(now); osc.stop(now + 0.18);
    } else if (type === 'hit') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.linearRampToValueAtTime(30, now + 0.14);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.14);
      osc.start(now); osc.stop(now + 0.14);
    } else if (type === 'heal') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(860, now + 0.35);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.35);
      osc.start(now); osc.stop(now + 0.35);
    } else if (type === 'fanfare') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(820, now + 0.4);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.4);
      osc.start(now); osc.stop(now + 0.4);
    }
  }

  function showToast(msg, color = "#00ffaa") {
    const t = document.getElementById('toast-banner');
    if (!t) return;
    t.innerText = msg;
    t.style.color = color;
    t.style.borderColor = color;
    t.style.textShadow = `0 0 10px ${color}`;
    t.style.opacity = '1';
    setTimeout(() => { t.style.opacity = '0'; }, 2000);
  }

  // ========================================================================
  // FAIL-PROOF PROCEDURAL TEXTURE GENERATION
  // ========================================================================
  function createProceduralTexture(type) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const ctx = c.getContext('2d');

    if (type === 'castle-turf') {
      ctx.fillStyle = '#56b820'; ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = '#489e18'; ctx.lineWidth = 12;
      for (let y = 0; y < 512; y += 64) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke();
      }
      for (let i = 0; i < 600; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#6ad627' : '#3f8c14';
        ctx.fillRect(Math.random() * 512, Math.random() * 512, 4, 10);
      }
    } else if (type === 'castle-stone') {
      ctx.fillStyle = '#d5dbe4'; ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = '#758294'; ctx.lineWidth = 8;
      const rows = 8, cols = 4;
      const rh = 512 / rows, cw = 512 / cols;
      for (let r = 0; r < rows; r++) {
        const offset = (r % 2) * (cw / 2);
        for (let col = -1; col <= cols; col++) {
          ctx.strokeRect(col * cw + offset, r * rh, cw, rh);
          for (let p = 0; p < 5; p++) {
            ctx.fillStyle = Math.random() > 0.5 ? '#b8c4d4' : '#eef4fc';
            ctx.fillRect(col * cw + offset + Math.random() * (cw - 12), r * rh + Math.random() * (rh - 12), 12, 10);
          }
        }
      }
    } else if (type === 'military-sand') {
      ctx.fillStyle = '#d9a74a'; ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = '#c79438';
      for (let i = 0; i < 1400; i++) ctx.fillRect(Math.random() * 512, Math.random() * 512, 3, 3);
      ctx.strokeStyle = '#b8852d'; ctx.lineWidth = 14;
      ctx.beginPath(); ctx.moveTo(0, 150); ctx.bezierCurveTo(150, 220, 350, 80, 512, 160); ctx.stroke();
    } else if (type === 'city-road') {
      ctx.fillStyle = '#22252a'; ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = '#2d323b';
      for (let i = 0; i < 1600; i++) ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
      // Double solid yellow line
      ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(0, 250); ctx.lineTo(512, 250); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 262); ctx.lineTo(512, 262); ctx.stroke();
      // White boundary curbs
      ctx.strokeStyle = '#ecf0f1'; ctx.lineWidth = 12;
      ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(512, 10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 502); ctx.lineTo(512, 502); ctx.stroke();
    }

    const tex = new BABYLON.DynamicTexture("pTex_" + type, c, scene);
    tex.wrapU = tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    return tex;
  }

  // ========================================================================
  // SCENE, SKYBOX, LIGHTING & FPS CAMERA
  // ========================================================================
  scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.35, 0.72, 1.0, 1.0);

  // FPS Eye Camera
  camera = new BABYLON.UniversalCamera("FpsCam", new BABYLON.Vector3(0, 2.0, 36), scene);
  camera.setTarget(new BABYLON.Vector3(0, 2.0, 0));
  camera.speed = 0;
  camera.angularSensibility = 2200;
  camera.minZ = 0.1;
  camera.fov = 1.15;
  camera.attachControl(canvas, true);

  // Sunlight and Ambient Fill
  fillLight = new BABYLON.HemisphericLight("FillLight", new BABYLON.Vector3(0, 1, 0), scene);
  fillLight.intensity = 0.95;
  fillLight.diffuse = new BABYLON.Color3(1.0, 0.98, 0.92);
  fillLight.groundColor = new BABYLON.Color3(0.4, 0.45, 0.35);

  sun = new BABYLON.DirectionalLight("Sun", new BABYLON.Vector3(-0.6, -1.3, -0.7), scene);
  sun.position = new BABYLON.Vector3(40, 80, 50);
  sun.intensity = 1.35;

  shadowGen = new BABYLON.ShadowGenerator(1024, sun);
  shadowGen.useBlurExponentialShadowMap = true;
  shadowGen.blurKernel = 16;
  shadowGen.darkness = 0.45;

  // 3D Fluffy Clouds
  const cloudMat = new BABYLON.StandardMaterial("CloudMat", scene);
  cloudMat.diffuseColor = new BABYLON.Color3(1, 1, 1);
  cloudMat.emissiveColor = new BABYLON.Color3(0.9, 0.94, 1.0);

  for (let c = 0; c < 14; c++) {
    const cloudRoot = new BABYLON.TransformNode("Cloud", scene);
    cloudRoot.position.set((Math.random() - 0.5) * 180, 38 + Math.random() * 8, (Math.random() - 0.5) * 180);
    for (let p = 0; p < 4; p++) {
      const part = BABYLON.MeshBuilder.CreateSphere("CPart", { diameter: 8 + Math.random() * 5 }, scene);
      part.parent = cloudRoot;
      part.position.set((p - 1.5) * 4.5, 0, (Math.random() - 0.5) * 3.5);
      part.material = cloudMat;
    }
  }

  // ========================================================================
  // FIRST PERSON VIEWMODEL GUN (Attached directly to Camera)
  // ========================================================================
  weaponRoot = new BABYLON.TransformNode("WeaponRoot", scene);
  weaponRoot.parent = camera;
  weaponRoot.position.set(0.4, -0.32, 0.78);

  const matGunMetal = new BABYLON.StandardMaterial("gMetal", scene);
  matGunMetal.diffuseColor = new BABYLON.Color3(0.18, 0.24, 0.35);
  matGunMetal.specularColor = new BABYLON.Color3(0.5, 0.6, 0.8);

  const matGunGold = new BABYLON.StandardMaterial("gGold", scene);
  matGunGold.diffuseColor = new BABYLON.Color3(1.0, 0.78, 0.15);
  matGunGold.specularColor = new BABYLON.Color3(1.0, 0.9, 0.5);

  const wChassis = BABYLON.MeshBuilder.CreateBox("wChassis", { width: 0.18, height: 0.22, depth: 0.7 }, scene);
  wChassis.parent = weaponRoot;
  wChassis.material = matGunMetal;

  const wRail = BABYLON.MeshBuilder.CreateBox("wRail", { width: 0.12, height: 0.08, depth: 0.5 }, scene);
  wRail.parent = weaponRoot;
  wRail.position.set(0, 0.13, 0.05);
  wRail.material = matGunGold;

  [-0.045, 0.045].forEach(bx => {
    const b = BABYLON.MeshBuilder.CreateCylinder("wB", { height: 0.45, diameter: 0.08 }, scene);
    b.parent = weaponRoot;
    b.rotation.x = Math.PI / 2;
    b.position.set(bx, 0.02, 0.48);
    b.material = matGunGold;
  });

  muzzleFlash = BABYLON.MeshBuilder.CreateSphere("MuzFlash", { diameter: 0.22 }, scene);
  muzzleFlash.parent = weaponRoot;
  muzzleFlash.position.set(0, 0.02, 0.75);
  const mMat = new BABYLON.StandardMaterial("mFlash", scene);
  mMat.emissiveColor = new BABYLON.Color3(0.0, 1.0, 1.0);
  muzzleFlash.material = mMat;
  muzzleFlash.isVisible = false;

  // ========================================================================
  // HEALTH ORB SYSTEM (Spawns every 20-25 seconds)
  // ========================================================================
  function spawnHealthOrb() {
    if (healthOrb && healthOrb.root) {
      healthOrb.root.dispose();
      healthOrb = null;
    }

    const root = new BABYLON.TransformNode("HealthOrbRoot", scene);
    const orbSphere = BABYLON.MeshBuilder.CreateSphere("OrbSphere", { diameter: 1.6 }, scene);
    orbSphere.parent = root;

    const orbMat = new BABYLON.StandardMaterial("OrbMat", scene);
    orbMat.emissiveColor = new BABYLON.Color3(0.0, 1.0, 0.6);
    orbSphere.material = orbMat;

    const haloRing = BABYLON.MeshBuilder.CreateTorus("OrbHalo", { diameter: 2.4, thickness: 0.2, tessellation: 20 }, scene);
    haloRing.parent = root;
    const haloMat = new BABYLON.StandardMaterial("HaloMat", scene);
    haloMat.emissiveColor = new BABYLON.Color3(0.0, 0.9, 1.0);
    haloRing.material = haloMat;

    // Random location on ground
    const rx = (Math.random() - 0.5) * (ARENA_W - 24);
    const rz = (Math.random() - 0.5) * (ARENA_L - 24);
    root.position.set(rx, 1.8, rz);

    healthOrb = { root, orbSphere, haloRing, radius: 2.2, animTime: 0 };
    showToast("VITALITY ORB DROPPED! +25% HP", "#00ffaa");
  }

  // ========================================================================
  // STAGES CLEANUP & SYSTEM
  // ========================================================================
  function clearCurrentStage() {
    stageMeshes.forEach(m => m.dispose());
    stageMeshes = [];
    solidObstacles = [];
    ladders = [];
    if (healthOrb && healthOrb.root) {
      healthOrb.root.dispose();
      healthOrb = null;
    }
    if (boss && boss.root) {
      boss.root.dispose();
      boss = null;
    }
  }

  // ------------------------------------------------------------------------
  // STAGE 1: CARTOON CASTLE COURTYARD (Solid Turf, High Walls, Corner Keeps)
  // ------------------------------------------------------------------------
  function buildCastleStage() {
    scene.clearColor = new BABYLON.Color4(0.35, 0.72, 1.0, 1.0);

    // Guaranteed Opaque Solid Ground Plane
    const floor = BABYLON.MeshBuilder.CreateGround("Floor", { width: ARENA_W, height: ARENA_L }, scene);
    floor.position.y = 0;
    const fMat = new BABYLON.StandardMaterial("CastleFloorMat", scene);
    const turfTex = createProceduralTexture('castle-turf');
    turfTex.uScale = 12; turfTex.vScale = 12;
    fMat.diffuseTexture = turfTex;
    fMat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
    floor.material = fMat;
    floor.receiveShadows = true;
    stageMeshes.push(floor);

    const stoneTex = createProceduralTexture('castle-stone');
    stoneTex.uScale = 8; stoneTex.vScale = 4;

    const wallMat = new BABYLON.StandardMaterial("cWallMat", scene);
    wallMat.diffuseTexture = stoneTex;

    const redMat = new BABYLON.StandardMaterial("cRedMat", scene);
    redMat.diffuseColor = new BABYLON.Color3(0.92, 0.18, 0.14);

    const goldMat = new BABYLON.StandardMaterial("cGoldMat", scene);
    goldMat.diffuseColor = new BABYLON.Color3(1.0, 0.78, 0.15);

    const ironMat = new BABYLON.StandardMaterial("cIronMat", scene);
    ironMat.diffuseColor = new BABYLON.Color3(0.18, 0.2, 0.24);

    const hw = ARENA_W / 2;
    const hl = ARENA_L / 2;

    function makeCastleWall(x, z, w, d) {
      const footing = BABYLON.MeshBuilder.CreateBox("WFooting", { width: w + 1.6, height: 2.2, depth: d + 1.6 }, scene);
      footing.position.set(x, 1.1, z);
      footing.material = ironMat;

      const wall = BABYLON.MeshBuilder.CreateBox("WallBody", { width: w, height: WALL_H - 2.2, depth: d }, scene);
      wall.position.set(x, 2.2 + (WALL_H - 2.2) / 2, z);
      wall.material = wallMat;

      const trim = BABYLON.MeshBuilder.CreateBox("WallTrim", { width: w + 0.8, height: 1.4, depth: d + 0.8 }, scene);
      trim.position.set(x, WALL_H + 0.7, z);
      trim.material = redMat;

      shadowGen.addShadowCaster(footing);
      shadowGen.addShadowCaster(wall);
      shadowGen.addShadowCaster(trim);
      stageMeshes.push(footing, wall, trim);

      solidObstacles.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, maxY: WALL_H + 1.5 });
    }
    makeCastleWall(0, -hl, ARENA_W, 3.0);
    makeCastleWall(0, hl, ARENA_W, 3.0);
    makeCastleWall(-hw, 0, 3.0, ARENA_L);
    makeCastleWall(hw, 0, 3.0, ARENA_L);

    // 4 Corner Towers with Crown Badges & Pitched Scarlet Roofs
    [[-hw, -hl], [hw, -hl], [-hw, hl], [hw, hl]].forEach(([cx, cz]) => {
      const baseIron = BABYLON.MeshBuilder.CreateBox("TBaseIron", { width: 12, height: 2.5, depth: 12 }, scene);
      baseIron.position.set(cx, 1.25, cz);
      baseIron.material = ironMat;

      const tier1 = BABYLON.MeshBuilder.CreateBox("TTier1", { width: 10.5, height: 6.0, depth: 10.5 }, scene);
      tier1.position.set(cx, 2.5 + 3.0, cz);
      tier1.material = wallMat;

      const crownPlaque = BABYLON.MeshBuilder.CreateBox("CrownPlaque", { width: 3.6, height: 2.4, depth: 0.6 }, scene);
      crownPlaque.position.set(cx, 5.5, cz < 0 ? cz + 5.5 : cz - 5.5);
      crownPlaque.material = goldMat;

      const shaft = BABYLON.MeshBuilder.CreateCylinder("TShaft", { height: WALL_H - 2, diameter: 8.5, tessellation: 12 }, scene);
      shaft.position.set(cx, 8.5 + (WALL_H - 2) / 2, cz);
      shaft.material = wallMat;

      const roofEaves = BABYLON.MeshBuilder.CreateCylinder("TRoofEaves", { height: 1.2, diameter: 12.5, tessellation: 12 }, scene);
      roofEaves.position.set(cx, WALL_H + 7.5, cz);
      roofEaves.material = redMat;

      const roofCone = BABYLON.MeshBuilder.CreateCylinder("TRoofCone", { height: 9.0, diameterTop: 0, diameterBottom: 11.5, tessellation: 12 }, scene);
      roofCone.position.set(cx, WALL_H + 12.5, cz);
      roofCone.material = redMat;

      const finial = BABYLON.MeshBuilder.CreateSphere("TFinial", { diameter: 1.8 }, scene);
      finial.position.set(cx, WALL_H + 17.5, cz);
      finial.material = goldMat;

      shadowGen.addShadowCaster(baseIron);
      shadowGen.addShadowCaster(tier1);
      shadowGen.addShadowCaster(roofCone);
      stageMeshes.push(baseIron, tier1, crownPlaque, shaft, roofEaves, roofCone, finial);

      solidObstacles.push({ minX: cx - 6, maxX: cx + 6, minZ: cz - 6, maxZ: cz + 6, maxY: WALL_H + 18 });
    });

    // Interior Stone Cover Pillars
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const px = Math.cos(ang) * 28;
      const pz = Math.sin(ang) * 28;

      const pillar = BABYLON.MeshBuilder.CreateBox("Pillar", { width: 3.4, height: 5.5, depth: 3.4 }, scene);
      pillar.position.set(px, 2.75, pz);
      pillar.material = wallMat;

      const pCap = BABYLON.MeshBuilder.CreateBox("PCap", { width: 3.8, height: 1.0, depth: 3.8 }, scene);
      pCap.position.set(px, 6.0, pz);
      pCap.material = redMat;

      shadowGen.addShadowCaster(pillar);
      stageMeshes.push(pillar, pCap);
      solidObstacles.push({ minX: px - 1.8, maxX: px + 1.8, minZ: pz - 1.8, maxZ: pz + 1.8, maxY: 6.5 });
    }

    boss = createCenterBoss(0, "CITADEL GOLEM", 260, new BABYLON.Color3(0.55, 0.62, 0.75));
  }

  // ------------------------------------------------------------------------
  // STAGE 2: MILITARY OUTPOST BASE (Watchtowers with Climbable Ladders)
  // ------------------------------------------------------------------------
  function buildMilitaryBaseStage() {
    scene.clearColor = new BABYLON.Color4(0.95, 0.82, 0.52, 1.0);

    // Solid Sand / Concrete Base Floor
    const floor = BABYLON.MeshBuilder.CreateGround("Floor", { width: ARENA_W, height: ARENA_L }, scene);
    floor.position.y = 0;
    const fMat = new BABYLON.StandardMaterial("BaseFloorMat", scene);
    const sandTex = createProceduralTexture('military-sand');
    sandTex.uScale = 12; sandTex.vScale = 12;
    fMat.diffuseTexture = sandTex;
    fMat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
    floor.material = fMat;
    floor.receiveShadows = true;
    stageMeshes.push(floor);

    const metalMat = new BABYLON.StandardMaterial("TowerMetalMat", scene);
    metalMat.diffuseColor = new BABYLON.Color3(0.3, 0.35, 0.4);

    const woodPlankMat = new BABYLON.StandardMaterial("PlankMat", scene);
    woodPlankMat.diffuseColor = new BABYLON.Color3(0.65, 0.45, 0.25);

    const ladderMat = new BABYLON.StandardMaterial("LadderMat", scene);
    ladderMat.diffuseColor = new BABYLON.Color3(0.9, 0.7, 0.1);

    const crateMat = new BABYLON.StandardMaterial("CrateMat", scene);
    crateMat.diffuseColor = new BABYLON.Color3(0.5, 0.4, 0.28);

    const hw = ARENA_W / 2;
    const hl = ARENA_L / 2;

    // Perimeter Outpost Walls
    function makeOutpostWall(x, z, w, d) {
      const wall = BABYLON.MeshBuilder.CreateBox("OutpostWall", { width: w, height: WALL_H, depth: d }, scene);
      wall.position.set(x, WALL_H / 2, z);
      wall.material = metalMat;
      shadowGen.addShadowCaster(wall);
      stageMeshes.push(wall);
      solidObstacles.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, maxY: WALL_H });
    }
    makeOutpostWall(0, -hl, ARENA_W, 3.0);
    makeOutpostWall(0, hl, ARENA_W, 3.0);
    makeOutpostWall(-hw, 0, 3.0, ARENA_L);
    makeOutpostWall(hw, 0, 3.0, ARENA_L);

    // 4 High Watchtowers with Platforms & Climbable Ladders
    const towerCoords = [[-26, -26], [26, -26], [-26, 26], [26, 26]];
    towerCoords.forEach(([tx, tz], idx) => {
      const PLATFORM_Y = 8.5;

      // 4 Metal Legs
      [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]].forEach(([lx, lz]) => {
        const leg = BABYLON.MeshBuilder.CreateCylinder("TLeg", { height: PLATFORM_Y, diameter: 0.5 }, scene);
        leg.position.set(tx + lx, PLATFORM_Y / 2, tz + lz);
        leg.material = metalMat;
        stageMeshes.push(leg);
      });

      // Wooden Sniper Deck Platform
      const deck = BABYLON.MeshBuilder.CreateBox("TDeck", { width: 6.5, height: 0.6, depth: 6.5 }, scene);
      deck.position.set(tx, PLATFORM_Y, tz);
      deck.material = woodPlankMat;
      shadowGen.addShadowCaster(deck);
      stageMeshes.push(deck);

      // Guardrails
      const railFront = BABYLON.MeshBuilder.CreateBox("TRailF", { width: 6.5, height: 1.4, depth: 0.3 }, scene);
      railFront.position.set(tx, PLATFORM_Y + 0.8, tz - 3.1);
      railFront.material = metalMat;

      const railBack = BABYLON.MeshBuilder.CreateBox("TRailB", { width: 6.5, height: 1.4, depth: 0.3 }, scene);
      railBack.position.set(tx, PLATFORM_Y + 0.8, tz + 3.1);
      railBack.material = metalMat;
      stageMeshes.push(railFront, railBack);

      // Interactive Climbable Ladder on Front Face
      const ladder = BABYLON.MeshBuilder.CreateBox(`Ladder_${idx}`, { width: 1.4, height: PLATFORM_Y, depth: 0.3 }, scene);
      ladder.position.set(tx, PLATFORM_Y / 2, tz - 3.25);
      ladder.material = ladderMat;
      stageMeshes.push(ladder);

      // Register Ladder Zone
      ladders.push({
        x: tx, z: tz - 3.25,
        radius: 2.2,
        platformY: PLATFORM_Y + 1.8
      });

      // Register Solid Obstacle for Deck & Posts
      solidObstacles.push({
        minX: tx - 3.25, maxX: tx + 3.25,
        minZ: tz - 3.25, maxZ: tz + 3.25,
        platformTop: PLATFORM_Y + 0.3,
        maxY: PLATFORM_Y + 2.0
      });
    });

    // Supply Crates for Ground Cover
    for (let c = 0; c < 12; c++) {
      const ang = (c / 12) * Math.PI * 2 + 0.3;
      const dist = 18 + (c % 3) * 6;
      const cx = Math.cos(ang) * dist;
      const cz = Math.sin(ang) * dist;

      const crate = BABYLON.MeshBuilder.CreateBox("Crate", { width: 3.2, height: 2.4, depth: 3.2 }, scene);
      crate.position.set(cx, 1.2, cz);
      crate.material = crateMat;
      shadowGen.addShadowCaster(crate);
      stageMeshes.push(crate);

      solidObstacles.push({ minX: cx - 1.6, maxX: cx + 1.6, minZ: cz - 1.6, maxZ: cz + 1.6, maxY: 2.5 });
    }

    boss = createCenterBoss(1, "DESERT WARLORD", 340, new BABYLON.Color3(0.85, 0.55, 0.22));
  }

  // ------------------------------------------------------------------------
  // STAGE 3: METROPOLITAN CITY (Solid Cars & Skyscrapers - 100% Bulletproof)
  // ------------------------------------------------------------------------
  function buildCityStage() {
    scene.clearColor = new BABYLON.Color4(0.42, 0.65, 0.85, 1.0);

    // Solid Asphalt Street Floor
    const floor = BABYLON.MeshBuilder.CreateGround("CityFloor", { width: ARENA_W, height: ARENA_L }, scene);
    floor.position.y = 0;
    const fMat = new BABYLON.StandardMaterial("CityRoadMat", scene);
    const roadTex = createProceduralTexture('city-road');
    roadTex.uScale = 8; roadTex.vScale = 8;
    fMat.diffuseTexture = roadTex;
    fMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
    floor.material = fMat;
    floor.receiveShadows = true;
    stageMeshes.push(floor);

    const hw = ARENA_W / 2;
    const hl = ARENA_L / 2;

    const concreteMat = new BABYLON.StandardMaterial("bldgConcMat", scene);
    concreteMat.diffuseColor = new BABYLON.Color3(0.32, 0.36, 0.42);

    const glassMat = new BABYLON.StandardMaterial("bldgGlassMat", scene);
    glassMat.diffuseColor = new BABYLON.Color3(0.2, 0.55, 0.8);
    glassMat.specularColor = new BABYLON.Color3(0.8, 0.9, 1.0);

    const carPaintColors = [
      new BABYLON.Color3(0.9, 0.15, 0.15),
      new BABYLON.Color3(0.15, 0.45, 0.9),
      new BABYLON.Color3(0.95, 0.8, 0.1),
      new BABYLON.Color3(0.2, 0.2, 0.22)
    ];

    const tireMat = new BABYLON.StandardMaterial("tireMat", scene);
    tireMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);

    const windshieldMat = new BABYLON.StandardMaterial("windMat", scene);
    windshieldMat.diffuseColor = new BABYLON.Color3(0.1, 0.25, 0.35);

    // 1. Corner Skyscrapers (100% Solid & Bulletproof)
    [[-hw + 8, -hl + 8], [hw - 8, -hl + 8], [-hw + 8, hl - 8], [hw - 8, hl - 8]].forEach(([bx, bz], idx) => {
      for (let s = 0; s < 2; s++) {
        const bHeight = 32 + (idx * 4 + s * 6);
        const offsetX = s === 0 ? 0 : (bx > 0 ? -10 : 10);
        const offsetZ = s === 0 ? 0 : (bz > 0 ? -10 : 10);
        const px = bx + offsetX;
        const pz = bz + offsetZ;

        const skyscraper = BABYLON.MeshBuilder.CreateBox(`Skyscraper_${idx}_${s}`, { width: 15, height: bHeight, depth: 15 }, scene);
        skyscraper.position.set(px, bHeight / 2, pz);
        skyscraper.material = concreteMat;

        const winBand = BABYLON.MeshBuilder.CreateBox("WinBand", { width: 15.2, height: bHeight * 0.7, depth: 15.2 }, scene);
        winBand.position.set(px, bHeight / 2, pz);
        winBand.material = glassMat;

        shadowGen.addShadowCaster(skyscraper);
        stageMeshes.push(skyscraper, winBand);

        // Solid obstacle: stops players & 100% blocks bullets
        solidObstacles.push({
          minX: px - 7.6, maxX: px + 7.6,
          minZ: pz - 7.6, maxZ: pz + 7.6,
          maxY: bHeight
        });
      }
    });

    // Perimeter Security Barriers
    function makeCityWall(x, z, w, d) {
      const wall = BABYLON.MeshBuilder.CreateBox("CityBarrier", { width: w, height: 7, depth: d }, scene);
      wall.position.set(x, 3.5, z);
      wall.material = concreteMat;
      shadowGen.addShadowCaster(wall);
      stageMeshes.push(wall);
      solidObstacles.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, maxY: 7 });
    }
    makeCityWall(0, -hl, ARENA_W, 3.0);
    makeCityWall(0, hl, ARENA_W, 3.0);
    makeCityWall(-hw, 0, 3.0, ARENA_L);
    makeCityWall(hw, 0, 3.0, ARENA_L);

    // 2. Realistic Low-Poly Cars (100% Solid & Bulletproof Cover)
    for (let c = 0; c < 12; c++) {
      const ang = (c / 12) * Math.PI * 2 + 0.2;
      const dist = 24 + (c % 3) * 6;
      const cx = Math.cos(ang) * dist;
      const cz = Math.sin(ang) * dist;

      const carRoot = new BABYLON.TransformNode(`Car_${c}`, scene);
      carRoot.position.set(cx, 0, cz);
      carRoot.rotation.y = ang + Math.PI / 2;

      const paintMat = new BABYLON.StandardMaterial(`CarPaint_${c}`, scene);
      paintMat.diffuseColor = carPaintColors[c % carPaintColors.length];

      const chassis = BABYLON.MeshBuilder.CreateBox("Chassis", { width: 3.4, height: 1.2, depth: 6.4 }, scene);
      chassis.parent = carRoot;
      chassis.position.y = 0.9;
      chassis.material = paintMat;

      const cabin = BABYLON.MeshBuilder.CreateBox("Cabin", { width: 2.8, height: 1.0, depth: 3.6 }, scene);
      cabin.parent = carRoot;
      cabin.position.set(0, 2.0, -0.3);
      cabin.material = windshieldMat;

      [[-1.7, 1.8], [1.7, 1.8], [-1.7, -1.8], [1.7, -1.8]].forEach(([wx, wz]) => {
        const wheel = BABYLON.MeshBuilder.CreateCylinder("Wheel", { height: 0.5, diameter: 1.2 }, scene);
        wheel.parent = carRoot;
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.6, wz);
        wheel.material = tireMat;
      });

      shadowGen.addShadowCaster(chassis);
      shadowGen.addShadowCaster(cabin);
      stageMeshes.push(carRoot);

      // Solid obstacle: Cars fully absorb bullets and block movement
      solidObstacles.push({
        minX: cx - 2.8, maxX: cx + 2.8,
        minZ: cz - 2.8, maxZ: cz + 2.8,
        maxY: 2.6
      });
    }

    boss = createCenterBoss(2, "CYBER GOLIATH", 440, new BABYLON.Color3(0.2, 0.35, 0.5));
  }

  // ========================================================================
  // GROUNDED CENTER BOSS (Firmly on Central Dais)
  // ========================================================================
  function createCenterBoss(type, name, hp, color) {
    const root = new BABYLON.TransformNode("BossRoot", scene);
    root.position.set(0, 0, 0);

    const bMat = new BABYLON.StandardMaterial("bMat", scene);
    bMat.diffuseColor = color;

    const goldMat = new BABYLON.StandardMaterial("bGold", scene);
    goldMat.diffuseColor = new BABYLON.Color3(1.0, 0.78, 0.15);

    const daisMat = new BABYLON.StandardMaterial("daisMat", scene);
    daisMat.diffuseColor = new BABYLON.Color3(0.22, 0.24, 0.3);

    // Stone Dais (y=0 to y=1.2)
    const dais = BABYLON.MeshBuilder.CreateCylinder("Dais", { height: 1.2, diameter: 14, tessellation: 24 }, scene);
    dais.position.set(0, 0.6, 0);
    dais.material = daisMat;
    dais.receiveShadows = true;
    stageMeshes.push(dais);

    // Boss Body
    const body = BABYLON.MeshBuilder.CreateBox("bBody", { width: 5.2, height: 5.8, depth: 4.8 }, scene);
    body.parent = root;
    body.position.y = 1.2 + 2.9;
    body.material = bMat;
    shadowGen.addShadowCaster(body);

    const crown = BABYLON.MeshBuilder.CreateBox("bCrown", { width: 3.4, height: 1.8, depth: 3.4 }, scene);
    crown.parent = body;
    crown.position.y = 3.6;
    crown.material = goldMat;
    shadowGen.addShadowCaster(crown);

    // Heavy Cannons (Can pitch up/down toward player height)
    const cannonPivot = new BABYLON.TransformNode("CannonPivot", scene);
    cannonPivot.parent = body;
    cannonPivot.position.set(0, 0, 2.5);

    [-2.2, 2.2].forEach(x => {
      const cannon = BABYLON.MeshBuilder.CreateCylinder("bCannon", { height: 4.2, diameter: 0.9 }, scene);
      cannon.parent = cannonPivot;
      cannon.rotation.x = Math.PI / 2;
      cannon.position.set(x, 0, 0);
      cannon.material = goldMat;
      shadowGen.addShadowCaster(cannon);
    });

    return {
      root, body, cannonPivot, type, name,
      attackTimer: 1.2,
      hp, maxHp: hp, radius: 4.0
    };
  }

  function loadStage(idx) {
    clearCurrentStage();
    state.stage = idx % 3;

    if (state.stage === 0) buildCastleStage();
    else if (state.stage === 1) buildMilitaryBaseStage();
    else buildCityStage();

    state.bossHp = boss.hp;
    state.maxBossHp = boss.maxHp;
    updateHUD();
  }

  function updateHUD() {
    const sEl = document.getElementById('hud-stage');
    const scEl = document.getElementById('hud-score');
    const pEl = document.getElementById('p-bar');
    const bEl = document.getElementById('b-bar');
    const bLabel = document.getElementById('boss-label');

    const names = [
      "STAGE 1: CITADEL COURTYARD 🏰",
      "STAGE 2: MILITARY OUTPOST 🪖",
      "STAGE 3: METROPOLITAN CITY 🏙️"
    ];

    if (sEl && boss) sEl.innerText = `${names[state.stage]}`;
    if (scEl) scEl.innerText = `CONQUERED: ${state.score}`;
    if (bLabel && boss) bLabel.innerText = `${boss.name}`;
    if (pEl) pEl.style.width = `${Math.max(0, (state.playerHp / state.maxHp) * 100)}%`;
    if (bEl && boss) bEl.style.width = `${Math.max(0, (state.bossHp / state.maxBossHp) * 100)}%`;
  }

  // ========================================================================
  // PROJECTILE SYSTEM
  // ========================================================================
  function shoot(origin, dir, isPlayer = false, speed = 55) {
    const box = BABYLON.MeshBuilder.CreateBox("Bullet", { size: 0.7 }, scene);
    const mat = new BABYLON.StandardMaterial("bMat", scene);
    mat.emissiveColor = isPlayer ? new BABYLON.Color3(0, 1, 1) : new BABYLON.Color3(1, 0.2, 0.1);
    box.material = mat;
    box.position.copyFrom(origin);

    bullets.push({
      mesh: box,
      isPlayer,
      dir: dir.normalize(),
      speed,
      life: 3.0
    });

    playSound(isPlayer ? 'fire' : 'enemy_fire');
  }

  function playerFire() {
    if (recoil > 0.05) return;
    recoil = 0.38;
    muzzleFlash.isVisible = true;
    setTimeout(() => { muzzleFlash.isVisible = false; }, 45);

    const fwd = camera.getForwardRay().direction;
    const origin = camera.position.add(fwd.scale(1.2));
    shoot(origin, fwd, true, 70);
  }

  // ========================================================================
  // CONTROLS INTERFACING (Desktop & Mobile)
  // ========================================================================
  const keys = {};
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space' && Math.abs(camera.position.y - 2.0) < 0.2) playerVy = 13.0;
    if (e.key === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') playerFire();
  });
  window.addEventListener('keyup', (e) => keys[e.code] = false);

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
    if (e.button === 0 && !state.isMobile) playerFire();
  });

  if (state.isMobile) {
    document.getElementById('mobile-ui').style.display = 'block';
    const base = document.getElementById('joy-base');
    const stick = document.getElementById('joy-stick');
    let tid = null, rect = null;

    if (base) {
      base.addEventListener('touchstart', (e) => {
        e.preventDefault();
        tid = e.changedTouches[0].identifier;
        rect = base.getBoundingClientRect();
      }, { passive: false });

      window.addEventListener('touchmove', (e) => {
        if (tid === null) return;
        for (let t of e.changedTouches) {
          if (t.identifier === tid) {
            const dx = t.clientX - (rect.left + rect.width / 2);
            const dy = t.clientY - (rect.top + rect.height / 2);
            const dist = Math.min(48, Math.hypot(dx, dy));
            const ang = Math.atan2(dy, dx);

            stick.style.transform = `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist}px))`;
            input.right = (Math.cos(ang) * dist) / 48;
            input.forward = -(Math.sin(ang) * dist) / 48;
          }
        }
      }, { passive: false });

      const endTouch = (e) => {
        for (let t of e.changedTouches) {
          if (t.identifier === touchId) {
            touchId = null;
            stick.style.transform = 'translate(-50%, -50%)';
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
        if (Math.abs(camera.position.y - 2.0) < 0.2) playerVy = 13.0;
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

  // ========================================================================
  // MAIN ENGINE LOOP & 3D BOSS COMBAT
  // ========================================================================
  loadStage(0);

  engine.runRenderLoop(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.1);

    if (!state.isMobile) {
      input.forward = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
      input.right = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
    }

    // Kinematics Movement
    const moveMag = Math.hypot(input.forward, input.right);
    const fwd = camera.getForwardRay().direction;
    fwd.y = 0; fwd.normalize();
    const right = new BABYLON.Vector3(fwd.z, 0, -fwd.x);

    // Check Ladder Climbing Interaction in Stage 2
    let nearLadder = null;
    for (let l of ladders) {
      if (Math.hypot(camera.position.x - l.x, camera.position.z - l.z) < l.radius) {
        nearLadder = l;
        break;
      }
    }

    const ladderHint = document.getElementById('ladder-hint');
    if (nearLadder) {
      if (ladderHint) ladderHint.style.opacity = '1';
      // Climbing vertically
      if (input.forward > 0 || keys['Space']) {
        isClimbing = true;
        camera.position.y = Math.min(nearLadder.platformY, camera.position.y + 12 * dt);
      }
    } else {
      if (ladderHint) ladderHint.style.opacity = '0';
      isClimbing = false;
    }

    if (moveMag > 0.05) {
      const moveDir = fwd.scale(input.forward).add(right.scale(input.right)).normalize();
      const nx = camera.position.x + moveDir.x * 18 * dt;
      const nz = camera.position.z + moveDir.z * 18 * dt;

      // Prevent walking into central boss dais
      let blocked = Math.hypot(nx, nz) < 7.2;

      // Check Solid Obstacles (Walls, Crates, Cars, Skyscrapers)
      for (let o of solidObstacles) {
        if (nx >= o.minX && nx <= o.maxX && nz >= o.minZ && nz <= o.maxZ) {
          if (camera.position.y < o.maxY) {
            blocked = true;
            break;
          }
        }
      }

      if (!blocked) {
        camera.position.x = nx;
        camera.position.z = nz;
      }

      walkBob += dt * 10;
      weaponRoot.position.y = -0.32 + Math.sin(walkBob) * 0.02;
      weaponRoot.position.x = 0.4 + Math.cos(walkBob * 0.5) * 0.015;
    } else {
      weaponRoot.position.y = -0.32;
    }

    // Arena Perimeter Bounds
    camera.position.x = Math.max(-ARENA_W / 2 + 4, Math.min(ARENA_W / 2 - 4, camera.position.x));
    camera.position.z = Math.max(-ARENA_L / 2 + 4, Math.min(ARENA_L / 2 - 4, camera.position.z));

    // Jump & Gravity (Checks platform standing height)
    let floorHeight = 2.0;
    for (let o of solidObstacles) {
      if (o.platformTop && camera.position.x >= o.minX && camera.position.x <= o.maxX && camera.position.z >= o.minZ && camera.position.z <= o.maxZ) {
        floorHeight = o.platformTop + 1.8;
        break;
      }
    }

    if (!isClimbing) {
      camera.position.y += playerVy * dt;
      if (camera.position.y > floorHeight) {
        playerVy -= 32 * dt;
      } else {
        camera.position.y = floorHeight;
        playerVy = 0;
      }
    }

    // Recoil Recovery
    if (recoil > 0) {
      weaponRoot.position.z = 0.78 - recoil * 0.35;
      weaponRoot.rotation.x = -recoil * 0.45;
      recoil -= dt * 2.2;
    } else {
      weaponRoot.position.z = 0.78;
      weaponRoot.rotation.x = 0;
    }

    // ======================================================================
    // HEALTH ORB CYCLE (Every 20-25 seconds)
    // ======================================================================
    orbDropTimer -= dt;
    if (orbDropTimer <= 0) {
      spawnHealthOrb();
      orbDropTimer = 22.0 + Math.random() * 3.0;
    }

    if (healthOrb && healthOrb.root) {
      healthOrb.animTime += dt;
      healthOrb.root.position.y = 1.8 + Math.sin(healthOrb.animTime * 3) * 0.4;
      healthOrb.haloRing.rotation.z += dt * 2.5;

      const distToOrb = Math.hypot(camera.position.x - healthOrb.root.position.x, camera.position.z - healthOrb.root.position.z);
      if (distToOrb < healthOrb.radius + 1.2) {
        state.playerHp = Math.min(state.maxHp, state.playerHp + 25);
        playSound('heal');
        showToast("+25% HEALTH RESTORED!", "#00ffaa");
        healthOrb.root.dispose();
        healthOrb = null;
        updateHUD();
      }
    }

    // ======================================================================
    // 3D BOSS AI: Aiming Upward at Towers & 360° Blind-Spot Barrage
    // ======================================================================
    if (boss && !state.isTransitioning) {
      const bossPos = new BABYLON.Vector3(0, 4.2, 0);
      const toPlayer = camera.position.subtract(bossPos);
      const dist = toPlayer.length();

      // Yaw tracking (horizontal)
      boss.root.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);

      // Pitch tracking (Cannons aim up as you climb watchtowers)
      const pitchAngle = Math.atan2(toPlayer.y, Math.hypot(toPlayer.x, toPlayer.z));
      if (boss.cannonPivot) boss.cannonPivot.rotation.x = -pitchAngle;

      // Line of Sight Test: Is player hidden behind an obstacle/tower?
      let isVisible = true;
      for (let o of solidObstacles) {
        // If midpoint between boss and player passes inside an obstacle
        const midX = (camera.position.x + bossPos.x) / 2;
        const midZ = (camera.position.z + bossPos.z) / 2;
        if (midX >= o.minX && midX <= o.maxX && midZ >= o.minZ && midZ <= o.maxZ) {
          if (camera.position.y < o.maxY) {
            isVisible = false;
            break;
          }
        }
      }

      boss.attackTimer -= dt;
      if (boss.attackTimer <= 0) {
        const origin = new BABYLON.Vector3(0, 4.2, 0);

        if (boss.type === 0) {
          // Stage 1: Citadel Golem (Triple Mortar Spread)
          const normDir = toPlayer.clone().normalize();
          for (let a = -0.22; a <= 0.22; a += 0.22) {
            const dir = new BABYLON.Vector3(normDir.x + a * normDir.z, normDir.y, normDir.z - a * normDir.x);
            shoot(origin, dir, false, 38);
          }
          boss.attackTimer = 1.3;
        } else if (boss.type === 1) {
          // Stage 2: Desert Warlord
          if (!isVisible) {
            // Player is hidden behind cover / tower -> RAGE: 360° ALL-DIRECTION BULLETS!
            for (let i = 0; i < 16; i++) {
              const ang = (i / 16) * Math.PI * 2;
              const dir = new BABYLON.Vector3(Math.cos(ang), 0.1, Math.sin(ang));
              shoot(origin, dir, false, 42);
            }
            boss.attackTimer = 1.5;
          } else {
            // Direct aim (Elevates and shoots up at the watchtower platform!)
            shoot(origin, toPlayer.clone().normalize(), false, 50);
            boss.attackTimer = 0.55;
          }
        } else {
          // Stage 3: Cyber Goliath FINAL BOSS -> TIGHT 7-BULLET FAN SALVO
          const normDir = toPlayer.clone().normalize();
          const fanStep = 0.05; // Tight close fan cluster
          for (let f = -3; f <= 3; f++) {
            const offset = f * fanStep;
            const dir = new BABYLON.Vector3(normDir.x + offset * normDir.z, normDir.y, normDir.z - offset * normDir.x);
            shoot(origin, dir, false, 52);
          }
          boss.attackTimer = 1.6;
        }
      }
    }

    // ======================================================================
    // PROJECTILE SIMULATION & 100% BULLETPROOF COVER
    // ======================================================================
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.mesh.position.addInPlace(b.dir.scale(b.speed * dt));
      b.life -= dt;

      // Arena boundary limits
      if (Math.abs(b.mesh.position.x) > ARENA_W / 2 || Math.abs(b.mesh.position.z) > ARENA_L / 2 || b.life <= 0) {
        b.mesh.dispose();
        bullets.splice(i, 1);
        continue;
      }

      // Check Obstacle Intersections (Cars, Buildings, Watchtowers fully absorb bullets!)
      let blockedByCover = false;
      for (let o of solidObstacles) {
        if (b.mesh.position.x >= o.minX && b.mesh.position.x <= o.maxX &&
            b.mesh.position.z >= o.minZ && b.mesh.position.z <= o.maxZ) {
          if (b.mesh.position.y <= o.maxY) {
            blockedByCover = true;
            break;
          }
        }
      }

      if (blockedByCover) {
        b.mesh.dispose();
        bullets.splice(i, 1);
        continue;
      }

      // Player Bullet Hits Center Boss
      if (b.isPlayer && boss) {
        if (Math.hypot(b.mesh.position.x, b.mesh.position.z) < boss.radius && b.mesh.position.y > 0 && b.mesh.position.y < 8.5) {
          state.bossHp -= 16;
          playSound('hit');
          b.mesh.dispose();
          bullets.splice(i, 1);

          if (state.bossHp <= 0) {
            state.score++;
            playSound('fanfare');
            const fade = document.getElementById('stage-fade');
            if (fade) fade.style.opacity = '1';
            state.isTransitioning = true;

            setTimeout(() => {
              loadStage(state.score);
              camera.position.set(0, 2.0, 36);
              if (fade) fade.style.opacity = '0';
              state.isTransitioning = false;
            }, 500);
          }
          updateHUD();
          continue;
        }
      }

      // Boss Bullet Hits Player
      if (!b.isPlayer) {
        const distToPlayer = BABYLON.Vector3.Distance(b.mesh.position, camera.position);
        if (distToPlayer < 1.8) {
          state.playerHp -= 14;
          playSound('hit');
          b.mesh.dispose();
          bullets.splice(i, 1);

          const flash = document.getElementById('hit-flash');
          if (flash) {
            flash.style.opacity = '1';
            setTimeout(() => { flash.style.opacity = '0'; }, 80);
          }

          if (state.playerHp <= 0) {
            state.playerHp = state.maxHp;
            state.score = 0;
            loadStage(0);
            camera.position.set(0, 2.0, 36);
          }
          updateHUD();
          continue;
        }
      }
    }

    scene.render();
  });

  window.addEventListener('resize', () => engine.resize());
});