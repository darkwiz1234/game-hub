// ============================================================================
// SHOOTOUT ⚔️ — Babylon.js Complete Game Runtime (shootout.js)
// ============================================================================

window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('renderCanvas');
    if (!canvas) {
        console.error("Canvas element with id 'renderCanvas' not found!");
        return;
    }

    // 1. Initialize Babylon Engine
    const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });

    // --- GAME STATE ---
    const gameState = {
      currentStage: 0,
      bossesDefeated: 0,
      playerHp: 100,
      playerMaxHp: 100,
      bossHp: 200,
      bossMaxHp: 200,
      isTransitioning: false,
      isGameOver: false,
      isMobile: /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 820
    };

    // Shared references
    let scene, camera, dirLight, hemiLight;
    let player = null;
    let currentBoss = null;
    let projectiles = [];
    let stageMeshes = [];
    let boneObstacles = [];
    let jungleBushes = [];

    // Movement & control inputs
    const inputState = { forward: 0, right: 0, jump: false, shooting: false };

    // ========================================================================
    // PROCEDURAL AUDIO SYNTHESIZER (No external audio files needed)
    // ========================================================================
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    function playSfx(type) {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        if (type === 'laser') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(650, now);
            osc.frequency.exponentialRampToValueAtTime(180, now + 0.12);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.12);
            osc.start(now); osc.stop(now + 0.12);
        } else if (type === 'boss_shot') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(240, now);
            osc.frequency.exponentialRampToValueAtTime(60, now + 0.18);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.18);
            osc.start(now); osc.stop(now + 0.18);
        } else if (type === 'hit') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(120, now);
            osc.frequency.linearRampToValueAtTime(30, now + 0.12);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.12);
            osc.start(now); osc.stop(now + 0.12);
        } else if (type === 'fanfare') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.exponentialRampToValueAtTime(700, now + 0.35);
            gain.gain.setValueAtTime(0.35, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.35);
            osc.start(now); osc.stop(now + 0.35);
        }
    }

    // ========================================================================
    // 2. CREATE SCENE & LIGHTING (Bright Daytime Atmosphere)
    // ========================================================================
    function createMainScene() {
        scene = new BABYLON.Scene(engine);
        scene.clearColor = new BABYLON.Color4(0.45, 0.75, 0.98, 1.0); // Cheerful blue sky

        // 3rd Person Follow / Arc Camera
        camera = new BABYLON.ArcRotateCamera(
            "GameCamera",
            -Math.PI / 2,
            Math.PI / 3.2,
            24,
            new BABYLON.Vector3(0, 2, 0),
            scene
        );
        camera.attachControl(canvas, true);
        camera.lowerRadiusLimit = 12;
        camera.upperRadiusLimit = 45;
        camera.lowerBetaLimit = 0.2;
        camera.upperBetaLimit = Math.PI / 2 - 0.05;

        // Bright hemispheric skylight & warm directional sun
        hemiLight = new BABYLON.HemisphericLight("Hemi", new BABYLON.Vector3(0, 1, 0), scene);
        hemiLight.intensity = 0.9;
        hemiLight.diffuse = new BABYLON.Color3(1.0, 0.98, 0.92);
        hemiLight.groundColor = new BABYLON.Color3(0.55, 0.65, 0.45);

        dirLight = new BABYLON.DirectionalLight("Sun", new BABYLON.Vector3(-0.6, -1.2, -0.8), scene);
        dirLight.position = new BABYLON.Vector3(30, 60, 40);
        dirLight.intensity = 1.1;

        // Build Player Character Rig
        buildPlayerRig();

        // Build Stage 1 Arena & Boss
        loadStage(0);

        // Build GUI overlay (Health bars + Mobile controls)
        buildGameUI();

        return scene;
    }

    // ========================================================================
    // 3. ANIMATED PLAYER RIG (Procedural Bone Strides + Cannon Recoil)
    // ========================================================================
    function buildPlayerRig() {
        const root = new BABYLON.TransformNode("PlayerRoot", scene);

        // Materials
        const armorMat = new BABYLON.StandardMaterial("P_ArmorMat", scene);
        armorMat.diffuseColor = new BABYLON.Color3(0.2, 0.4, 0.85); // Cheerful royal blue

        const whiteMat = new BABYLON.StandardMaterial("P_WhiteMat", scene);
        whiteMat.diffuseColor = new BABYLON.Color3(0.92, 0.95, 1.0);

        const goldMat = new BABYLON.StandardMaterial("P_GoldMat", scene);
        goldMat.diffuseColor = new BABYLON.Color3(1.0, 0.78, 0.1);

        // Torso
        const torso = BABYLON.MeshBuilder.CreateBox("Torso", { width: 1.4, height: 1.6, depth: 1.0 }, scene);
        torso.parent = root;
        torso.position.y = 2.0;
        torso.material = armorMat;

        const breastplate = BABYLON.MeshBuilder.CreateBox("BreastPlate", { width: 1.1, height: 1.0, depth: 0.35 }, scene);
        breastplate.parent = torso;
        breastplate.position.set(0, 0.1, 0.45);
        breastplate.material = goldMat;

        // Head & Visor
        const head = BABYLON.MeshBuilder.CreateBox("Head", { width: 0.85, height: 0.7, depth: 0.85 }, scene);
        head.parent = torso;
        head.position.set(0, 1.25, 0);
        head.material = armorMat;

        const visor = BABYLON.MeshBuilder.CreateBox("Visor", { width: 0.7, height: 0.25, depth: 0.2 }, scene);
        visor.parent = head;
        visor.position.set(0, 0.05, 0.4);
        visor.material = whiteMat;

        // Right Arm (Articulated Blaster Cannon)
        const rightArmPivot = new BABYLON.TransformNode("RightArmPivot", scene);
        rightArmPivot.parent = torso;
        rightArmPivot.position.set(0.95, 0.35, 0);

        const shoulderR = BABYLON.MeshBuilder.CreateSphere("ShoulderR", { diameter: 0.55 }, scene);
        shoulderR.parent = rightArmPivot;
        shoulderR.material = goldMat;

        const cannonBody = BABYLON.MeshBuilder.CreateCylinder("CannonBody", { height: 1.4, diameter: 0.4 }, scene);
        cannonBody.parent = rightArmPivot;
        cannonBody.rotation.x = Math.PI / 2;
        cannonBody.position.set(0.1, -0.3, 0.6);
        cannonBody.material = armorMat;

        // Left Arm
        const leftArmPivot = new BABYLON.TransformNode("LeftArmPivot", scene);
        leftArmPivot.parent = torso;
        leftArmPivot.position.set(-0.95, 0.35, 0);

        const shoulderL = BABYLON.MeshBuilder.CreateSphere("ShoulderL", { diameter: 0.55 }, scene);
        shoulderL.parent = leftArmPivot;
        shoulderL.material = goldMat;

        const armL = BABYLON.MeshBuilder.CreateBox("ArmL", { width: 0.35, height: 1.1, depth: 0.35 }, scene);
        armL.parent = leftArmPivot;
        armL.position.set(0, -0.45, 0);
        armL.material = whiteMat;

        // Legs
        const rightLegPivot = new BABYLON.TransformNode("RightLegPivot", scene);
        rightLegPivot.parent = root;
        rightLegPivot.position.set(0.42, 1.2, 0);
        const legR = BABYLON.MeshBuilder.CreateBox("LegR", { width: 0.45, height: 1.2, depth: 0.5 }, scene);
        legR.parent = rightLegPivot;
        legR.position.y = -0.6;
        legR.material = whiteMat;

        const leftLegPivot = new BABYLON.TransformNode("LeftLegPivot", scene);
        leftLegPivot.parent = root;
        leftLegPivot.position.set(-0.42, 1.2, 0);
        const legL = BABYLON.MeshBuilder.CreateBox("LegL", { width: 0.45, height: 1.2, depth: 0.5 }, scene);
        legL.parent = leftLegPivot;
        legL.position.y = -0.6;
        legL.material = whiteMat;

        player = {
            root,
            torso,
            rightArmPivot,
            leftArmPivot,
            rightLegPivot,
            leftLegPivot,
            position: root.position,
            vy: 0,
            isGrounded: true,
            speed: 15,
            rotationY: 0,
            animTimer: 0,
            shootCooldown: 0,
            shootRecoil: 0,
            radius: 1.6
        };

        player.position.set(0, 0, 22);
    }

    // ========================================================================
    // 4. STAGE BUILDERS (Bright, Clean, Themed Playgrounds)
    // ========================================================================
    const ARENA_W = 50;
    const ARENA_L = 70;

    function clearCurrentStage() {
        stageMeshes.forEach(m => m.dispose());
        stageMeshes = [];
        boneObstacles = [];
        jungleBushes = [];
        if (currentBoss && currentBoss.root) {
            currentBoss.root.dispose();
            currentBoss = null;
        }
    }

    // --- STAGE 1: BRIGHT CASTLE COURTYARD ---
    function buildCastleStage() {
        scene.clearColor = new BABYLON.Color4(0.48, 0.78, 0.98, 1.0); // Sunny azure sky
        hemiLight.diffuse = new BABYLON.Color3(1.0, 0.96, 0.9);
        dirLight.diffuse = new BABYLON.Color3(1.0, 0.92, 0.82);

        // Ground: Cheerful Green Courtyard Grass
        const ground = BABYLON.MeshBuilder.CreateGround("Ground", { width: ARENA_W, height: ARENA_L }, scene);
        const grassMat = new BABYLON.StandardMaterial("GrassMat", scene);
        grassMat.diffuseColor = new BABYLON.Color3(0.42, 0.78, 0.24); // Sunny meadow green
        grassMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        ground.material = grassMat;
        stageMeshes.push(ground);

        // Warm Stone Wall Materials
        const stoneMat = new BABYLON.StandardMaterial("CastleStone", scene);
        stoneMat.diffuseColor = new BABYLON.Color3(0.88, 0.88, 0.92);

        const redRoofMat = new BABYLON.StandardMaterial("RedRoof", scene);
        redRoofMat.diffuseColor = new BABYLON.Color3(0.9, 0.22, 0.18);

        const goldTrim = new BABYLON.StandardMaterial("GoldTrim", scene);
        goldTrim.diffuseColor = new BABYLON.Color3(1.0, 0.75, 0.1);

        // Perimeter Castle Ramparts
        function makeCastleWall(x, z, w, d) {
            const wall = BABYLON.MeshBuilder.CreateBox("CWall", { width: w, height: 6, depth: d }, scene);
            wall.position.set(x, 3, z);
            wall.material = stoneMat;

            const battlement = BABYLON.MeshBuilder.CreateBox("CBattlement", { width: w + 0.3, height: 0.9, depth: d + 0.3 }, scene);
            battlement.position.set(x, 6.45, z);
            battlement.material = redRoofMat;
            stageMeshes.push(wall, battlement);
        }
        makeCastleWall(0, -ARENA_L / 2, ARENA_W, 1.5);
        makeCastleWall(0, ARENA_L / 2, ARENA_W, 1.5);
        makeCastleWall(-ARENA_W / 2, 0, 1.5, ARENA_L);
        makeCastleWall(ARENA_W / 2, 0, 1.5, ARENA_L);

        // 4 Watchtowers with Red Conical Roofs
        [
            [-ARENA_W / 2, -ARENA_L / 2], [ARENA_W / 2, -ARENA_L / 2],
            [-ARENA_W / 2, ARENA_L / 2], [ARENA_W / 2, ARENA_L / 2]
        ].forEach(([tx, tz]) => {
            const tower = BABYLON.MeshBuilder.CreateCylinder("Tower", { height: 14, diameter: 5.5, tessellation: 12 }, scene);
            tower.position.set(tx, 7, tz);
            tower.material = stoneMat;

            const cone = BABYLON.MeshBuilder.CreateCylinder("ConeRoof", { height: 7, diameterTop: 0, diameterBottom: 7 }, scene);
            cone.position.set(tx, 17.5, tz);
            cone.material = redRoofMat;

            stageMeshes.push(tower, cone);
        });

        // Spawn Boss 1: Castle Guardian (Grand Golem)
        currentBoss = createCastleBoss();
    }

    // --- STAGE 2: DESERT WASTELAND (Giant Bones to Jump Over) ---
    function buildDesertStage() {
        scene.clearColor = new BABYLON.Color4(0.96, 0.82, 0.52, 1.0); // Warm sunny haze
        hemiLight.diffuse = new BABYLON.Color3(1.0, 0.9, 0.75);
        dirLight.diffuse = new BABYLON.Color3(1.0, 0.8, 0.5);

        // Ground: Golden Sand
        const ground = BABYLON.MeshBuilder.CreateGround("DesertGround", { width: ARENA_W, height: ARENA_L }, scene);
        const sandMat = new BABYLON.StandardMaterial("SandMat", scene);
        sandMat.diffuseColor = new BABYLON.Color3(0.92, 0.72, 0.38);
        ground.material = sandMat;
        stageMeshes.push(ground);

        // Sandstone Boundary Walls
        const rockMat = new BABYLON.StandardMaterial("RockMat", scene);
        rockMat.diffuseColor = new BABYLON.Color3(0.78, 0.52, 0.28);

        function makeSandWall(x, z, w, d) {
            const wall = BABYLON.MeshBuilder.CreateBox("SWall", { width: w, height: 6, depth: d }, scene);
            wall.position.set(x, 3, z);
            wall.material = rockMat;
            stageMeshes.push(wall);
        }
        makeSandWall(0, -ARENA_L / 2, ARENA_W, 1.5);
        makeSandWall(0, ARENA_L / 2, ARENA_W, 1.5);
        makeSandWall(-ARENA_W / 2, 0, 1.5, ARENA_L);
        makeSandWall(ARENA_W / 2, 0, 1.5, ARENA_L);

        // Scatter Giant Skeletal Ribcages (Jumpable Obstacles)
        const boneMat = new BABYLON.StandardMaterial("BoneMat", scene);
        boneMat.diffuseColor = new BABYLON.Color3(0.96, 0.94, 0.86);

        for (let i = 0; i < 12; i++) {
            const bx = (Math.random() - 0.5) * (ARENA_W - 14);
            const bz = (Math.random() - 0.5) * (ARENA_L - 18);
            if (Math.hypot(bx, bz) < 10) continue; // Keep central ring open

            const rib = BABYLON.MeshBuilder.CreateTorus("BoneRib", {
                diameter: 4.8,
                thickness: 0.8,
                tessellation: 12
            }, scene);
            rib.position.set(bx, 0.2, bz);
            rib.rotation.z = Math.PI / 2;
            rib.rotation.y = Math.random() * Math.PI;
            rib.material = boneMat;

            stageMeshes.push(rib);
            boneObstacles.push({
                x: bx,
                z: bz,
                radius: 2.6,
                jumpClearHeight: 2.2 // If player jump Y is higher than this, you clear it!
            });
        }

        // Spawn Boss 2: Dune Beast
        currentBoss = createDesertBoss();
    }

    // --- STAGE 3: JUNGLE CLEARING (Leafy Foliage for Visual Cover) ---
    function buildJungleStage() {
        scene.clearColor = new BABYLON.Color4(0.48, 0.85, 0.65, 1.0); // Vibrant tropical sky
        hemiLight.diffuse = new BABYLON.Color3(0.95, 1.0, 0.85);
        dirLight.diffuse = new BABYLON.Color3(0.85, 1.0, 0.7);

        // Ground: Lush Forest Moss
        const ground = BABYLON.MeshBuilder.CreateGround("JungleGround", { width: ARENA_W, height: ARENA_L }, scene);
        const mossMat = new BABYLON.StandardMaterial("MossMat", scene);
        mossMat.diffuseColor = new BABYLON.Color3(0.24, 0.65, 0.28);
        ground.material = mossMat;
        stageMeshes.push(ground);

        // Bamboo & Wood Boundaries
        const woodMat = new BABYLON.StandardMaterial("WoodMat", scene);
        woodMat.diffuseColor = new BABYLON.Color3(0.38, 0.24, 0.14);

        function makeJungleWall(x, z, w, d) {
            const wall = BABYLON.MeshBuilder.CreateBox("JWall", { width: w, height: 6, depth: d }, scene);
            wall.position.set(x, 3, z);
            wall.material = woodMat;
            stageMeshes.push(wall);
        }
        makeJungleWall(0, -ARENA_L / 2, ARENA_W, 1.5);
        makeJungleWall(0, ARENA_L / 2, ARENA_W, 1.5);
        makeJungleWall(-ARENA_W / 2, 0, 1.5, ARENA_L);
        makeJungleWall(ARENA_W / 2, 0, 1.5, ARENA_L);

        // Scattered Foliage Bushes (Visual Cover Only: Bullets pass through freely)
        const bushMat = new BABYLON.StandardMaterial("BushMat", scene);
        bushMat.diffuseColor = new BABYLON.Color3(0.18, 0.78, 0.32);

        const flowerMat = new BABYLON.StandardMaterial("FlowerMat", scene);
        flowerMat.diffuseColor = new BABYLON.Color3(1.0, 0.2, 0.6);

        for (let i = 0; i < 20; i++) {
            const fx = (Math.random() - 0.5) * (ARENA_W - 14);
            const fz = (Math.random() - 0.5) * (ARENA_L - 18);
            if (Math.hypot(fx, fz) < 10) continue;

            const bushRoot = new BABYLON.TransformNode("BushRoot", scene);
            bushRoot.position.set(fx, 0, fz);

            for (let b = 0; b < 3; b++) {
                const clump = BABYLON.MeshBuilder.CreateSphere("LeafClump", { diameter: 2.2 + Math.random() }, scene);
                clump.parent = bushRoot;
                clump.position.set((Math.random() - 0.5) * 1.5, 1.1 + Math.random() * 0.5, (Math.random() - 0.5) * 1.5);
                clump.material = bushMat;
            }

            const flower = BABYLON.MeshBuilder.CreateSphere("Flower", { diameter: 0.6 }, scene);
            flower.parent = bushRoot;
            flower.position.set(0, 2.5, 0);
            flower.material = flowerMat;

            stageMeshes.push(bushRoot);
            jungleBushes.push({ x: fx, z: fz });
        }

        // Spawn Boss 3: Jungle Predator
        currentBoss = createJungleBoss();
    }

    // ========================================================================
    // 5. BOSS TITAN RIGS (Stage Unique)
    // ========================================================================
    function createCastleBoss() {
        const root = new BABYLON.TransformNode("CastleBoss", scene);
        root.position.set(0, 0, -22);

        const stoneMat = new BABYLON.StandardMaterial("BossStoneMat", scene);
        stoneMat.diffuseColor = new BABYLON.Color3(0.55, 0.6, 0.7);

        const goldMat = new BABYLON.StandardMaterial("BossGoldMat", scene);
        goldMat.diffuseColor = new BABYLON.Color3(1.0, 0.75, 0.1);

        const body = BABYLON.MeshBuilder.CreateBox("B_Body", { width: 4.2, height: 4.5, depth: 3.8 }, scene);
        body.parent = root;
        body.position.y = 3.8;
        body.material = stoneMat;

        const crown = BABYLON.MeshBuilder.CreateCylinder("B_Crown", { height: 2, diameterTop: 3.5, diameterBottom: 2 }, scene);
        crown.parent = body;
        crown.position.y = 3.2;
        crown.material = goldMat;

        // Twin Cannons
        [-1.8, 1.8].forEach(x => {
            const cannon = BABYLON.MeshBuilder.CreateCylinder("B_Cannon", { height: 3.5, diameter: 0.7 }, scene);
            cannon.parent = body;
            cannon.rotation.x = Math.PI / 2;
            cannon.position.set(x, 0, 2.2);
            cannon.material = goldMat;
        });

        return {
            root,
            body,
            type: 0,
            name: "CASTLE GUARDIAN",
            speed: 5.5,
            attackTimer: 1.2,
            radius: 3.2,
            hp: 200,
            maxHp: 200
        };
    }

    function createDesertBoss() {
        const root = new BABYLON.TransformNode("DesertBoss", scene);
        root.position.set(0, 0, -22);

        const sandMat = new BABYLON.StandardMaterial("SandBeastMat", scene);
        sandMat.diffuseColor = new BABYLON.Color3(0.88, 0.55, 0.22);

        const amberMat = new BABYLON.StandardMaterial("AmberMat", scene);
        amberMat.diffuseColor = new BABYLON.Color3(1.0, 0.4, 0.1);

        const body = BABYLON.MeshBuilder.CreateSphere("D_Body", { diameter: 5.2 }, scene);
        body.parent = root;
        body.position.y = 3.2;
        body.material = sandMat;

        const mandible = BABYLON.MeshBuilder.CreateCylinder("Mandible", { height: 3.2, diameterTop: 0.1, diameterBottom: 1.4 }, scene);
        mandible.parent = body;
        mandible.rotation.x = Math.PI / 2;
        mandible.position.set(0, 0, 3.2);
        mandible.material = amberMat;

        return {
            root,
            body,
            type: 1,
            name: "DUNE COLOSSUS",
            speed: 9.0,
            attackTimer: 0.8,
            radius: 3.2,
            hp: 280,
            maxHp: 280
        };
    }

    function createJungleBoss() {
        const root = new BABYLON.TransformNode("JungleBoss", scene);
        root.position.set(0, 0, -22);

        const leafMat = new BABYLON.StandardMaterial("LeafMat", scene);
        leafMat.diffuseColor = new BABYLON.Color3(0.12, 0.55, 0.22);

        const flowerMat = new BABYLON.StandardMaterial("FlowerHeadMat", scene);
        flowerMat.diffuseColor = new BABYLON.Color3(1.0, 0.2, 0.5);

        const body = BABYLON.MeshBuilder.CreateBox("J_Body", { width: 3.8, height: 4.8, depth: 3.2 }, scene);
        body.parent = root;
        body.position.y = 3.8;
        body.material = leafMat;

        const crest = BABYLON.MeshBuilder.CreateTorus("BloomCrest", { diameter: 3.4, thickness: 0.8 }, scene);
        crest.parent = body;
        crest.position.set(0, 2.8, 0);
        crest.material = flowerMat;

        return {
            root,
            body,
            type: 2,
            name: "VERDANT STALKER",
            speed: 7.5,
            chargeTimer: 0,
            attackTimer: 1.4,
            radius: 3.0,
            hp: 360,
            maxHp: 360
        };
    }

    function loadStage(index) {
        clearCurrentStage();
        gameState.currentStage = index % 3;

        if (gameState.currentStage === 0) buildCastleStage();
        else if (gameState.currentStage === 1) buildDesertStage();
        else buildJungleStage();

        gameState.bossHp = currentBoss.maxHp;
        gameState.bossMaxHp = currentBoss.maxHp;

        updateHUD();
    }

    // ========================================================================
    // 6. PROJECTILES FACTORY & HIT REGISTRATION
    // ========================================================================
    function shootBullet(origin, angle, isPlayer = false, color = new BABYLON.Color3(0.0, 0.9, 1.0), speed = 48, spread = 0) {
        const sphere = BABYLON.MeshBuilder.CreateSphere("Bullet", { diameter: 0.8 }, scene);
        const mat = new BABYLON.StandardMaterial("BulletMat", scene);
        mat.diffuseColor = color;
        mat.emissiveColor = color.scale(0.6);
        sphere.material = mat;
        sphere.position.copyFrom(origin);

        const dirAngle = angle + spread;
        projectiles.push({
            mesh: sphere,
            isPlayer,
            vx: Math.sin(dirAngle) * speed,
            vz: Math.cos(dirAngle) * speed,
            life: 2.8
        });

        playSfx(isPlayer ? 'laser' : 'boss_shot');
    }

    function triggerStageAdvance() {
        if (gameState.isTransitioning) return;
        gameState.isTransitioning = true;
        playSfx('fanfare');

        const fadeOverlay = document.getElementById('stage-fade');
        fadeOverlay.style.opacity = '1';

        setTimeout(() => {
            gameState.bossesDefeated++;
            loadStage(gameState.bossesDefeated);
            projectiles.forEach(p => p.mesh.dispose());
            projectiles = [];
            player.position.set(0, 0, 22);

            fadeOverlay.style.opacity = '0';
            gameState.isTransitioning = false;
        }, 550);
    }

    // ========================================================================
    // 7. DUAL CONTROL SCHEMES (Desktop Keyboard/Mouse & Mobile Touchpad)
    // ========================================================================
    function setupControls() {
        // --- DESKTOP CONTROLS ---
        const keys = {};
        window.addEventListener('keydown', (e) => {
            keys[e.code] = true;
            if (e.code === 'Space' && player && player.isGrounded) {
                player.vy = 12.5;
                player.isGrounded = false;
            }
            if (e.key === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
                inputState.shooting = true;
            }
        });

        window.addEventListener('keyup', (e) => {
            keys[e.code] = false;
            if (e.key === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
                inputState.shooting = false;
            }
        });

        canvas.addEventListener('pointerdown', (e) => {
            // Left click fires weapon
            if (e.button === 0 && !gameState.isMobile) {
                inputState.shooting = true;
            }
        });

        canvas.addEventListener('pointerup', (e) => {
            if (e.button === 0 && !gameState.isMobile) {
                inputState.shooting = false;
            }
        });

        // Polling Desktop Keyboard into InputState
        scene.registerBeforeRender(() => {
            if (!gameState.isMobile) {
                inputState.forward = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
                inputState.right = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
            }
        });

        // --- MOBILE CONTROLS (Single Joystick + Jump & Shoot Buttons) ---
        if (gameState.isMobile) {
            document.getElementById('mobile-ui').style.display = 'block';

            const joyBase = document.getElementById('joystick-base');
            const joyStick = document.getElementById('joystick-stick');
            let touchId = null, baseRect = null;

            joyBase.addEventListener('touchstart', (e) => {
                e.preventDefault();
                touchId = e.changedTouches[0].identifier;
                baseRect = joyBase.getBoundingClientRect();
            }, { passive: false });

            window.addEventListener('touchmove', (e) => {
                if (touchId === null) return;
                for (let t of e.changedTouches) {
                    if (t.identifier === touchId) {
                        const dx = t.clientX - (baseRect.left + baseRect.width / 2);
                        const dy = t.clientY - (baseRect.top + baseRect.height / 2);
                        const dist = Math.min(50, Math.hypot(dx, dy));
                        const angle = Math.atan2(dy, dx);

                        joyStick.style.transform = `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist}px))`;
                        inputState.right = (Math.cos(angle) * dist) / 50;
                        inputState.forward = -(Math.sin(angle) * dist) / 50;
                    }
                }
            }, { passive: false });

            const endJoy = (e) => {
                for (let t of e.changedTouches) {
                    if (t.identifier === touchId) {
                        touchId = null;
                        joyStick.style.transform = 'translate(-50%, -50%)';
                        inputState.forward = 0; inputState.right = 0;
                    }
                }
            };
            window.addEventListener('touchend', endJoy);
            window.addEventListener('touchcancel', endJoy);

            // Jump & Fire Buttons
            const btnJump = document.getElementById('btn-jump');
            btnJump.addEventListener('touchstart', (e) => {
                e.preventDefault();
                if (player && player.isGrounded) {
                    player.vy = 12.5;
                    player.isGrounded = false;
                }
            });

            const btnFire = document.getElementById('btn-fire');
            btnFire.addEventListener('touchstart', (e) => {
                e.preventDefault();
                inputState.shooting = true;
            });
            btnFire.addEventListener('touchend', () => {
                inputState.shooting = false;
            });
        }
    }

    // ========================================================================
    // 8. HUD & UI MANAGEMENT
    // ========================================================================
    function buildGameUI() {
        let existingHud = document.getElementById('game-hud-wrap');
        if (existingHud) return;

        const hudHtml = `
        <div id="game-hud-wrap" style="position: absolute; top: 12px; left: 50%; transform: translateX(-50%); width: 90%; max-width: 620px; z-index: 10; pointer-events: none; font-family: 'Rajdhani', sans-serif;">
            <div style="display: flex; justify-content: space-between; font-weight: 900; font-size: 15px; margin-bottom: 6px; text-shadow: 0 1px 3px rgba(0,0,0,0.5);">
                <span id="ui-stage" style="color: #ffea00;">STAGE 1: CASTLE COURTYARD</span>
                <span id="ui-score" style="color: #fff;">DEFEATED: 0</span>
            </div>
            <div style="background: rgba(0,0,0,0.4); height: 16px; border-radius: 8px; border: 2px solid #fff; overflow: hidden; margin-bottom: 6px;">
                <div id="ui-player-hp" style="width: 100%; height: 100%; background: linear-gradient(90deg, #00ff88, #00d4ff);"></div>
            </div>
            <div style="background: rgba(0,0,0,0.4); height: 16px; border-radius: 8px; border: 2px solid #fff; overflow: hidden;">
                <div id="ui-boss-hp" style="width: 100%; height: 100%; background: linear-gradient(90deg, #ff0055, #ffaa00);"></div>
            </div>
        </div>

        <div id="stage-fade" style="position: absolute; inset: 0; background: #fff; opacity: 0; pointer-events: none; transition: opacity 0.5s ease; z-index: 50;"></div>

        <div id="mobile-ui" style="display: none; position: absolute; inset: 0; pointer-events: none; z-index: 20;">
            <div id="joystick-base" style="position: absolute; bottom: 25px; left: 25px; width: 125px; height: 125px; border-radius: 50%; border: 3px solid rgba(255,255,255,0.7); background: rgba(0,0,0,0.3); pointer-events: auto; touch-action: none;">
                <div id="joystick-stick" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 48px; height: 48px; border-radius: 50%; background: #ffea00; box-shadow: 0 0 10px #ffea00; pointer-events: none;"></div>
            </div>
            <div id="btn-jump" style="position: absolute; bottom: 120px; right: 30px; width: 62px; height: 62px; border-radius: 50%; background: #00ffaa; border: 3px solid #fff; color: #000; font-weight: 900; display: flex; align-items: center; justify-content: center; pointer-events: auto; font-family: 'Rajdhani', sans-serif;">JUMP</div>
            <div id="btn-fire" style="position: absolute; bottom: 35px; right: 30px; width: 75px; height: 75px; border-radius: 50%; background: #ff0055; border: 3px solid #fff; color: #fff; font-weight: 900; display: flex; align-items: center; justify-content: center; pointer-events: auto; font-family: 'Rajdhani', sans-serif;">FIRE</div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', hudHtml);
    }

    function updateHUD() {
        const stageEl = document.getElementById('ui-stage');
        const scoreEl = document.getElementById('ui-score');
        const playerHpEl = document.getElementById('ui-player-hp');
        const bossHpEl = document.getElementById('ui-boss-hp');

        if (stageEl && currentBoss) {
            const stageTitles = ["STAGE 1: CASTLE COURTYARD", "STAGE 2: DESERT WASTELAND", "STAGE 3: JUNGLE CLEARING"];
            stageEl.innerText = `${stageTitles[gameState.currentStage]} — ${currentBoss.name}`;
        }
        if (scoreEl) scoreEl.innerText = `DEFEATED: ${gameState.bossesDefeated}`;
        if (playerHpEl) playerHpEl.style.width = Math.max(0, (gameState.playerHp / gameState.playerMaxHp) * 100) + '%';
        if (bossHpEl && currentBoss) bossHpEl.style.width = Math.max(0, (gameState.bossHp / gameState.bossMaxHp) * 100) + '%';
    }

    // ========================================================================
    // 9. GAME ENGINE RUNTIME & MAIN LOOP
    // ========================================================================
    const mainScene = createMainScene();
    setupControls();

    engine.runRenderLoop(() => {
        const dt = engine.getDeltaTime() / 1000;

        if (player && !gameState.isGameOver) {
            // --- 1. PLAYER MOVEMENT & ANIMATION ---
            const moveMag = Math.hypot(inputState.forward, inputState.right);

            if (moveMag > 0.05) {
                // Compute movement relative to current camera yaw angle
                const camForward = camera.getForwardRay().direction;
                camForward.y = 0;
                camForward.normalize();

                const camRight = new BABYLON.Vector3(camForward.z, 0, -camForward.x);

                const moveDir = camForward.scale(inputState.forward).add(camRight.scale(inputState.right));
                moveDir.normalize();

                const nextX = player.position.x + moveDir.x * player.speed * dt;
                const nextZ = player.position.z + moveDir.z * player.speed * dt;

                // Check Desert Bone Obstacles (Player jumps over them if Y > clearHeight)
                let blocked = false;
                for (let bone of boneObstacles) {
                    if (Math.hypot(nextX - bone.x, nextZ - bone.z) < player.radius + bone.radius) {
                        if (player.position.y < bone.jumpClearHeight) {
                            blocked = true;
                            break;
                        }
                    }
                }

                if (!blocked) {
                    player.position.x = nextX;
                    player.position.z = nextZ;
                }

                // Face moving direction
                player.rotationY = Math.atan2(moveDir.x, moveDir.z);

                // Walking Rig Animation
                player.animTimer += dt * 12;
                player.rightLegPivot.rotation.x = Math.sin(player.animTimer) * 0.6;
                player.leftLegPivot.rotation.x = -Math.sin(player.animTimer) * 0.6;
                player.leftArmPivot.rotation.x = Math.sin(player.animTimer) * 0.45;
            } else {
                // Idle Pose
                player.rightLegPivot.rotation.x *= 0.8;
                player.leftLegPivot.rotation.x *= 0.8;
                player.leftArmPivot.rotation.x *= 0.8;
            }

            // Constrain arena borders
            player.position.x = Math.max(-ARENA_W / 2 + 2, Math.min(ARENA_W / 2 - 2, player.position.x));
            player.position.z = Math.max(-ARENA_L / 2 + 2, Math.min(ARENA_L / 2 - 2, player.position.z));

            // Gravity & Vertical Physics
            player.position.y += player.vy * dt;
            if (player.position.y > 0) {
                player.vy -= 30 * dt;
            } else {
                player.position.y = 0;
                player.vy = 0;
                player.isGrounded = true;
            }

            player.root.rotation.y = player.rotationY;

            // Camera Follows Player
            camera.target.copyFrom(player.position).addInPlace(new BABYLON.Vector3(0, 1.8, 0));

            // Weapon Firing & Recoil
            player.shootCooldown -= dt;
            if (inputState.shooting && player.shootCooldown <= 0) {
                const spawnPos = player.position.clone().add(new BABYLON.Vector3(Math.sin(player.rotationY) * 1.5, 2.0, Math.cos(player.rotationY) * 1.5));
                shootBullet(spawnPos, player.rotationY, true, new BABYLON.Color3(0, 0.9, 1.0), 55);
                player.shootCooldown = 0.16;
                player.shootRecoil = 0.35;
            }

            // Recoil animation interpolation
            if (player.shootRecoil > 0) {
                player.rightArmPivot.rotation.x = -player.shootRecoil;
                player.shootRecoil -= dt * 2.2;
            } else {
                player.rightArmPivot.rotation.x = 0;
            }

            // --- 2. BOSS AI & ATTACK PATTERNS ---
            if (currentBoss && !gameState.isTransitioning) {
                const toPlayer = player.position.subtract(currentBoss.root.position);
                toPlayer.y = 0;
                const distToPlayer = toPlayer.length();
                toPlayer.normalize();

                const targetAngle = Math.atan2(toPlayer.x, toPlayer.z);
                currentBoss.root.rotation.y = targetAngle;

                currentBoss.attackTimer -= dt;

                // Move boss
                if (distToPlayer > 12) {
                    currentBoss.root.position.x += toPlayer.x * currentBoss.speed * dt;
                    currentBoss.root.position.z += toPlayer.z * currentBoss.speed * dt;
                }

                // Stage Attack Varieties
                if (currentBoss.attackTimer <= 0) {
                    if (currentBoss.type === 0) {
                        // Castle Guardian: Spread mortar salvo
                        for (let s = -0.3; s <= 0.3; s += 0.3) {
                            const spawnPos = currentBoss.root.position.clone().add(new BABYLON.Vector3(0, 3.5, 0));
                            shootBullet(spawnPos, targetAngle, false, new BABYLON.Color3(1.0, 0.2, 0.1), 32, s);
                        }
                        currentBoss.attackTimer = 1.3;
                    } else if (currentBoss.type === 1) {
                        // Dune Colossus: Rapid sand needle burst
                        const spawnPos = currentBoss.root.position.clone().add(new BABYLON.Vector3(0, 2.8, 0));
                        shootBullet(spawnPos, targetAngle, false, new BABYLON.Color3(1.0, 0.6, 0.0), 42, (Math.random() - 0.5) * 0.18);
                        currentBoss.attackTimer = 0.42;
                    } else {
                        // Jungle Predator: 360 degree floral nova
                        const spawnPos = currentBoss.root.position.clone().add(new BABYLON.Vector3(0, 3.0, 0));
                        for (let a = 0; a < 10; a++) {
                            shootBullet(spawnPos, (a / 10) * Math.PI * 2, false, new BABYLON.Color3(0.2, 0.9, 0.3), 26);
                        }
                        currentBoss.attackTimer = 2.0;
                    }
                }
            }

            // --- 3. PROJECTILE SIMULATION & DAMAGE ---
            for (let i = projectiles.length - 1; i >= 0; i--) {
                const p = projectiles[i];
                p.mesh.position.x += p.vx * dt;
                p.mesh.position.z += p.vz * dt;
                p.life -= dt;

                // Out of arena or expired
                if (Math.abs(p.mesh.position.x) > ARENA_W / 2 || Math.abs(p.mesh.position.z) > ARENA_L / 2 || p.life <= 0) {
                    p.mesh.dispose();
                    projectiles.splice(i, 1);
                    continue;
                }

                // Desert Stage: Bone obstacles block boss bullets
                if (!p.isPlayer) {
                    let hitBone = false;
                    for (let bone of boneObstacles) {
                        if (Math.hypot(p.mesh.position.x - bone.x, p.mesh.position.z - bone.z) < bone.radius) {
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

                // Player projectile hits Boss
                if (p.isPlayer && currentBoss) {
                    const distToBoss = Math.hypot(p.mesh.position.x - currentBoss.root.position.x, p.mesh.position.z - currentBoss.root.position.z);
                    if (distToBoss < currentBoss.radius) {
                        gameState.bossHp -= 12;
                        playSfx('hit');
                        p.mesh.dispose();
                        projectiles.splice(i, 1);

                        if (gameState.bossHp <= 0) {
                            triggerStageAdvance();
                        }
                        updateHUD();
                        continue;
                    }
                }

                // Boss projectile hits Player
                if (!p.isPlayer) {
                    const distToPlayer = Math.hypot(p.mesh.position.x - player.position.x, p.mesh.position.z - player.position.z);
                    if (distToPlayer < player.radius) {
                        gameState.playerHp -= 14;
                        playSfx('hit');
                        p.mesh.dispose();
                        projectiles.splice(i, 1);

                        if (gameState.playerHp <= 0) {
                            // Instant restart on defeat
                            gameState.playerHp = gameState.playerMaxHp;
                            gameState.bossesDefeated = 0;
                            loadStage(0);
                            player.position.set(0, 0, 22);
                        }
                        updateHUD();
                        continue;
                    }
                }
            }
        }

        mainScene.render();
    });

    // Handle Responsive Window Resizing
    window.addEventListener('resize', () => {
        engine.resize();
    });
});