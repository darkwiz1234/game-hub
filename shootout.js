// ============================================================================
// SHOOTOUT ⚔️ — Babylon.js Complete Game Runtime (shootout.js)
// ============================================================================

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('renderCanvas');
  if (!canvas) {
    console.error("Canvas element 'renderCanvas' not found!");
    return;
  }

  // 1. Initialize Babylon.js 3D Engine
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
  let coverObstacles = [];
  let bullets = [];

  // Health Orb Drop System (20-25s interval)
  let healthOrb = null;
  let orbDropTimer = 22.0;

  // FPS Viewmodel Rig
  let weaponRoot, muzzleFlash, recoil = 0;
  let walkBob = 0, playerVy = 0;
  let isPointerLocked = false;
  const input = { forward: 0, right: 0 };

  // ========================================================================
  // PROCEDURAL AUDIO SYNTHESIZER (Web Audio API)
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
  // PROCEDURAL HIGH-RESOLUTION TEXTURE GENERATOR
  // ========================================================================
  function createProceduralTexture(type) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const ctx = c.getContext('2d');

    if (type === 'castle-stone') {
      ctx.fillStyle = '#dde3ea'; ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = '#7c8899'; ctx.lineWidth = 8;
      const rows = 8, cols = 4;
      const rh = 512 / rows, cw = 512 / cols;
      for (let r = 0; r < rows; r++) {
        const offset = (r % 2) * (cw / 2);
        for (let col = -1; col <= cols; col++) {
          ctx.strokeRect(col * cw + offset, r * rh, cw, rh);
          for (let p = 0; p < 6; p++) {
            ctx.fillStyle = Math.random() > 0.5 ? '#b8c4d4' : '#f0f5fc';
            ctx.fillRect(col * cw + offset + Math.random() * (cw - 14), r * rh + Math.random() * (rh - 14), 14, 10);
          }
        }
      }
    } else if (type === 'turf-grass') {
      ctx.fillStyle = '#65c42a'; ctx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 750; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#80de3e' : '#4fa81f';
        ctx.fillRect(Math.random() * 512, Math.random() * 512, 4, 12);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 4;
      ctx.strokeRect(0, 0, 512, 512);
    } else if (type === 'desert-sand') {
      ctx.fillStyle = '#e8ad46'; ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = '#d49633';
      for (let i = 0; i < 1200; i++) ctx.fillRect(Math.random() * 512, Math.random() * 512, 3, 3);
      ctx.strokeStyle = 'rgba(255, 230, 160, 0.4)'; ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(0, 120); ctx.bezierCurveTo(180, 180, 320, 60, 512, 140);
      ctx.stroke();
    } else if (type === 'city-asphalt') {
      ctx.fillStyle = '#22252a'; ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = '#2a2e36';
      for (let i = 0; i < 1500; i++) ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
      // Road markings (yellow dashed line & crosswalk zebra stripes)
      ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 10; ctx.setLineDash([40, 30]);
      ctx.beginPath(); ctx.moveTo(0, 256); ctx.lineTo(512, 256); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ecf0f1';
      for (let x = 30; x < 512; x += 55) ctx.fillRect(x, 400, 28, 90);
    }

    const tex = new BABYLON.DynamicTexture("pTex_" + type, c, scene);
    tex.wrapU = tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    return tex;
  }

  // ========================================================================
  // SCENE, SKY, DUAL LIGHTS & SHADOW ENGINE
  // ========================================================================
  scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.38, 0.74, 1.0, 1.0);

  scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.005;
  scene.fogColor = new BABYLON.Color3(0.38, 0.74, 1.0);

  // FPS Camera at eye level
  camera = new BABYLON.UniversalCamera("FpsCam", new BABYLON.Vector3(0, 2.0, 36), scene);
  camera.setTarget(new BABYLON.Vector3(0, 2.0, 0));
  camera.speed = 0;
  camera.angularSensibility = 2200;
  camera.minZ = 0.1;
  camera.fov = 1.15;
  camera.attachControl(canvas, true);

  // Natural Sunlight & Ambient Skylight
  fillLight = new BABYLON.HemisphericLight("FillLight", new BABYLON.Vector3(0, 1, 0), scene);
  fillLight.intensity = 0.95;
  fillLight.diffuse = new BABYLON.Color3(1.0, 0.98, 0.94);
  fillLight.groundColor = new BABYLON.Color3(0.45, 0.55, 0.35);

  sun = new BABYLON.DirectionalLight("Sun", new BABYLON.Vector3(-0.6, -1.3, -0.7), scene);
  sun.position = new BABYLON.Vector3(40, 80, 50);
  sun.intensity = 1.35;

  // Real-Time Contact Shadow Generator
  shadowGen = new BABYLON.ShadowGenerator(1024, sun);
  shadowGen.useBlurExponentialShadowMap = true;
  shadowGen.blurKernel = 16;
  shadowGen.darkness = 0.45;

  // Stylized 3D Clouds in the Sky
  const cloudMat = new BABYLON.StandardMaterial("CloudMat", scene);
  cloudMat.diffuseColor = new BABYLON.Color3(1, 1, 1);
  cloudMat.emissiveColor = new BABYLON.Color3(0.85, 0.9, 0.95);

  for (let c = 0; c < 12; c++) {
    const cloudRoot = new BABYLON.TransformNode("Cloud", scene);
    cloudRoot.position.set(
      (Math.random() - 0.5) * 160,
      36 + Math.random() * 8,
      (Math.random() - 0.5) * 160
    );
    for (let p = 0; p < 4; p++) {
      const part = BABYLON.MeshBuilder.CreateSphere("CPart", { diameter: 7 + Math.random() * 4 }, scene);
      part.parent = cloudRoot;
      part.position.set((p - 1.5) * 4, 0, (Math.random() - 0.5) * 3);
      part.material = cloudMat;
    }
  }

  // ========================================================================
  // FIRST PERSON VIEWMODEL BLASTER RIG
  // ========================================================================
  weaponRoot = new BABYLON.TransformNode("WeaponRoot", scene);
  weaponRoot.parent = camera;
  weaponRoot.position.set(0.4, -0.32, 0.78);

  const matPbrMetal = new BABYLON.PBRMaterial("wMetal", scene);
  matPbrMetal.albedoColor = new BABYLON.Color3(0.18, 0.24, 0.35);
  matPbrMetal.metallic = 0.85;
  matPbrMetal.roughness = 0.25;

  const matPbrGold = new BABYLON.PBRMaterial("wGold", scene);
  matPbrGold.albedoColor = new BABYLON.Color3(1.0, 0.75, 0.1);
  matPbrGold.metallic = 0.95;
  matPbrGold.roughness = 0.15;

  const wChassis = BABYLON.MeshBuilder.CreateBox("wChassis", { width: 0.18, height: 0.22, depth: 0.7 }, scene);
  wChassis.parent = weaponRoot;
  wChassis.material = matPbrMetal;

  const wRail = BABYLON.MeshBuilder.CreateBox("wRail", { width: 0.12, height: 0.08, depth: 0.5 }, scene);
  wRail.parent = weaponRoot;
  wRail.position.set(0, 0.13, 0.05);
  wRail.material = matPbrGold;

  [-0.045, 0.045].forEach(bx => {
    const b = BABYLON.MeshBuilder.CreateCylinder("wB", { height: 0.45, diameter: 0.08 }, scene);
    b.parent = weaponRoot;
    b.rotation.x = Math.PI / 2;
    b.position.set(bx, 0.02, 0.48);
    b.material = matPbrGold;
  });

  muzzleFlash = BABYLON.MeshBuilder.CreateSphere("MuzFlash", { diameter: 0.22 }, scene);
  muzzleFlash.parent = weaponRoot;
  muzzleFlash.position.set(0, 0.02, 0.75);
  const mMat = new BABYLON.StandardMaterial("mFlash", scene);
  mMat.emissiveColor = new BABYLON.Color3(0.0, 1.0, 1.0);
  muzzleFlash.material = mMat;
  muzzleFlash.isVisible = false;

  // ========================================================================
  // HEALTH ORBS SYSTEM (Spawns every 20-25 seconds)
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

    // Place randomly in arena
    const rx = (Math.random() - 0.5) * (ARENA_W - 24);
    const rz = (Math.random() - 0.5) * (ARENA_L - 24);
    root.position.set(rx, 1.8, rz);

    healthOrb = { root, orbSphere, haloRing, radius: 2.2, animTime: 0 };
    showToast("VITALITY ORB DROPPED! +25% HP", "#00ffaa");
  }

  // ========================================================================
  // STAGE GENERATION
  // ========================================================================
  function clearCurrentStage() {
    stageMeshes.forEach(m => m.dispose());
    stageMeshes = [];
    coverObstacles = [];
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
  // STAGE 1: CARTOON CASTLE COURTYARD (Matching Reference Image)
  // ------------------------------------------------------------------------
  function buildCastleStage() {
    scene.clearColor = new BABYLON.Color4(0.38, 0.74, 1.0, 1.0);
    scene.fogColor = new BABYLON.Color3(0.38, 0.74, 1.0);

    const floor = BABYLON.MeshBuilder.CreateGround("Floor", { width: ARENA_W, height: ARENA_L }, scene);
    const fMat = new BABYLON.PBRMaterial("fMat", scene);
    const turfTex = createProceduralTexture('turf-grass');
    turfTex.uScale = 12; turfTex.vScale = 12;
    fMat.albedoTexture = turfTex;
    fMat.roughness = 0.8;
    floor.material = fMat;
    floor.receiveShadows = true;
    stageMeshes.push(floor);

    const stoneTex = createProceduralTexture('castle-stone');
    stoneTex.uScale = 8; stoneTex.vScale = 4;

    const wallMat = new BABYLON.PBRMaterial("cWallMat", scene);
    wallMat.albedoTexture = stoneTex;
    wallMat.metallic = 0.1; wallMat.roughness = 0.75;

    const redMat = new BABYLON.PBRMaterial("cRedMat", scene);
    redMat.albedoColor = new BABYLON.Color3(0.92, 0.18, 0.14);
    redMat.metallic = 0.2; redMat.roughness = 0.35;

    const goldMat = new BABYLON.PBRMaterial("cGoldMat", scene);
    goldMat.albedoColor = new BABYLON.Color3(1.0, 0.76, 0.12);
    goldMat.metallic = 0.9; goldMat.roughness = 0.2;

    const darkIronMat = new BABYLON.PBRMaterial("cIronMat", scene);
    darkIronMat.albedoColor = new BABYLON.Color3(0.18, 0.2, 0.24);
    darkIronMat.metallic = 0.5; darkIronMat.roughness = 0.5;

    const hw = ARENA_W / 2;
    const hl = ARENA_L / 2;

    // High Castle Walls with Spiked Footing Base & Crenellations
    function makeCastleWall(x, z, w, d) {
      // Dark spiked foundation footing collar (Anchored at y=0 to y=2.2)
      const footing = BABYLON.MeshBuilder.CreateBox("WFooting", { width: w + 1.6, height: 2.2, depth: d + 1.6 }, scene);
      footing.position.set(x, 1.1, z);
      footing.material = darkIronMat;

      // Stone Wall Body (y=2.2 to WALL_H)
      const wall = BABYLON.MeshBuilder.CreateBox("WallBody", { width: w, height: WALL_H - 2.2, depth: d }, scene);
      wall.position.set(x, 2.2 + (WALL_H - 2.2) / 2, z);
      wall.material = wallMat;

      // Scarlet Parapet Canopy Trim
      const trim = BABYLON.MeshBuilder.CreateBox("WallTrim", { width: w + 0.8, height: 1.4, depth: d + 0.8 }, scene);
      trim.position.set(x, WALL_H + 0.7, z);
      trim.material = redMat;

      shadowGen.addShadowCaster(footing);
      shadowGen.addShadowCaster(wall);
      shadowGen.addShadowCaster(trim);
      stageMeshes.push(footing, wall, trim);
    }
    makeCastleWall(0, -hl, ARENA_W, 2.8);
    makeCastleWall(0, hl, ARENA_W, 2.8);
    makeCastleWall(-hw, 0, 2.8, ARENA_L);
    makeCastleWall(hw, 0, 2.8, ARENA_L);

    // 4 Reference-Accurate Towers: Beveled base, stone body, crown crest, and conical peaked red roof
    [[-hw, -hl], [hw, -hl], [-hw, hl], [hw, hl]].forEach(([cx, cz]) => {
      // Dark Spiked Iron Base Collar
      const baseIron = BABYLON.MeshBuilder.CreateBox("TBaseIron", { width: 12, height: 2.5, depth: 12 }, scene);
      baseIron.position.set(cx, 1.25, cz);
      baseIron.material = darkIronMat;

      // Stone Bastion Tier 1
      const tier1 = BABYLON.MeshBuilder.CreateBox("TTier1", { width: 10.5, height: 6.0, depth: 10.5 }, scene);
      tier1.position.set(cx, 2.5 + 3.0, cz);
      tier1.material = wallMat;

      // Golden Crown Emblem Plaque on Tower Front Face
      const crownPlaque = BABYLON.MeshBuilder.CreateBox("CrownPlaque", { width: 3.6, height: 2.4, depth: 0.6 }, scene);
      crownPlaque.position.set(cx, 5.5, cz < 0 ? cz + 5.5 : cz - 5.5);
      crownPlaque.material = goldMat;

      // Tower Shaft (Reaching WALL_H + 8)
      const shaft = BABYLON.MeshBuilder.CreateCylinder("TShaft", { height: WALL_H - 2, diameter: 8.5, tessellation: 12 }, scene);
      shaft.position.set(cx, 8.5 + (WALL_H - 2) / 2, cz);
      shaft.material = wallMat;

      // Red Roof Overhang Eaves & Peaked Cone Roof
      const roofEaves = BABYLON.MeshBuilder.CreateCylinder("TRoofEaves", { height: 1.2, diameter: 12.5, tessellation: 12 }, scene);
      roofEaves.position.set(cx, WALL_H + 7.5, cz);
      roofEaves.material = redMat;

      const roofCone = BABYLON.MeshBuilder.CreateCylinder("TRoofCone", { height: 9.0, diameterTop: 0, diameterBottom: 11.5, tessellation: 12 }, scene);
      roofCone.position.set(cx, WALL_H + 12.5, cz);
      roofCone.material = redMat;

      // Gold Spire Finial
      const finial = BABYLON.MeshBuilder.CreateSphere("TFinial", { diameter: 1.8 }, scene);
      finial.position.set(cx, WALL_H + 17.5, cz);
      finial.material = goldMat;

      shadowGen.addShadowCaster(baseIron);
      shadowGen.addShadowCaster(tier1);
      shadowGen.addShadowCaster(shaft);
      shadowGen.addShadowCaster(roofCone);
      stageMeshes.push(baseIron, tier1, crownPlaque, shaft, roofEaves, roofCone, finial);
    });

    // Flowing Scarlet Banners
    for (let z = -hl + 20; z <= hl - 20; z += 24) {
      [-hw + 1.8, hw - 1.8].forEach(bx => {
        const banner = BABYLON.MeshBuilder.CreateBox("Banner", { width: 0.3, height: 9.0, depth: 5.0 }, scene);
        banner.position.set(bx, 10.5, z);
        banner.material = redMat;
        stageMeshes.push(banner);
      });
    }

    // Ground Cover: Stone Bastion Pillars with Gold Caps
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
      shadowGen.addShadowCaster(pCap);
      stageMeshes.push(pillar, pCap);
      coverObstacles.push({ x: px, z: pz, radius: 2.2, jumpH: 6.5 });
    }

    boss = createGroundedBoss(0, "CITADEL GOLEM", 260, new BABYLON.Color3(0.55, 0.62, 0.75));
  }

  // ------------------------------------------------------------------------
  // STAGE 2: DESERT CANYON (Skeletal Bones as Jumpable Cover)
  // ------------------------------------------------------------------------
  function buildDesertStage() {
    scene.clearColor = new BABYLON.Color4(0.96, 0.82, 0.52, 1.0);
    scene.fogColor = new BABYLON.Color3(0.96, 0.82, 0.52);

    const floor = BABYLON.MeshBuilder.CreateGround("Floor", { width: ARENA_W, height: ARENA_L }, scene);
    const fMat = new BABYLON.PBRMaterial("fMat", scene);
    const sandTex = createProceduralTexture('desert-sand');
    sandTex.uScale = 12; sandTex.vScale = 12;
    fMat.albedoTexture = sandTex;
    fMat.roughness = 0.9;
    floor.material = fMat;
    floor.receiveShadows = true;
    stageMeshes.push(floor);

    const sandWallMat = new BABYLON.PBRMaterial("sWallMat", scene);
    sandWallMat.albedoTexture = sandTex;
    sandWallMat.roughness = 0.85;

    const hw = ARENA_W / 2;
    const hl = ARENA_L / 2;

    function makeSandWall(x, z, w, d) {
      const wall = BABYLON.MeshBuilder.CreateBox("SandWall", { width: w, height: WALL_H, depth: d }, scene);
      wall.position.set(x, WALL_H / 2, z);
      wall.material = sandWallMat;
      shadowGen.addShadowCaster(wall);
      stageMeshes.push(wall);
    }
    makeSandWall(0, -hl, ARENA_W, 3.0);
    makeSandWall(0, hl, ARENA_W, 3.0);
    makeSandWall(-hw, 0, 3.0, ARENA_L);
    makeSandWall(hw, 0, 3.0, ARENA_L);

    // Large Jumpable Ribcage Bones
    const boneMat = new BABYLON.PBRMaterial("bBoneMat", scene);
    boneMat.albedoColor = new BABYLON.Color3(0.96, 0.94, 0.86);
    boneMat.roughness = 0.45;

    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      const dist = 22 + (i % 2) * 12;
      const bx = Math.cos(ang) * dist;
      const bz = Math.sin(ang) * dist;

      const rib = BABYLON.MeshBuilder.CreateTorus("BoneRib", { diameter: 5.6, thickness: 1.0, tessellation: 16 }, scene);
      rib.position.set(bx, 0.5, bz);
      rib.rotation.z = Math.PI / 2;
      rib.rotation.y = Math.random() * Math.PI;
      rib.material = boneMat;
      shadowGen.addShadowCaster(rib);
      stageMeshes.push(rib);

      coverObstacles.push({ x: bx, z: bz, radius: 2.8, jumpH: 2.2 });
    }

    boss = createGroundedBoss(1, "DUNE COLOSSUS", 340, new BABYLON.Color3(0.88, 0.55, 0.24));
  }

  // ------------------------------------------------------------------------
  // STAGE 3: METROPOLITAN CITY (Buildings & Cars - No Green Balls!)
  // ------------------------------------------------------------------------
  function buildCityStage() {
    scene.clearColor = new BABYLON.Color4(0.42, 0.65, 0.85, 1.0);
    scene.fogColor = new BABYLON.Color3(0.42, 0.65, 0.85);

    // Asphalt Street Ground with Road Markings
    const floor = BABYLON.MeshBuilder.CreateGround("CityFloor", { width: ARENA_W, height: ARENA_L }, scene);
    const fMat = new BABYLON.PBRMaterial("fMat", scene);
    const asphaltTex = createProceduralTexture('city-asphalt');
    asphaltTex.uScale = 8; asphaltTex.vScale = 8;
    fMat.albedoTexture = asphaltTex;
    fMat.roughness = 0.7;
    floor.material = fMat;
    floor.receiveShadows = true;
    stageMeshes.push(floor);

    const hw = ARENA_W / 2;
    const hl = ARENA_L / 2;

    // Materials for Buildings & Vehicles
    const concreteMat = new BABYLON.PBRMaterial("bldgConcMat", scene);
    concreteMat.albedoColor = new BABYLON.Color3(0.32, 0.36, 0.42);
    concreteMat.roughness = 0.6;

    const glassMat = new BABYLON.PBRMaterial("bldgGlassMat", scene);
    glassMat.albedoColor = new BABYLON.Color3(0.2, 0.55, 0.75);
    glassMat.metallic = 0.8; glassMat.roughness = 0.2;

    const carPaintColors = [
      new BABYLON.Color3(0.9, 0.15, 0.15), // Red
      new BABYLON.Color3(0.15, 0.45, 0.9), // Blue
      new BABYLON.Color3(0.95, 0.8, 0.1),  // Yellow taxi
      new BABYLON.Color3(0.2, 0.2, 0.22)   // Black sedan
    ];

    const tireMat = new BABYLON.PBRMaterial("tireMat", scene);
    tireMat.albedoColor = new BABYLON.Color3(0.1, 0.1, 0.1);
    tireMat.roughness = 0.9;

    const windshieldMat = new BABYLON.PBRMaterial("windMat", scene);
    windshieldMat.albedoColor = new BABYLON.Color3(0.1, 0.25, 0.35);
    windshieldMat.metallic = 0.7; windshieldMat.roughness = 0.15;

    // 1. Boundary Perimeter & High-Rise Skyscrapers in all 4 corners
    [[-hw + 8, -hl + 8], [hw - 8, -hl + 8], [-hw + 8, hl - 8], [hw - 8, hl - 8]].forEach(([bx, bz], idx) => {
      // Skyscraper Cluster (2 buildings per corner)
      for (let s = 0; s < 2; s++) {
        const bHeight = 28 + (idx * 4 + s * 6);
        const offsetX = s === 0 ? 0 : (bx > 0 ? -9 : 9);
        const offsetZ = s === 0 ? 0 : (bz > 0 ? -9 : 9);

        const skyscraper = BABYLON.MeshBuilder.CreateBox(`Skyscraper_${idx}_${s}`, { width: 14, height: bHeight, depth: 14 }, scene);
        skyscraper.position.set(bx + offsetX, bHeight / 2, bz + offsetZ);
        skyscraper.material = concreteMat;

        // Glowing Blue Glass Windows Band
        const winBand = BABYLON.MeshBuilder.CreateBox("WinBand", { width: 14.2, height: bHeight * 0.7, depth: 14.2 }, scene);
        winBand.position.set(bx + offsetX, bHeight / 2, bz + offsetZ);
        winBand.material = glassMat;

        // Rooftop Structure
        const roofUnit = BABYLON.MeshBuilder.CreateBox("RoofUnit", { width: 6, height: 3.5, depth: 6 }, scene);
        roofUnit.position.set(bx + offsetX, bHeight + 1.75, bz + offsetZ);
        roofUnit.material = concreteMat;

        shadowGen.addShadowCaster(skyscraper);
        shadowGen.addShadowCaster(winBand);
        stageMeshes.push(skyscraper, winBand, roofUnit);
      }
    });

    // Perimeter Concrete Security Barriers
    function makeCityWall(x, z, w, d) {
      const wall = BABYLON.MeshBuilder.CreateBox("CityBarrier", { width: w, height: 7, depth: d }, scene);
      wall.position.set(x, 3.5, z);
      wall.material = concreteMat;
      shadowGen.addShadowCaster(wall);
      stageMeshes.push(wall);
    }
    makeCityWall(0, -hl, ARENA_W, 2.8);
    makeCityWall(0, hl, ARENA_W, 2.8);
    makeCityWall(-hw, 0, 2.8, ARENA_L);
    makeCityWall(hw, 0, 2.8, ARENA_L);

    // 2. Low-Poly Tactical Cars Scattered on the Street (Cover you can jump over)
    for (let c = 0; c < 12; c++) {
      const ang = (c / 12) * Math.PI * 2 + 0.2;
      const dist = 24 + (c % 3) * 6;
      const cx = Math.cos(ang) * dist;
      const cz = Math.sin(ang) * dist;

      const carRoot = new BABYLON.TransformNode(`Car_${c}`, scene);
      carRoot.position.set(cx, 0, cz);
      carRoot.rotation.y = ang + Math.PI / 2 + (Math.random() - 0.5) * 0.4;

      const paintMat = new BABYLON.PBRMaterial(`CarPaint_${c}`, scene);
      paintMat.albedoColor = carPaintColors[c % carPaintColors.length];
      paintMat.metallic = 0.5; paintMat.roughness = 0.3;

      // Chassis Body
      const chassis = BABYLON.MeshBuilder.CreateBox("Chassis", { width: 3.2, height: 1.1, depth: 6.2 }, scene);
      chassis.parent = carRoot;
      chassis.position.y = 0.9;
      chassis.material = paintMat;

      // Cabin / Roof
      const cabin = BABYLON.MeshBuilder.CreateBox("Cabin", { width: 2.8, height: 1.0, depth: 3.6 }, scene);
      cabin.parent = carRoot;
      cabin.position.set(0, 1.9, -0.3);
      cabin.material = windshieldMat;

      // 4 Wheels
      [[-1.6, 1.8], [1.6, 1.8], [-1.6, -1.8], [1.6, -1.8]].forEach(([wx, wz]) => {
        const wheel = BABYLON.MeshBuilder.CreateCylinder("Wheel", { height: 0.5, diameter: 1.2 }, scene);
        wheel.parent = carRoot;
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.6, wz);
        wheel.material = tireMat;
      });

      shadowGen.addShadowCaster(chassis);
      shadowGen.addShadowCaster(cabin);
      stageMeshes.push(carRoot);

      // Registers car as a jumpable obstacle (Height ~ 2.4)
      coverObstacles.push({ x: cx, z: cz, radius: 2.6, jumpH: 2.4 });
    }

    // Spawn Stage 3 City Titan
    boss = createGroundedBoss(2, "CYBER GOLIATH", 440, new BABYLON.Color3(0.2, 0.35, 0.5));
  }

  // ========================================================================
  // GROUNDED CENTER BOSS (Firmly Anchored at Dais y = 0.0)
  // ========================================================================
  function createGroundedBoss(type, name, hp, color) {
    const root = new BABYLON.TransformNode("BossRoot", scene);
    root.position.set(0, 0, 0);

    const bMat = new BABYLON.PBRMaterial("bMat", scene);
    bMat.albedoColor = color;
    bMat.metallic = 0.35;
    bMat.roughness = 0.4;

    const goldMat = new BABYLON.PBRMaterial("bGold", scene);
    goldMat.albedoColor = new BABYLON.Color3(1.0, 0.75, 0.1);
    goldMat.metallic = 0.9;
    goldMat.roughness = 0.2;

    const daisMat = new BABYLON.PBRMaterial("daisMat", scene);
    daisMat.albedoColor = new BABYLON.Color3(0.22, 0.24, 0.3);
    daisMat.metallic = 0.2;
    daisMat.roughness = 0.6;

    // Central Stone Dais (Flush with ground: y=0 to y=1.2)
    const dais = BABYLON.MeshBuilder.CreateCylinder("Dais", { height: 1.2, diameter: 14, tessellation: 24 }, scene);
    dais.position.set(0, 0.6, 0);
    dais.material = daisMat;
    dais.receiveShadows = true;
    stageMeshes.push(dais);

    // Boss Body Rig
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

    // Dual Heavy Cannons
    [-2.2, 2.2].forEach(x => {
      const cannon = BABYLON.MeshBuilder.CreateCylinder("bCannon", { height: 4.2, diameter: 0.9 }, scene);
      cannon.parent = body;
      cannon.rotation.x = Math.PI / 2;
      cannon.position.set(x, 0, 2.5);
      cannon.material = goldMat;
      shadowGen.addShadowCaster(cannon);
    });

    return {
      root, body, type, name,
      attackTimer: 1.2,
      hp, maxHp: hp, radius: 4.0
    };
  }

  function loadStage(idx) {
    clearCurrentStage();
    state.stage = idx % 3;
    if (state.stage === 0) buildCastleStage();
    else if (state.stage === 1) buildDesertStage();
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

    const names = ["STAGE 1: CITADEL COURTYARD 🏰", "STAGE 2: DESERT CANYON 🏜️", "STAGE 3: METROPOLITAN CITY 🏙️"];
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
      life: 2.8
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
    shoot(origin, fwd, true, 68);
  }

  // ========================================================================
  // CONTROLS INTERFACING (Desktop & Mobile)
  // ========================================================================
  const keys = {};
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space' && Math.abs(camera.position.y - 2.0) < 0.1) playerVy = 13.0;
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
    const mobUI = document.getElementById('mobile-ui');
    if (mobUI) mobUI.style.display = 'block';

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
          if (t.identifier === tid) {
            tid = null;
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

  // ========================================================================
  // RUNTIME LOOP & CIRCLING BOSS COMBAT
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

    if (moveMag > 0.05) {
      const moveDir = fwd.scale(input.forward).add(right.scale(input.right)).normalize();
      const nx = camera.position.x + moveDir.x * 18 * dt;
      const nz = camera.position.z + moveDir.z * 18 * dt;

      // Prevent walking into central boss dais
      const distToCenter = Math.hypot(nx, nz);
      let blocked = distToCenter < 7.2;

      // Check stage obstacles (Cars, pillars, rib bones)
      for (let o of coverObstacles) {
        if (Math.hypot(nx - o.x, nz - o.z) < 1.6 + o.radius) {
          if (camera.position.y < o.jumpH + 1.2) {
            blocked = true; break;
          }
        }
      }

      if (!blocked) {
        camera.position.x = nx;
        camera.position.z = nz;
      }

      // Viewmodel Sway
      walkBob += dt * 10;
      weaponRoot.position.y = -0.32 + Math.sin(walkBob) * 0.02;
      weaponRoot.position.x = 0.4 + Math.cos(walkBob * 0.5) * 0.015;
    } else {
      weaponRoot.position.y = -0.32;
    }

    // Arena Perimeter Bounds
    camera.position.x = Math.max(-ARENA_W / 2 + 4, Math.min(ARENA_W / 2 - 4, camera.position.x));
    camera.position.z = Math.max(-ARENA_L / 2 + 4, Math.min(ARENA_L / 2 - 4, camera.position.z));

    // Jump Physics
    camera.position.y += playerVy * dt;
    if (camera.position.y > 2.0) {
      playerVy -= 32 * dt;
    } else {
      camera.position.y = 2.0;
      playerVy = 0;
    }

    // Weapon Recoil Recovery
    if (recoil > 0) {
      weaponRoot.position.z = 0.78 - recoil * 0.35;
      weaponRoot.rotation.x = -recoil * 0.45;
      recoil -= dt * 2.2;
    } else {
      weaponRoot.position.z = 0.78;
      weaponRoot.rotation.x = 0;
    }

    // ======================================================================
    // HEALTH ORB CYCLE (Drops every 20-25 seconds)
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
    // BOSS AI: Anchored at Center & Pivot Tracking
    // ======================================================================
    if (boss && !state.isTransitioning) {
      const toP = camera.position.subtract(boss.root.position);
      toP.y = 0;
      toP.normalize();

      // Boss looks directly toward the circling player
      boss.root.rotation.y = Math.atan2(toP.x, toP.z);

      boss.attackTimer -= dt;
      if (boss.attackTimer <= 0) {
        const origin = new BABYLON.Vector3(0, 4.2, 0);

        if (boss.type === 0) {
          // Stage 1 (Citadel Golem): Triple Mortar Spread
          for (let a = -0.25; a <= 0.25; a += 0.25) {
            const dir = new BABYLON.Vector3(toP.x + a * toP.z, 0, toP.z - a * toP.x);
            shoot(origin, dir, false, 36);
          }
          boss.attackTimer = 1.3;
        } else if (boss.type === 1) {
          // Stage 2 (Dune Colossus): Fast Sand Needle Burst
          shoot(origin, toP, false, 48);
          boss.attackTimer = 0.45;
        } else {
          // Stage 3 (Cyber Goliath FINAL BOSS): TIGHT 7-BULLET FAN SALVO
          // Fires 7 bullets in a concentrated narrow cluster fan
          const fanSpreadStep = 0.055; // Slightly close cluster
          for (let f = -3; f <= 3; f++) {
            const spreadOffset = f * fanSpreadStep;
            const dir = new BABYLON.Vector3(toP.x + spreadOffset * toP.z, 0, toP.z - spreadOffset * toP.x);
            shoot(origin, dir, false, 50);
          }
          boss.attackTimer = 1.6;
        }
      }
    }

    // ======================================================================
    // PROJECTILE SIMULATION & DAMAGE
    // ======================================================================
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.mesh.position.addInPlace(b.dir.scale(b.speed * dt));
      b.life -= dt;

      if (Math.abs(b.mesh.position.x) > ARENA_W / 2 || Math.abs(b.mesh.position.z) > ARENA_L / 2 || b.life <= 0) {
        b.mesh.dispose();
        bullets.splice(i, 1);
        continue;
      }

      // Stage Obstacles (Cars, bones, pillars) block enemy bullets
      if (!b.isPlayer) {
        let hitCover = false;
        for (let o of coverObstacles) {
          if (Math.hypot(b.mesh.position.x - o.x, b.mesh.position.z - o.z) < o.radius) {
            hitCover = true; break;
          }
        }
        if (hitCover) {
          b.mesh.dispose();
          bullets.splice(i, 1);
          continue;
        }
      }

      // Hit Boss at Center
      if (b.isPlayer && boss) {
        if (Math.hypot(b.mesh.position.x, b.mesh.position.z) < boss.radius) {
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

      // Hit Orbiting Player
      if (!b.isPlayer) {
        if (Math.hypot(b.mesh.position.x - camera.position.x, b.mesh.position.z - camera.position.z) < 1.6) {
          state.playerHp -= 14;
          playSound('hit');
          b.mesh.dispose();
          bullets.splice(i, 1);

          const flash = document.getElementById('hit-flash');
          if (flash) {
            flash.style.opacity = '1';
            setTimeout(() => flash.style.opacity = '0', 80);
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