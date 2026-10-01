// ============================================================================
// SHOOTOUT ⚔️ — Babylon.js Complete Game Runtime (shootout.js)
// ============================================================================

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('renderCanvas');
  if (!canvas) {
    console.error("Canvas element with id 'renderCanvas' was not found!");
    return;
  }

  // 1. Initialize Babylon.js Engine
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
  let boneObstacles = [];
  let bullets = [];

  // Viewmodel Weapon Rig
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
    } else if (type === 'fanfare') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(820, now + 0.4);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.4);
      osc.start(now); osc.stop(now + 0.4);
    }
  }

  // ========================================================================
  // ZERO-CRASH DOM OVERLAY (HUD, Crosshairs, Mobile Joysticks)
  // ========================================================================
  function setupDOMOverlay() {
    let existing = document.getElementById('shootout-dom-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'shootout-dom-overlay';
    overlay.innerHTML = `
      <style>
        #so-crosshair {
          position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
          width: 26px; height: 26px; pointer-events: none; z-index: 100;
        }
        #so-crosshair .ring {
          position: absolute; inset: 0; border: 2px solid rgba(0, 240, 255, 0.85);
          border-radius: 50%; box-shadow: 0 0 8px rgba(0,240,255,0.7);
        }
        #so-crosshair .dot {
          position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
          width: 4px; height: 4px; background: #ffea00; border-radius: 50%;
        }
        #so-hud {
          position: fixed; top: 14px; left: 50%; transform: translateX(-50%);
          width: 90%; max-width: 680px; z-index: 100; pointer-events: none;
          font-family: 'Rajdhani', sans-serif; text-shadow: 0 2px 4px rgba(0,0,0,0.8);
        }
        #so-hud-header {
          display: flex; justify-content: space-between; align-items: center;
          font-family: 'Orbitron', monospace, sans-serif; font-size: 13px; font-weight: 900;
          margin-bottom: 8px; letter-spacing: 1.5px;
        }
        #so-stage-name { color: #ffea00; text-shadow: 0 0 10px rgba(255, 234, 0, 0.7); }
        #so-score-text { color: #ffffff; text-shadow: 0 0 10px rgba(0, 240, 255, 0.7); }
        .so-bar-box {
          background: rgba(10, 15, 30, 0.75); border: 2px solid rgba(255, 255, 255, 0.85);
          height: 18px; border-radius: 6px; margin-bottom: 6px; overflow: hidden;
          box-shadow: 0 4px 15px rgba(0,0,0,0.4);
        }
        #so-player-bar { height: 100%; width: 100%; background: linear-gradient(90deg, #00ff88, #00f0ff); transition: width 0.1s linear; }
        #so-boss-bar { height: 100%; width: 100%; background: linear-gradient(90deg, #ff0055, #ffaa00); transition: width 0.1s linear; }
        #so-hit-flash {
          position: fixed; inset: 0; background: rgba(255, 0, 40, 0.35);
          opacity: 0; pointer-events: none; transition: opacity 0.08s ease; z-index: 150;
        }
        #so-fade-curtain {
          position: fixed; inset: 0; background: #000;
          opacity: 0; pointer-events: none; transition: opacity 0.5s ease; z-index: 200;
        }
        #so-mobile-ui { display: none; position: fixed; inset: 0; pointer-events: none; z-index: 120; }
        #so-joy-base {
          position: absolute; bottom: 25px; left: 25px; width: 130px; height: 130px; border-radius: 50%;
          border: 3px solid rgba(255, 234, 0, 0.7); background: radial-gradient(circle, rgba(0,240,255,0.2), rgba(10,15,30,0.6));
          pointer-events: auto; touch-action: none;
        }
        #so-joy-stick {
          position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
          width: 50px; height: 50px; border-radius: 50%; background: #ffea00; box-shadow: 0 0 12px #ffaa00;
          pointer-events: none;
        }
        .so-touch-btn {
          position: absolute; border: 2px solid #fff; font-family: 'Orbitron', sans-serif;
          font-weight: 900; border-radius: 50%; display: flex; align-items: center; justify-content: center;
          pointer-events: auto; color: #fff;
        }
        #so-btn-jump { bottom: 125px; right: 30px; width: 62px; height: 62px; background: rgba(0, 255, 170, 0.35); border-color: #00ffaa; }
        #so-btn-fire { bottom: 30px; right: 30px; width: 80px; height: 80px; background: rgba(255, 0, 85, 0.4); border-color: #ff0055; }
      </style>
      <div id="so-hit-flash"></div>
      <div id="so-fade-curtain"></div>
      <div id="so-crosshair"><div class="ring"></div><div class="dot"></div></div>
      <div id="so-hud">
        <div id="so-hud-header">
          <span id="so-stage-name">STAGE 1: CITADEL COURTYARD</span>
          <span id="so-score-text">CONQUERED: 0</span>
        </div>
        <div class="so-bar-box"><div id="so-player-bar"></div></div>
        <div class="so-bar-box"><div id="so-boss-bar"></div></div>
      </div>
      <div id="so-mobile-ui">
        <div id="so-joy-base"><div id="so-joy-stick"></div></div>
        <div id="so-btn-jump" class="so-touch-btn">JUMP</div>
        <div id="so-btn-fire" class="so-touch-btn">FIRE</div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  function updateHUD() {
    const sEl = document.getElementById('so-stage-name');
    const scEl = document.getElementById('so-score-text');
    const pEl = document.getElementById('so-player-bar');
    const bEl = document.getElementById('so-boss-bar');

    const names = ["STAGE 1: CITADEL COURTYARD 🏰", "STAGE 2: DESERT CANYON 🏜️", "STAGE 3: JUNGLE CLEARING 🌴"];
    if (sEl && boss) sEl.innerText = `${names[state.stage]} — ${boss.name}`;
    if (scEl) scEl.innerText = `CONQUERED: ${state.score}`;
    if (pEl) pEl.style.width = `${Math.max(0, (state.playerHp / state.maxHp) * 100)}%`;
    if (bEl && boss) bEl.style.width = `${Math.max(0, (state.bossHp / state.maxBossHp) * 100)}%`;
  }

  // ========================================================================
  // PROCEDURAL TEXTURE GENERATOR (Dynamic Canvas to Texture)
  // ========================================================================
  function createProceduralTexture(type) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const ctx = c.getContext('2d');

    if (type === 'stone-blocks') {
      ctx.fillStyle = '#d5dbe4'; ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = '#8b96a5'; ctx.lineWidth = 6;
      const rows = 8, cols = 4;
      const rh = 512 / rows, cw = 512 / cols;
      for (let r = 0; r < rows; r++) {
        const offset = (r % 2) * (cw / 2);
        for (let col = -1; col <= cols; col++) {
          ctx.strokeRect(col * cw + offset, r * rh, cw, rh);
          for (let p = 0; p < 6; p++) {
            ctx.fillStyle = Math.random() > 0.5 ? '#b2bdcc' : '#eaf0f8';
            ctx.fillRect(col * cw + offset + Math.random() * (cw - 12), r * rh + Math.random() * (rh - 12), 12, 10);
          }
        }
      }
    } else if (type === 'turf-grass') {
      ctx.fillStyle = '#63bf2a'; ctx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 700; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#7ad83c' : '#4fa81f';
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
    } else if (type === 'jungle-moss') {
      ctx.fillStyle = '#2c7329'; ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = '#1e521c';
      for (let i = 0; i < 80; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * 512, Math.random() * 512, Math.random() * 30 + 8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#42a33e';
      for (let i = 0; i < 400; i++) ctx.fillRect(Math.random() * 512, Math.random() * 512, 4, 8);
    }

    const tex = new BABYLON.DynamicTexture("pTex_" + type, c, scene);
    tex.wrapU = tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    return tex;
  }

  // ========================================================================
  // SCENE, SKY, LIGHTS & SHADOW ENGINE
  // ========================================================================
  scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.38, 0.74, 1.0, 1.0);

  scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.005;
  scene.fogColor = new BABYLON.Color3(0.38, 0.74, 1.0);

  // FPS Eye Camera
  camera = new BABYLON.UniversalCamera("FpsCam", new BABYLON.Vector3(0, 2.0, 36), scene);
  camera.setTarget(new BABYLON.Vector3(0, 2.0, 0));
  camera.speed = 0;
  camera.angularSensibility = 2200;
  camera.minZ = 0.1;
  camera.fov = 1.15;
  camera.attachControl(canvas, true);

  // Dual Lights: Natural Sunlight + Ambient Sky Fill
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

  // Stylized 3D Clouds in Sky
  const cloudMat = new BABYLON.StandardMaterial("CloudMat", scene);
  cloudMat.diffuseColor = new BABYLON.Color3(1, 1, 1);
  cloudMat.emissiveColor = new BABYLON.Color3(0.85, 0.9, 0.95);

  for (let c = 0; c < 12; c++) {
    const cloudRoot = new BABYLON.TransformNode("Cloud", scene);
    cloudRoot.position.set(
      (Math.random() - 0.5) * 160,
      34 + Math.random() * 8,
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
  // GROUNDED COLOSSEUM WALLS (Flush with Turf at y = 0.0)
  // ========================================================================
  function clearCurrentStage() {
    stageMeshes.forEach(m => m.dispose());
    stageMeshes = [];
    boneObstacles = [];
    if (boss && boss.root) { boss.root.dispose(); boss = null; }
  }

  function buildGroundedColosseumWalls(wallTex, trimColor, foundationColor) {
    const hw = ARENA_W / 2;
    const hl = ARENA_L / 2;

    const wallMat = new BABYLON.PBRMaterial("pbrWall", scene);
    wallMat.albedoTexture = wallTex;
    wallMat.metallic = 0.1;
    wallMat.roughness = 0.75;

    const trimMat = new BABYLON.PBRMaterial("pbrTrim", scene);
    trimMat.albedoColor = trimColor;
    trimMat.metallic = 0.2;
    trimMat.roughness = 0.4;

    const baseMat = new BABYLON.PBRMaterial("pbrBase", scene);
    baseMat.albedoColor = foundationColor;
    baseMat.metallic = 0.3;
    baseMat.roughness = 0.6;

    function makeWall(x, z, w, d) {
      // Solid Foundation Block (Floor Level y=0 to y=2)
      const base = BABYLON.MeshBuilder.CreateBox("WBase", { width: w + 1.2, height: 2.0, depth: d + 1.2 }, scene);
      base.position.set(x, 1.0, z);
      base.material = baseMat;

      // Main High Wall (y=2 to y=WALL_H)
      const wall = BABYLON.MeshBuilder.CreateBox("WallSeg", { width: w, height: WALL_H - 2, depth: d }, scene);
      wall.position.set(x, 2.0 + (WALL_H - 2) / 2, z);
      wall.material = wallMat;

      // Stepped Top Parapet Rail
      const topRail = BABYLON.MeshBuilder.CreateBox("WallRail", { width: w + 0.8, height: 1.6, depth: d + 0.8 }, scene);
      topRail.position.set(x, WALL_H + 0.8, z);
      topRail.material = trimMat;

      shadowGen.addShadowCaster(base);
      shadowGen.addShadowCaster(wall);
      shadowGen.addShadowCaster(topRail);
      stageMeshes.push(base, wall, topRail);
    }

    makeWall(0, -hl, ARENA_W, 2.8);
    makeWall(0, hl, ARENA_W, 2.8);
    makeWall(-hw, 0, 2.8, ARENA_L);
    makeWall(hw, 0, 2.8, ARENA_L);

    // 4 Corner Bastions with Peaked Roofs (Anchored firmly at y=0)
    [[-hw, -hl], [hw, -hl], [-hw, hl], [hw, hl]].forEach(([cx, cz]) => {
      const towerBase = BABYLON.MeshBuilder.CreateBox("TBase", { width: 11, height: 2.2, depth: 11 }, scene);
      towerBase.position.set(cx, 1.1, cz);
      towerBase.material = baseMat;

      const tower = BABYLON.MeshBuilder.CreateBox("TowerBody", { width: 9.5, height: WALL_H + 6, depth: 9.5 }, scene);
      tower.position.set(cx, (WALL_H + 6) / 2, cz);
      tower.material = wallMat;

      const roof = BABYLON.MeshBuilder.CreateCylinder("TowerRoof", { height: 8, diameterTop: 0, diameterBottom: 13, tessellation: 8 }, scene);
      roof.position.set(cx, WALL_H + 10, cz);
      roof.material = trimMat;

      shadowGen.addShadowCaster(towerBase);
      shadowGen.addShadowCaster(tower);
      shadowGen.addShadowCaster(roof);
      stageMeshes.push(towerBase, tower, roof);
    });

    // Hanging Banners
    for (let z = -hl + 20; z <= hl - 20; z += 24) {
      [-hw + 1.6, hw - 1.6].forEach(bx => {
        const banner = BABYLON.MeshBuilder.CreateBox("Banner", { width: 0.2, height: 8, depth: 4.5 }, scene);
        banner.position.set(bx, 10, z);
        banner.material = trimMat;
        stageMeshes.push(banner);
      });
    }
  }

  // ========================================================================
  // STAGES
  // ========================================================================
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

    const stoneTex = createProceduralTexture('stone-blocks');
    stoneTex.uScale = 8; stoneTex.vScale = 4;
    buildGroundedColosseumWalls(stoneTex, new BABYLON.Color3(0.92, 0.2, 0.18), new BABYLON.Color3(0.2, 0.22, 0.28));

    boss = createGroundedBoss(0, "CITADEL GOLEM", 260, new BABYLON.Color3(0.55, 0.62, 0.75));
  }

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

    buildGroundedColosseumWalls(sandTex, new BABYLON.Color3(0.68, 0.42, 0.2), new BABYLON.Color3(0.4, 0.25, 0.12));

    // Jumpable Bone Rib Obstacles (Grounded on floor)
    const boneMat = new BABYLON.PBRMaterial("bMat", scene);
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

      boneObstacles.push({ x: bx, z: bz, radius: 2.8, jumpH: 2.2 });
    }

    boss = createGroundedBoss(1, "DUNE COLOSSUS", 340, new BABYLON.Color3(0.88, 0.55, 0.24));
  }

  function buildJungleStage() {
    scene.clearColor = new BABYLON.Color4(0.48, 0.85, 0.65, 1.0);
    scene.fogColor = new BABYLON.Color3(0.48, 0.85, 0.65);

    const floor = BABYLON.MeshBuilder.CreateGround("Floor", { width: ARENA_W, height: ARENA_L }, scene);
    const fMat = new BABYLON.PBRMaterial("fMat", scene);
    const mossTex = createProceduralTexture('jungle-moss');
    mossTex.uScale = 12; mossTex.vScale = 12;
    fMat.albedoTexture = mossTex;
    fMat.roughness = 0.75;
    floor.material = fMat;
    floor.receiveShadows = true;
    stageMeshes.push(floor);

    buildGroundedColosseumWalls(mossTex, new BABYLON.Color3(0.2, 0.78, 0.32), new BABYLON.Color3(0.12, 0.35, 0.16));

    const bushMat = new BABYLON.PBRMaterial("bushMat", scene);
    bushMat.albedoColor = new BABYLON.Color3(0.18, 0.75, 0.3);
    bushMat.roughness = 0.7;

    for (let i = 0; i < 22; i++) {
      const ang = (i / 22) * Math.PI * 2;
      const dist = 24 + (i % 3) * 8;
      const fx = Math.cos(ang) * dist;
      const fz = Math.sin(ang) * dist;

      const clump = BABYLON.MeshBuilder.CreateSphere("BushClump", { diameter: 3.4 }, scene);
      clump.position.set(fx, 1.4, fz);
      clump.material = bushMat;
      shadowGen.addShadowCaster(clump);
      stageMeshes.push(clump);
    }

    boss = createGroundedBoss(2, "VERDANT STALKER", 420, new BABYLON.Color3(0.18, 0.55, 0.22));
  }

  // ========================================================================
  // GROUNDED CENTER BOSS (Pivoting at y = 0.0)
  // ========================================================================
  function createGroundedBoss(type, name, hp, color) {
    const root = new BABYLON.TransformNode("BossRoot", scene);
    root.position.set(0, 0, 0); // Exact center of the arena

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

    // Central Stone Dais (Resting on turf: y=0 to y=1.2)
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

    // Dual Siege Cannons
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
    else buildJungleStage();

    state.bossHp = boss.hp;
    state.maxBossHp = boss.maxHp;
    updateHUD();
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
  function setupControls() {
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

    scene.registerBeforeRender(() => {
      if (!state.isMobile) {
        input.forward = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
        input.right = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
      }
    });

    if (state.isMobile) {
      const mobUI = document.getElementById('so-mobile-ui');
      if (mobUI) mobUI.style.display = 'block';

      const base = document.getElementById('so-joy-base');
      const stick = document.getElementById('so-joy-stick');
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

      const btnJump = document.getElementById('so-btn-jump');
      if (btnJump) {
        btnJump.addEventListener('touchstart', (e) => {
          e.preventDefault();
          if (Math.abs(camera.position.y - 2.0) < 0.1) playerVy = 13.0;
        });
      }

      const btnFire = document.getElementById('so-btn-fire');
      if (btnFire) {
        btnFire.addEventListener('touchstart', (e) => {
          e.preventDefault();
          playerFire();
        });
      }
    }
  }

  // ========================================================================
  // RUNTIME LOOP & CIRCLING BOSS COMBAT
  // ========================================================================
  setupDOMOverlay();
  setupControls();
  loadStage(0);

  engine.runRenderLoop(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.1);

    // Kinematics Movement
    const moveMag = Math.hypot(input.forward, input.right);
    const fwd = camera.getForwardRay().direction;
    fwd.y = 0; fwd.normalize();
    const right = new BABYLON.Vector3(fwd.z, 0, -fwd.x);

    if (moveMag > 0.05) {
      const moveDir = fwd.scale(input.forward).add(right.scale(input.right)).normalize();
      const nx = camera.position.x + moveDir.x * 18 * dt;
      const nz = camera.position.z + moveDir.z * 18 * dt;

      // Prevent player walking into the central boss dais
      const distToCenter = Math.hypot(nx, nz);
      let blocked = distToCenter < 7.2;

      for (let b of boneObstacles) {
        if (Math.hypot(nx - b.x, nz - b.z) < 1.6 + b.radius) {
          if (camera.position.y < b.jumpH + 1.2) {
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
    // BOSS AI: Anchored at Center & Pivot Tracking
    // ======================================================================
    if (boss && !state.isTransitioning) {
      const toP = camera.position.subtract(boss.root.position);
      toP.y = 0;
      toP.normalize();

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
          // Stage 2 (Dune Colossus): Fast Shards
          shoot(origin, toP, false, 48);
          boss.attackTimer = 0.45;
        } else {
          // Stage 3 (Verdant Stalker FINAL BOSS): RAPID 5-BULLET STREAM
          for (let f = 0; f < 5; f++) {
            setTimeout(() => {
              if (boss && !state.isTransitioning) {
                const freshToP = camera.position.subtract(boss.root.position);
                freshToP.y = 0;
                shoot(new BABYLON.Vector3(0, 4.2, 0), freshToP.normalize(), false, 55);
              }
            }, f * 110);
          }
          boss.attackTimer = 2.0;
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

      // Stage 2 Bones Block Bullets
      if (!b.isPlayer) {
        let hitBone = false;
        for (let o of boneObstacles) {
          if (Math.hypot(b.mesh.position.x - o.x, b.mesh.position.z - o.z) < o.radius) {
            hitBone = true; break;
          }
        }
        if (hitBone) {
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
            const fade = document.getElementById('so-fade-curtain');
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

          const flash = document.getElementById('so-hit-flash');
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