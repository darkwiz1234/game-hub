// ============================================================================
// SHOOTOUT ⚔️ — True First-Person Babylon.js Runtime (shootout.js)
// ============================================================================

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('renderCanvas');
  if (!canvas) {
    console.error("Canvas element 'renderCanvas' not found!");
    return;
  }

  // 1. Initialize Engine
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
    bossHp: 220,
    bossMaxHp: 220,
    isTransitioning: false,
    isGameOver: false,
    isMobile: /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 820
  };

  const ARENA_W = 56;
  const ARENA_L = 76;

  let scene, camera, sunLight, fillLight, shadowGen;
  let currentBoss = null;
  let stageMeshes = [];
  let boneObstacles = [];
  let projectiles = [];
  let ambientParticles = null;

  // Viewmodel weapon & muzzle references
  let weaponNode, muzzleMesh, weaponRecoil = 0;

  // Kinematics & input
  const input = { forward: 0, right: 0 };
  let playerVy = 0;
  let walkBob = 0;
  let isPointerLocked = false;

  // Audio Synthesizer (Web Audio API)
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
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.12);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.12);
      osc.start(now); osc.stop(now + 0.12);
    } else if (type === 'enemy_fire') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.2);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.2);
      osc.start(now); osc.stop(now + 0.2);
    } else if (type === 'hit') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.linearRampToValueAtTime(30, now + 0.15);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.15);
      osc.start(now); osc.stop(now + 0.15);
    } else if (type === 'fanfare') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.exponentialRampToValueAtTime(760, now + 0.35);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.35);
      osc.start(now); osc.stop(now + 0.35);
    }
  }

  // ========================================================================
  // SCENE & FIRST PERSON CAMERA SETUP
  // ========================================================================
  function createScene() {
    scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.48, 0.78, 0.98, 1.0);

    // FIRST PERSON CAMERA: Eye height at 1.9, looking forward
    camera = new BABYLON.UniversalCamera("FpsCamera", new BABYLON.Vector3(0, 1.9, 22), scene);
    camera.setTarget(new BABYLON.Vector3(0, 1.9, 0));
    camera.speed = 0; // Movement managed manually for collisions & jumping
    camera.angularSensibility = 2400;
    camera.minZ = 0.1;
    camera.fov = 1.15;
    camera.attachControl(canvas, true);

    // Warm Sun + Fill Light
    fillLight = new BABYLON.HemisphericLight("FillLight", new BABYLON.Vector3(0, 1, 0), scene);
    fillLight.intensity = 0.85;

    sunLight = new BABYLON.DirectionalLight("SunLight", new BABYLON.Vector3(-0.5, -1.2, -0.7), scene);
    sunLight.position = new BABYLON.Vector3(30, 60, 40);
    sunLight.intensity = 1.25;

    shadowGen = new BABYLON.ShadowGenerator(1024, sunLight);
    shadowGen.useBlurExponentialShadowMap = true;
    shadowGen.blurKernel = 16;

    // Attach First-Person Viewmodel Gun (held in player's hands)
    buildFpsViewmodelGun();

    // Babylon GUI (Center Crosshair "+" & Health Bars)
    buildGUI();

    // Load Initial Stage 1
    loadStage(0);

    return scene;
  }

  // ========================================================================
  // FIRST PERSON VIEWMODEL GUN (Attached directly to Camera)
  // ========================================================================
  function buildFpsViewmodelGun() {
    weaponNode = new BABYLON.TransformNode("FpsGun", scene);
    weaponNode.parent = camera;
    weaponNode.position.set(0.4, -0.32, 0.75); // Lower right in front of camera

    const goldMat = new BABYLON.StandardMaterial("GunGold", scene);
    goldMat.diffuseColor = new BABYLON.Color3(1.0, 0.75, 0.1);

    const metalMat = new BABYLON.StandardMaterial("GunMetal", scene);
    metalMat.diffuseColor = new BABYLON.Color3(0.2, 0.28, 0.4);

    // Gun body
    const body = BABYLON.MeshBuilder.CreateBox("GunBody", { width: 0.18, height: 0.22, depth: 0.7 }, scene);
    body.parent = weaponNode;
    body.material = metalMat;

    // Top rail
    const rail = BABYLON.MeshBuilder.CreateBox("GunRail", { width: 0.12, height: 0.08, depth: 0.5 }, scene);
    rail.parent = weaponNode;
    rail.position.set(0, 0.12, 0.05);
    rail.material = goldMat;

    // Barrel
    const barrel = BABYLON.MeshBuilder.CreateCylinder("GunBarrel", { height: 0.5, diameter: 0.1 }, scene);
    barrel.parent = weaponNode;
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, 0.42);
    barrel.material = goldMat;

    // Muzzle Flash effect sphere
    muzzleMesh = BABYLON.MeshBuilder.CreateSphere("MuzzleLight", { diameter: 0.18 }, scene);
    muzzleMesh.parent = weaponNode;
    muzzleMesh.position.set(0, 0.02, 0.72);
    const mMat = new BABYLON.StandardMaterial("MuzzleMat", scene);
    mMat.emissiveColor = new BABYLON.Color3(0, 1, 1);
    muzzleMesh.material = mMat;
    muzzleMesh.isVisible = false;
  }

  // ========================================================================
  // BABYLON GUI: CENTER CROSSHAIR & TOP HUD
  // ========================================================================
  function buildGUI() {
    const ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("FpsUI");

    // Center Crosshair Vertical line
    const chV = new BABYLON.GUI.Rectangle("CrosshairV");
    chV.width = "3px";
    chV.height = "24px";
    chV.color = "white";
    chV.background = "#00f0ff";
    chV.shadowBlur = 6;
    chV.shadowColor = "#000";
    ui.addControl(chV);

    // Center Crosshair Horizontal line
    const chH = new BABYLON.GUI.Rectangle("CrosshairH");
    chH.width = "24px";
    chH.height = "3px";
    chH.color = "white";
    chH.background = "#00f0ff";
    chH.shadowBlur = 6;
    chH.shadowColor = "#000";
    ui.addControl(chH);

    // Center Pip
    const dot = new BABYLON.GUI.Ellipse("CrosshairDot");
    dot.width = "6px";
    dot.height = "6px";
    dot.color = "white";
    dot.background = "#ffea00";
    ui.addControl(dot);

    // Top Panel for Stage Name & Health
    const topPanel = new BABYLON.GUI.StackPanel();
    topPanel.width = "90%";
    topPanel.maxWidth = "620px";
    topPanel.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    topPanel.top = "10px";
    ui.addControl(topPanel);

    const titleText = new BABYLON.GUI.TextBlock("TitleText");
    titleText.text = "STAGE 1: CASTLE COURTYARD";
    titleText.height = "28px";
    titleText.color = "#ffea00";
    titleText.fontSize = "16px";
    titleText.fontFamily = "Rajdhani, sans-serif";
    titleText.fontWeight = "bold";
    topPanel.addControl(titleText);

    // Player HP
    const pBar = new BABYLON.GUI.Rectangle("PlayerBar");
    pBar.width = "100%";
    pBar.height = "16px";
    pBar.cornerRadius = 8;
    pBar.color = "#ffffff";
    pBar.thickness = 2;
    pBar.background = "rgba(10, 15, 30, 0.6)";
    topPanel.addControl(pBar);

    const pFill = new BABYLON.GUI.Rectangle("PlayerFill");
    pFill.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    pFill.width = "100%";
    pFill.height = "100%";
    pFill.color = "transparent";
    pFill.background = "#00ffaa";
    pBar.addControl(pFill);

    // Boss HP
    const bBar = new BABYLON.GUI.Rectangle("BossBar");
    bBar.width = "100%";
    bBar.height = "16px";
    bBar.cornerRadius = 8;
    bBar.color = "#ffffff";
    bBar.thickness = 2;
    bBar.background = "rgba(10, 15, 30, 0.6)";
    bBar.top = "6px";
    topPanel.addControl(bBar);

    const bFill = new BABYLON.GUI.Rectangle("BossFill");
    bFill.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    bFill.width = "100%";
    bFill.height = "100%";
    bFill.color = "transparent";
    bFill.background = "#ff0055";
    bBar.addControl(bFill);

    state.ui = { titleText, pFill, bFill };
  }

  function updateHUD() {
    if (!state.ui) return;
    const stageTitles = [
      "STAGE 1: CASTLE COURTYARD 🏰",
      "STAGE 2: DESERT WASTELAND 🏜️",
      "STAGE 3: JUNGLE CLEARING 🌴"
    ];
    state.ui.titleText.text = `${stageTitles[state.stageIndex]} — ${currentBoss ? currentBoss.name : ''} (DEFEATED: ${state.bossesDefeated})`;
    state.ui.pFill.width = `${Math.max(0, (state.playerHp / state.playerMaxHp) * 100)}%`;
    if (currentBoss) {
      state.ui.bFill.width = `${Math.max(0, (state.bossHp / state.bossMaxHp) * 100)}%`;
    }
  }

  // ========================================================================
  // STAGES & PROPS
  // ========================================================================
  function clearStage() {
    stageMeshes.forEach(m => m.dispose());
    stageMeshes = [];
    boneObstacles = [];
    if (currentBoss && currentBoss.root) {
      currentBoss.root.dispose();
      currentBoss = null;
    }
  }

  // Stage 1: Castle
  function buildCastleStage() {
    scene.clearColor = new BABYLON.Color4(0.48, 0.78, 0.98, 1.0);
    fillLight.diffuse = new BABYLON.Color3(1.0, 0.98, 0.92);

    const ground = BABYLON.MeshBuilder.CreateGround("Ground", { width: ARENA_W, height: ARENA_L }, scene);
    const gMat = new BABYLON.StandardMaterial("CGround", scene);
    gMat.diffuseColor = new BABYLON.Color3(0.44, 0.82, 0.28); // Vibrant meadow green
    ground.material = gMat;
    ground.receiveShadows = true;
    stageMeshes.push(ground);

    const stoneMat = new BABYLON.StandardMaterial("CStone", scene);
    stoneMat.diffuseColor = new BABYLON.Color3(0.9, 0.92, 0.95);

    const redMat = new BABYLON.StandardMaterial("CRed", scene);
    redMat.diffuseColor = new BABYLON.Color3(0.92, 0.2, 0.18);

    function addWall(x, z, w, d) {
      const wMesh = BABYLON.MeshBuilder.CreateBox("Wall", { width: w, height: 7, depth: d }, scene);
      wMesh.position.set(x, 3.5, z);
      wMesh.material = stoneMat;
      const trim = BABYLON.MeshBuilder.CreateBox("Trim", { width: w + 0.3, height: 1.0, depth: d + 0.3 }, scene);
      trim.position.set(x, 7.5, z);
      trim.material = redMat;
      stageMeshes.push(wMesh, trim);
      shadowGen.addShadowCaster(wMesh);
    }
    addWall(0, -ARENA_L / 2, ARENA_W, 1.8);
    addWall(0, ARENA_L / 2, ARENA_W, 1.8);
    addWall(-ARENA_W / 2, 0, 1.8, ARENA_L);
    addWall(ARENA_W / 2, 0, 1.8, ARENA_L);

    // Corner Watchtowers
    [
      [-ARENA_W / 2, -ARENA_L / 2], [ARENA_W / 2, -ARENA_L / 2],
      [-ARENA_W / 2, ARENA_L / 2], [ARENA_W / 2, ARENA_L / 2]
    ].forEach(([tx, tz]) => {
      const tower = BABYLON.MeshBuilder.CreateCylinder("Tower", { height: 16, diameter: 6 }, scene);
      tower.position.set(tx, 8, tz);
      tower.material = stoneMat;

      const roof = BABYLON.MeshBuilder.CreateCylinder("Roof", { height: 8, diameterTop: 0, diameterBottom: 8 }, scene);
      roof.position.set(tx, 20, tz);
      roof.material = redMat;
      stageMeshes.push(tower, roof);
      shadowGen.addShadowCaster(tower);
      shadowGen.addShadowCaster(roof);
    });

    currentBoss = createCastleBoss();
  }

  // Stage 2: Desert (Jumpable Bones)
  function buildDesertStage() {
    scene.clearColor = new BABYLON.Color4(0.96, 0.82, 0.52, 1.0);
    fillLight.diffuse = new BABYLON.Color3(1.0, 0.88, 0.7);

    const ground = BABYLON.MeshBuilder.CreateGround("DesertGround", { width: ARENA_W, height: ARENA_L }, scene);
    const sandMat = new BABYLON.StandardMaterial("SandMat", scene);
    sandMat.diffuseColor = new BABYLON.Color3(0.94, 0.74, 0.38);
    ground.material = sandMat;
    ground.receiveShadows = true;
    stageMeshes.push(ground);

    const sandstoneMat = new BABYLON.StandardMaterial("Sandstone", scene);
    sandstoneMat.diffuseColor = new BABYLON.Color3(0.78, 0.52, 0.28);

    function addWall(x, z, w, d) {
      const wMesh = BABYLON.MeshBuilder.CreateBox("Wall", { width: w, height: 7, depth: d }, scene);
      wMesh.position.set(x, 3.5, z);
      wMesh.material = sandstoneMat;
      stageMeshes.push(wMesh);
      shadowGen.addShadowCaster(wMesh);
    }
    addWall(0, -ARENA_L / 2, ARENA_W, 1.8);
    addWall(0, ARENA_L / 2, ARENA_W, 1.8);
    addWall(-ARENA_W / 2, 0, 1.8, ARENA_L);
    addWall(ARENA_W / 2, 0, 1.8, ARENA_L);

    // Large Bone Arches (Block enemy bullets, player can jump over!)
    const boneMat = new BABYLON.StandardMaterial("BoneMat", scene);
    boneMat.diffuseColor = new BABYLON.Color3(0.98, 0.95, 0.88);

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
      shadowGen.addShadowCaster(rib);

      boneObstacles.push({ x: bx, z: bz, radius: 2.8, jumpHeight: 2.2 });
    }

    currentBoss = createDesertBoss();
  }

  // Stage 3: Jungle
  function buildJungleStage() {
    scene.clearColor = new BABYLON.Color4(0.48, 0.85, 0.65, 1.0);
    fillLight.diffuse = new BABYLON.Color3(0.9, 1.0, 0.85);

    const ground = BABYLON.MeshBuilder.CreateGround("JungleGround", { width: ARENA_W, height: ARENA_L }, scene);
    const mossMat = new BABYLON.StandardMaterial("MossMat", scene);
    mossMat.diffuseColor = new BABYLON.Color3(0.2, 0.65, 0.28);
    ground.material = mossMat;
    ground.receiveShadows = true;
    stageMeshes.push(ground);

    const woodMat = new BABYLON.StandardMaterial("WoodMat", scene);
    woodMat.diffuseColor = new BABYLON.Color3(0.42, 0.26, 0.16);

    function addWall(x, z, w, d) {
      const wMesh = BABYLON.MeshBuilder.CreateBox("Wall", { width: w, height: 7, depth: d }, scene);
      wMesh.position.set(x, 3.5, z);
      wMesh.material = woodMat;
      stageMeshes.push(wMesh);
      shadowGen.addShadowCaster(wMesh);
    }
    addWall(0, -ARENA_L / 2, ARENA_W, 1.8);
    addWall(0, ARENA_L / 2, ARENA_W, 1.8);
    addWall(-ARENA_W / 2, 0, 1.8, ARENA_L);
    addWall(ARENA_W / 2, 0, 1.8, ARENA_L);

    // Foliage Bushes (Visual Cover Only)
    const leafMat = new BABYLON.StandardMaterial("BushMat", scene);
    leafMat.diffuseColor = new BABYLON.Color3(0.16, 0.82, 0.32);

    for (let i = 0; i < 22; i++) {
      const fx = (Math.random() - 0.5) * (ARENA_W - 14);
      const fz = (Math.random() - 0.5) * (ARENA_L - 18);
      if (Math.hypot(fx, fz) < 10) continue;

      const bushNode = new BABYLON.TransformNode("BushRoot", scene);
      bushNode.position.set(fx, 0, fz);

      for (let b = 0; b < 3; b++) {
        const clump = BABYLON.MeshBuilder.CreateSphere("Clump", { diameter: 2.5 + Math.random() }, scene);
        clump.parent = bushNode;
        clump.position.set((Math.random() - 0.5) * 1.6, 1.2 + Math.random() * 0.4, (Math.random() - 0.5) * 1.6);
        clump.material = leafMat;
      }
      stageMeshes.push(bushNode);
    }

    currentBoss = createJungleBoss();
  }

  // ========================================================================
  // BOSS TITANS
  // ========================================================================
  function createCastleBoss() {
    const root = new BABYLON.TransformNode("CastleBoss", scene);
    root.position.set(0, 0, -22);

    const stoneMat = new BABYLON.StandardMaterial("BStone", scene);
    stoneMat.diffuseColor = new BABYLON.Color3(0.55, 0.62, 0.75);

    const goldMat = new BABYLON.StandardMaterial("BGold", scene);
    goldMat.diffuseColor = new BABYLON.Color3(1.0, 0.75, 0.1);

    const body = BABYLON.MeshBuilder.CreateBox("BBody", { width: 4.4, height: 4.6, depth: 3.8 }, scene);
    body.parent = root;
    body.position.y = 3.8;
    body.material = stoneMat;
    shadowGen.addShadowCaster(body);

    const crown = BABYLON.MeshBuilder.CreateCylinder("BCrown", { height: 2, diameterTop: 3.6, diameterBottom: 2 }, scene);
    crown.parent = body;
    crown.position.y = 3.2;
    crown.material = goldMat;

    [-1.8, 1.8].forEach(x => {
      const cannon = BABYLON.MeshBuilder.CreateCylinder("BCannon", { height: 3.6, diameter: 0.7 }, scene);
      cannon.parent = body;
      cannon.rotation.x = Math.PI / 2;
      cannon.position.set(x, 0.2, 2.2);
      cannon.material = goldMat;
    });

    return {
      root, body, type: 0, name: "CITADEL GUARDIAN",
      speed: 6.0, attackTimer: 1.2, radius: 3.4, hp: 220, maxHp: 220, animTick: 0
    };
  }

  function createDesertBoss() {
    const root = new BABYLON.TransformNode("DesertBoss", scene);
    root.position.set(0, 0, -22);

    const chitinMat = new BABYLON.StandardMaterial("BChitin", scene);
    chitinMat.diffuseColor = new BABYLON.Color3(0.88, 0.55, 0.24);

    const hornMat = new BABYLON.StandardMaterial("BHorn", scene);
    hornMat.diffuseColor = new BABYLON.Color3(1.0, 0.35, 0.1);

    const body = BABYLON.MeshBuilder.CreateSphere("DBody", { diameter: 5.4 }, scene);
    body.parent = root;
    body.position.y = 3.2;
    body.material = chitinMat;
    shadowGen.addShadowCaster(body);

    const horn = BABYLON.MeshBuilder.CreateCone("DHorn", { height: 3.6, diameter: 1.6 }, scene);
    horn.parent = body;
    horn.rotation.x = Math.PI / 2;
    horn.position.set(0, 0.2, 3.2);
    horn.material = hornMat;

    return {
      root, body, type: 1, name: "DUNE COLOSSUS",
      speed: 9.5, attackTimer: 0.7, radius: 3.2, hp: 300, maxHp: 300, animTick: 0
    };
  }

  function createJungleBoss() {
    const root = new BABYLON.TransformNode("JungleBoss", scene);
    root.position.set(0, 0, -22);

    const barkMat = new BABYLON.StandardMaterial("BBark", scene);
    barkMat.diffuseColor = new BABYLON.Color3(0.18, 0.55, 0.22);

    const bloomMat = new BABYLON.StandardMaterial("BBloom", scene);
    bloomMat.diffuseColor = new BABYLON.Color3(1.0, 0.15, 0.5);

    const body = BABYLON.MeshBuilder.CreateBox("JBody", { width: 3.8, height: 4.8, depth: 3.2 }, scene);
    body.parent = root;
    body.position.y = 3.8;
    body.material = barkMat;
    shadowGen.addShadowCaster(body);

    const head = BABYLON.MeshBuilder.CreateOctahedron("JHead", { size: 2.2 }, scene);
    head.parent = body;
    head.position.y = 3.0;
    head.material = bloomMat;

    return {
      root, body, type: 2, name: "VERDANT STALKER",
      speed: 8.0, attackTimer: 1.4, radius: 3.2, hp: 380, maxHp: 380, animTick: 0
    };
  }

  function loadStage(idx) {
    clearStage();
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
    const sphere = BABYLON.MeshBuilder.CreateSphere("Bullet", { diameter: 0.65 }, scene);
    const bMat = new BABYLON.StandardMaterial("BMat", scene);
    bMat.diffuseColor = color;
    bMat.emissiveColor = color.scale(0.8);
    sphere.material = bMat;
    sphere.position.copyFrom(origin);

    projectiles.push({
      mesh: sphere,
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

    // Fire directly from camera crosshair direction
    const forward = camera.getForwardRay().direction;
    const spawnPos = camera.position.add(forward.scale(1.2));
    shootProjectile(spawnPos, forward, true, new BABYLON.Color3(0.0, 0.95, 1.0), 65);
  }

  function advanceStage() {
    if (state.isTransitioning) return;
    state.isTransitioning = true;
    playSound('fanfare');

    const overlay = document.getElementById('stage-fade');
    if (overlay) overlay.style.opacity = '1';

    setTimeout(() => {
      state.bossesDefeated++;
      loadStage(state.bossesDefeated);
      projectiles.forEach(p => p.mesh.dispose());
      projectiles = [];
      camera.position.set(0, 1.9, 22);

      if (overlay) overlay.style.opacity = '0';
      state.isTransitioning = false;
    }, 600);
  }

  // ========================================================================
  // CONTROLS INTERFACING
  // ========================================================================
  function setupControls() {
    const keys = {};

    window.addEventListener('keydown', (e) => {
      keys[e.code] = true;
      if (e.code === 'Space' && Math.abs(camera.position.y - 1.9) < 0.1) {
        playerVy = 13.0;
      }
      if (e.key === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        playerFire();
      }
    });

    window.addEventListener('keyup', (e) => {
      keys[e.code] = false;
    });

    // Pointer lock for immersive desktop FPS mouse look
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

    // Mobile UI Setup
    if (state.isMobile) {
      const mobUI = document.getElementById('mobile-ui');
      if (mobUI) mobUI.style.display = 'block';

      const base = document.getElementById('joystick-base');
      const knob = document.getElementById('joystick-knob');
      let touchId = null, baseRect = null;

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

            knob.style.transform = `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist}px))`;
            input.right = (Math.cos(angle) * dist) / 48;
            input.forward = -(Math.sin(angle) * dist) / 48;
          }
        }
      }, { passive: false });

      const endTouch = (e) => {
        for (let t of e.changedTouches) {
          if (t.identifier === touchId) {
            touchId = null;
            knob.style.transform = 'translate(-50%, -50%)';
            input.forward = 0; input.right = 0;
          }
        }
      };
      window.addEventListener('touchend', endTouch);
      window.addEventListener('touchcancel', endTouch);

      const btnJump = document.getElementById('btn-jump');
      if (btnJump) {
        btnJump.addEventListener('touchstart', (e) => {
          e.preventDefault();
          if (Math.abs(camera.position.y - 1.9) < 0.1) playerVy = 13.0;
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
  // MAIN RUNTIME LOOP
  // ========================================================================
  const currentScene = createScene();
  setupControls();

  engine.runRenderLoop(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.1);

    if (!state.isGameOver) {
      // 1. Move FPS Camera
      const moveMag = Math.hypot(input.forward, input.right);
      const camForward = camera.getForwardRay().direction;
      camForward.y = 0;
      camForward.normalize();

      const camRight = new BABYLON.Vector3(camForward.z, 0, -camForward.x);

      if (moveMag > 0.05) {
        const moveDir = camForward.scale(input.forward).add(camRight.scale(input.right)).normalize();
        const nextX = camera.position.x + moveDir.x * 16 * dt;
        const nextZ = camera.position.z + moveDir.z * 16 * dt;

        // Check Bone Obstacles Collision (Stage 2)
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

        // Viewmodel weapon sway / bobbing while running
        walkBob += dt * 10;
        weaponNode.position.y = -0.32 + Math.sin(walkBob) * 0.02;
        weaponNode.position.x = 0.4 + Math.cos(walkBob * 0.5) * 0.015;
      } else {
        weaponNode.position.y = -0.32;
        weaponNode.position.x = 0.4;
      }

      // Constrain inside Arena bounds
      camera.position.x = Math.max(-ARENA_W / 2 + 2, Math.min(ARENA_W / 2 - 2, camera.position.x));
      camera.position.z = Math.max(-ARENA_L / 2 + 2, Math.min(ARENA_L / 2 - 2, camera.position.z));

      // Gravity & Vertical Physics
      camera.position.y += playerVy * dt;
      if (camera.position.y > 1.9) {
        playerVy -= 32 * dt;
      } else {
        camera.position.y = 1.9;
        playerVy = 0;
      }

      // Weapon Recoil recovery
      if (weaponRecoil > 0) {
        weaponNode.position.z = 0.75 - weaponRecoil * 0.4;
        weaponNode.rotation.x = -weaponRecoil * 0.5;
        weaponRecoil -= dt * 2.2;
      } else {
        weaponNode.position.z = 0.75;
        weaponNode.rotation.x = 0;
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
            // Citadel Guardian: Triple Spread Shells
            for (let a = -0.25; a <= 0.25; a += 0.25) {
              const dir = new BABYLON.Vector3(toPlayer.x + a * toPlayer.z, 0, toPlayer.z - a * toPlayer.x);
              shootProjectile(spawnPos, dir, false, new BABYLON.Color3(1.0, 0.2, 0.1), 35);
            }
            currentBoss.attackTimer = 1.4;
          } else if (currentBoss.type === 1) {
            // Dune Colossus: Rapid Sand Shards
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
              camera.position.set(0, 1.9, 22);
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