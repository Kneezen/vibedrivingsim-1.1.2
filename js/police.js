/**
 * police.js — Police car chase system.
 * A police car spawns after the player crushes 10 pedestrians in a level.
 * The police car is fast but has very poor handling (hard to take turns).
 * On level completion the police car vanishes and the crush counter resets.
 *
 * Dependencies: window.CONFIG, window.SCENE, window.CAR_MODELS, window.CITY
 * Exports:      window.POLICE
 */

window.POLICE = {

  // ── State ───────────────────────────────────────────
  crushCount: 0,
  isActive: false,
  policeCars: [],        // Array of police car state objects
  sirenTime: 0,
  sirenHigh: false,

  // Audio
  _audioCtx: null,
  _sirenOsc: null,
  _sirenGain: null,
  _sirenStarted: false,

  // ────────────────────────────────────────────────────
  //  Pedestrian crush callback
  // ────────────────────────────────────────────────────

  onPedestrianCrushed() {
    this.crushCount++;
    const threshold = CONFIG.POLICE.CRUSH_THRESHOLD || 5;

    // Update HUD
    if (window.UI && UI.updateCrushCounter) {
      UI.updateCrushCounter(this.crushCount, threshold);
    }

    // Spawn a new car every `threshold` kills
    if (this.crushCount > 0 && this.crushCount % threshold === 0) {
      this.spawnPoliceCar();
    }
  },

  // ────────────────────────────────────────────────────
  //  Spawn the police car
  // ────────────────────────────────────────────────────

  spawnPoliceCar() {
    this.isActive = true;

    const P = CONFIG.POLICE;

    // Build the police car mesh
    const policeConfig = {
      id: 'police',
      name: 'Police',
      color: P.COLOR,
      bodyColor: P.COLOR,
      trimColor: P.TRIM_COLOR,
      maxSpeed: P.SPEED,
      acceleration: P.ACCELERATION,
      handling: P.HANDLING,
      description: 'Police cruiser',
      emoji: '🚔'
    };

    const mesh = CAR_MODELS.buildCar(policeConfig);

    // ── Add siren light bar on roof ─────────────────
    const barGeo = new THREE.BoxGeometry(2.4, 0.3, 0.8);
    const barMat = new THREE.MeshPhongMaterial({ color: 0x222222, shininess: 80 });
    const bar = new THREE.Mesh(barGeo, barMat);
    bar.position.set(0, 3.0, 2.8);
    bar.castShadow = true;
    mesh.add(bar);

    // Red light (left)
    const redLightGeo = new THREE.BoxGeometry(0.5, 0.25, 0.5);
    const redLightMat = new THREE.MeshPhongMaterial({
      color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 1.0
    });
    const redLightMesh = new THREE.Mesh(redLightGeo, redLightMat);
    redLightMesh.position.set(-0.7, 3.2, 2.8);
    mesh.add(redLightMesh);

    // Blue light (right)
    const blueLightGeo = new THREE.BoxGeometry(0.5, 0.25, 0.5);
    const blueLightMat = new THREE.MeshPhongMaterial({
      color: 0x0044ff, emissive: 0x0044ff, emissiveIntensity: 1.0
    });
    const blueLightMesh = new THREE.Mesh(blueLightGeo, blueLightMat);
    blueLightMesh.position.set(0.7, 3.2, 2.8);
    mesh.add(blueLightMesh);

    // Dynamic point lights for siren glow
    const lightRed = new THREE.PointLight(0xff0000, 2, 25);
    lightRed.position.set(-0.7, 3.5, 2.8);
    mesh.add(lightRed);

    const lightBlue = new THREE.PointLight(0x0044ff, 0, 25);
    lightBlue.position.set(0.7, 3.5, 2.8);
    mesh.add(lightBlue);

    // ── Find spawn position on a road, away from player ──
    const playerCar = window.GAME && GAME.activeCar;
    const px = playerCar ? playerCar.position.x : 0;
    const pz = playerCar ? playerCar.position.z : 0;
    let spawnX = px + 25, spawnZ = pz + 25; // fallback
    const roads = CITY.roadNetwork;

    if (roads && roads.length > 0) {
      let bestScore = Infinity;
      // Try random road positions, pick the one whose distance is closest to SPAWN_DISTANCE
      for (let attempt = 0; attempt < 100; attempt++) {
        const road = roads[Math.floor(Math.random() * roads.length)];
        const rx = road.x + Math.random() * road.w;
        const rz = road.z + Math.random() * road.h;
        const dist = Math.sqrt((rx - px) ** 2 + (rz - pz) ** 2);
        
        // We want it to be as close to SPAWN_DISTANCE as possible
        const score = Math.abs(dist - P.SPAWN_DISTANCE);
        if (score < bestScore) {
          bestScore = score;
          spawnX = rx;
          spawnZ = rz;
        }
      }
    }

    // Hard clamp spawn to map bounds to ensure it never spawns outside
    spawnX = Math.max(-240, Math.min(240, spawnX));
    spawnZ = Math.max(-240, Math.min(240, spawnZ));

    mesh.position.set(spawnX, 0.65, spawnZ);
    SCENE.scene.add(mesh);

    this.policeCars.push({
      mesh: mesh,
      x: spawnX,
      z: spawnZ,
      heading: Math.atan2(px - spawnX, pz - spawnZ),
      speed: 0,
      lateralVel: 0,
      steerInput: 0,
      stuckTimer: 0,
      stuckCount: 0,
      lastX: spawnX,
      lastZ: spawnZ,
      avoidDir: 0,
      avoidTimer: 0,
      lightRed: lightRed,
      lightBlue: lightBlue,
      redMat: redLightMat,
      blueMat: blueLightMat,
      // Health & damage VFX
      health: 100,
      maxHealth: 100,
      oilSpinTimer: 0,
      smokeParticles: [],
      fireParticles: []
    });

    if (!this._sirenStarted) {
      this.sirenTime = 0;
      this.sirenHigh = false;
      this._startSiren();
    }

    // Notification
    if (window.UI) {
      UI.showNotification(`🚨 ${this.policeCars.length} POLICE ON YOUR TAIL! 🚨`, 4000);
    }
  },

  // ────────────────────────────────────────────────────
  //  Per-frame update — AI chase + physics
  // ────────────────────────────────────────────────────

  update(delta, playerCar) {
    if (!this.isActive || this.policeCars.length === 0 || !playerCar) return;

    const P = CONFIG.POLICE;
    const dt = delta * 60;

    // ── Target: player position ──────────────────────
    const targetX = playerCar.position.x + Math.sin(playerCar.heading) * 2.5;
    const targetZ = playerCar.position.z + Math.cos(playerCar.heading) * 2.5;

    for (let i = 0; i < this.policeCars.length; i++) {
      const pc = this.policeCars[i];

      // ── Stuck detection (check every 2 seconds) ──────
      pc.stuckTimer += delta;
      if (pc.stuckTimer >= 2.0) {
        const dMoved = Math.sqrt((pc.x - pc.lastX) ** 2 + (pc.z - pc.lastZ) ** 2);
        if (dMoved < 3.0) {
          pc.stuckCount = (pc.stuckCount || 0) + 1;
        } else {
          pc.stuckCount = 0;
        }
        pc.lastX = pc.x;
        pc.lastZ = pc.z;
        pc.stuckTimer = 0;

        // If stuck for 3 consecutive checks (6 seconds), respawn
        if (pc.stuckCount >= 3) {
          this._respawnOnRoad(pc, targetX, targetZ);
          pc.stuckCount = 0;
          continue;
        }
      }

      // ── Avoidance timer ──────────────────────────────
      if (pc.avoidTimer > 0) {
        pc.avoidTimer -= delta;
      }

      // ── Oil spin-out ──────────────────────────────────
      if (pc.oilSpinTimer > 0) {
        pc.oilSpinTimer -= delta;
        // Override steering with wild spinning
        pc.heading += delta * 8 * (pc.oilSpinTimer > 2 ? 1 : -1);
        pc.speed *= 0.95;
        pc.lateralVel = Math.sin(pc.oilSpinTimer * 5) * 0.3;
        // Skip normal AI steering while spinning
        pc.steerInput = 0;
      }

      // ── Direct Pursuit AI ──────────────────────────────
      // Always aim directly at the player for relentless pursuit
      const dx = targetX - pc.x;
      const dz = targetZ - pc.z;
      const desiredHeading = Math.atan2(-dx, -dz);

      let angleDiff = desiredHeading - pc.heading;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      // Steering target: avoid buildings or follow navigation
      let effectiveSteerTarget;
      if (pc.avoidTimer > 0) {
        effectiveSteerTarget = pc.avoidDir;
      } else {
        effectiveSteerTarget = Math.max(-1, Math.min(1, -angleDiff * 2));
      }

      const steerResponse = 0.12 * dt;
      pc.steerInput += (effectiveSteerTarget - pc.steerInput) * steerResponse;
      pc.steerInput = Math.max(-1, Math.min(1, pc.steerInput));

      // ── Physics ──────────────────────────────────────
      const phys = CONFIG.PHYSICS;
      const maxSpeed = phys.MAX_SPEED * P.SPEED;
      const accel = phys.ACCELERATION * P.ACCELERATION;
      const absSpeed = Math.abs(pc.speed);
      const speedRatio = absSpeed / maxSpeed;

      // Always accelerate forward
      if (pc.speed < 0) {
        pc.speed += accel * 2 * dt;
      } else {
        const torqueMult = 1.0 - speedRatio * 0.55;
        pc.speed += accel * torqueMult * dt;
        if (pc.speed > maxSpeed) pc.speed = maxSpeed;
      }

      // AI uses full steering authority (0.9) — "poor handling" comes from loose grip below
      const aiSteerAuthority = 0.9;
      const maxWheelAngle = 0.45 * (1.0 - speedRatio * phys.TURN_REDUCTION_AT_SPEED);
      const steerAngle = pc.steerInput * maxWheelAngle * aiSteerAuthority;

      // ── Movement ─────────────────────────────────────
      const oldX = pc.x;
      const oldZ = pc.z;
      const oldHeading = pc.heading;

      if (absSpeed > 0.008) {
        const L = 5.0;
        const distance = pc.speed * dt;
        const wheelHeading = pc.heading - steerAngle;

        let newX = pc.x - Math.sin(wheelHeading) * distance;
        let newZ = pc.z - Math.cos(wheelHeading) * distance;

        pc.heading -= (distance / L) * Math.sin(steerAngle);

        // Loose lateral grip = car drifts wide on turns (this is the "poor handling")
        const lateralForce = -steerAngle * pc.speed * 0.025 * dt;
        pc.lateralVel += lateralForce;
        // Very low grip damping — car slides a lot
        pc.lateralVel *= (1 - P.HANDLING * 0.12 * dt);

        newX += Math.cos(pc.heading) * pc.lateralVel * dt;
        newZ -= Math.sin(pc.heading) * pc.lateralVel * dt;

        // ── Collision detection ────────────────────────
        const centerX = newX + Math.sin(pc.heading) * 2.5;
        const centerZ = newZ + Math.cos(pc.heading) * 2.5;
        let collided = false;
        let hitBuilding = null;

        const bound = 245;
        if (centerX > bound || centerX < -bound || centerZ > bound || centerZ < -bound) {
          collided = true;
        }

        if (!collided && window.CITY && CITY.buildings) {
          const carHW = 2.2;
          const carHD = 4.2;
          for (const b of CITY.buildings) {
            const bHW = b.width / 2 + carHW;
            const bHD = b.depth / 2 + carHD;
            if (centerX > b.x - bHW && centerX < b.x + bHW &&
                centerZ > b.z - bHD && centerZ < b.z + bHD) {
              collided = true;
              hitBuilding = b;
              break;
            }
          }
        }

        if (collided) {
          // Revert position and stop
          pc.x = oldX;
          pc.z = oldZ;
          pc.heading = oldHeading;
          pc.speed *= 0.1;
          pc.lateralVel = 0;
          
          // On collision: steer away from building/boundary
          if (hitBuilding) {
            // Nudge backwards to clear building collision box
            pc.x -= Math.sin(pc.heading) * 0.3;
            pc.z -= Math.cos(pc.heading) * 0.3;

            const toBX = hitBuilding.x - pc.x;
            const toBZ = hitBuilding.z - pc.z;
            const bAngle = Math.atan2(-toBX, -toBZ);
            let avAngle = bAngle - pc.heading;
            while (avAngle > Math.PI) avAngle -= Math.PI * 2;
            while (avAngle < -Math.PI) avAngle += Math.PI * 2;
            
            pc.avoidDir = avAngle > 0 ? 1 : -1;
            pc.avoidTimer = 1.2;
          } else {
            // Boundary collision: Nudge towards the center of the map
            pc.x -= Math.sign(pc.x) * 0.5;
            pc.z -= Math.sign(pc.z) * 0.5;

            pc.avoidDir = angleDiff > 0 ? -1 : 1;
            pc.avoidTimer = 1.0;
          }
        } else {
          pc.x = newX;
          pc.z = newZ;
        }
      }

      if (Math.abs(pc.lateralVel) < 0.0005) pc.lateralVel = 0;

      // Hard clamp to map bounds to ensure the car physically cannot leave the map
      pc.x = Math.max(-245, Math.min(245, pc.x));
      pc.z = Math.max(-245, Math.min(245, pc.z));

      // Sync mesh
      pc.mesh.position.set(pc.x, 0.65, pc.z);
      pc.mesh.rotation.set(0, pc.heading, 0);

      // Wheel animation
      CAR_MODELS.updateWheels(pc.mesh, pc.speed, steerAngle, delta);

      // Update per-car lights
      if (pc.lightRed && pc.lightBlue) {
        pc.lightRed.intensity = this.sirenHigh ? 3 : 0.3;
        pc.lightBlue.intensity = this.sirenHigh ? 0.3 : 3;
      }
      if (pc.redMat && pc.blueMat) {
        pc.redMat.emissiveIntensity = this.sirenHigh ? 1.5 : 0.2;
        pc.blueMat.emissiveIntensity = this.sirenHigh ? 0.2 : 1.5;
      }

      // ── Damage VFX ────────────────────────────────────
      this._updateDamageVFX(pc, delta);

      // ── Catch check ──────────────────────────────────
      const catchDx = pc.x - targetX;
      const catchDz = pc.z - targetZ;
      const catchDist = Math.sqrt(catchDx * catchDx + catchDz * catchDz);

      if (catchDist < P.CATCH_RADIUS) {
        this._onPlayerCaught();
      }
    } // end for loop

    // ── Global Siren update ─────────────────────────
    this.sirenTime += delta;
    if (this.sirenTime >= P.SIREN_INTERVAL) {
      this.sirenTime -= P.SIREN_INTERVAL;
      this.sirenHigh = !this.sirenHigh;
    }


    this._updateSiren();

  },

  // ────────────────────────────────────────────────────
  //  Damage & destruction
  // ────────────────────────────────────────────────────

  takeDamage(carIndex, amount) {
    if (carIndex < 0 || carIndex >= this.policeCars.length) return;
    const pc = this.policeCars[carIndex];
    pc.health -= amount;
    if (pc.health < 0) pc.health = 0;

    // Spawn smoke at < 50 HP (if not already)
    if (pc.health < 50 && pc.smokeParticles.length === 0) {
      this._addSmokeVFX(pc);
    }
    // Spawn fire at < 25 HP (if not already)
    if (pc.health < 25 && pc.fireParticles.length === 0) {
      this._addFireVFX(pc);
    }

    // Destroyed
    if (pc.health <= 0) {
      this._explodePoliceCar(carIndex);
    }
  },

  applyOilSlick(carIndex, duration) {
    if (carIndex < 0 || carIndex >= this.policeCars.length) return;
    const pc = this.policeCars[carIndex];
    pc.oilSpinTimer = duration;
    pc.speed *= 0.3;
  },

  _addSmokeVFX(pc) {
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.SpriteMaterial({
        color: 0x444444, transparent: true, opacity: 0.5
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(1.5, 1.5, 1);
      sprite.position.set(
        (Math.random() - 0.5) * 2,
        3 + Math.random(),
        (Math.random() - 0.5) * 2
      );
      pc.mesh.add(sprite);
      pc.smokeParticles.push({ sprite, phase: Math.random() * Math.PI * 2 });
    }
  },

  _addFireVFX(pc) {
    const colors = [0xff4400, 0xff6600, 0xff8800];
    for (let i = 0; i < 2; i++) {
      const mat = new THREE.SpriteMaterial({
        color: colors[i % colors.length], transparent: true, opacity: 0.6,
        blending: THREE.AdditiveBlending
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(1.2, 1.2, 1);
      sprite.position.set(
        (Math.random() - 0.5) * 1.5,
        2.5 + Math.random() * 0.5,
        (Math.random() - 0.5) * 1.5
      );
      pc.mesh.add(sprite);
      pc.fireParticles.push({ sprite, phase: Math.random() * Math.PI * 2 });
    }
  },

  _updateDamageVFX(pc, delta) {
    const time = Date.now() * 0.003;

    // Animate smoke — bob and flicker
    for (const s of pc.smokeParticles) {
      s.sprite.position.y = 3 + Math.sin(time + s.phase) * 0.5;
      s.sprite.material.opacity = 0.3 + Math.sin(time * 2 + s.phase) * 0.15;
      const sc = 1.2 + Math.sin(time + s.phase) * 0.3;
      s.sprite.scale.set(sc, sc, 1);
    }

    // Animate fire — flicker
    for (const f of pc.fireParticles) {
      f.sprite.position.y = 2.5 + Math.sin(time * 3 + f.phase) * 0.3;
      f.sprite.material.opacity = 0.4 + Math.sin(time * 4 + f.phase) * 0.2;
      const sc = 0.8 + Math.sin(time * 3 + f.phase) * 0.4;
      f.sprite.scale.set(sc, sc, 1);
    }
  },

  _explodePoliceCar(carIndex) {
    if (carIndex < 0 || carIndex >= this.policeCars.length) return;
    const pc = this.policeCars[carIndex];

    // Explosion VFX (lightweight)
    const sharedGeo = new THREE.BoxGeometry(1, 1, 1);
    const debrisMat = new THREE.MeshLambertMaterial({ color: 0x1144cc, transparent: true });
    const fireMat = new THREE.MeshLambertMaterial({ color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 0.8, transparent: true });

    for (let i = 0; i < 10; i++) {
      const size = 0.3 + Math.random() * 0.6;
      const mesh = new THREE.Mesh(sharedGeo, Math.random() > 0.5 ? debrisMat : fireMat);
      mesh.scale.set(size, size, size);
      mesh.position.set(pc.x, 1.5, pc.z);
      mesh.castShadow = false;
      SCENE.scene.add(mesh);

      const vel = {
        x: (Math.random() - 0.5) * 0.5,
        y: 0.2 + Math.random() * 0.3,
        z: (Math.random() - 0.5) * 0.5
      };

      // Self-cleaning debris
      const startTime = Date.now();
      const animate = () => {
        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed > 3) {
          SCENE.scene.remove(mesh);
          return;
        }
        vel.y -= 0.015;
        mesh.position.x += vel.x;
        mesh.position.y += vel.y;
        mesh.position.z += vel.z;
        mesh.rotation.x += 0.1;
        mesh.rotation.y += 0.05;
        if (mesh.position.y < 0.2) {
          mesh.position.y = 0.2;
          vel.y = 0;
          vel.x *= 0.9;
          vel.z *= 0.9;
        }
        if (elapsed > 2) mesh.material.opacity = 1 - (elapsed - 2);
        requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }

    // Screen shake
    if (window.CAMERA_SYSTEM && CAMERA_SYSTEM.shake) {
      CAMERA_SYSTEM.shake(0.4, 0.5);
    }

    // Remove police car mesh from scene
    SCENE.scene.remove(pc.mesh);
    pc.mesh.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });

    // Remove from array
    this.policeCars.splice(carIndex, 1);

    // If all police destroyed
    if (this.policeCars.length === 0) {
      this.isActive = false;
      this._stopSiren();
    }

    if (window.UI) {
      UI.showNotification('🔥 POLICE DESTROYED!', 3000);
    }
  },

  // ────────────────────────────────────────────────────
  //  Respawn on a nearby road when stuck
  // ────────────────────────────────────────────────────

  _respawnOnRoad(pc, playerX, playerZ) {
    if (!pc) return;

    const roads = CITY.roadNetwork;
    if (!roads || roads.length === 0) return;

    // Find a road position 40-80 units from player
    let bestX = pc.x, bestZ = pc.z, bestScore = Infinity;
    for (let i = 0; i < 50; i++) {
      const road = roads[Math.floor(Math.random() * roads.length)];
      const rx = road.x + Math.random() * road.w;
      const rz = road.z + Math.random() * road.h;
      const dist = Math.sqrt((rx - playerX) ** 2 + (rz - playerZ) ** 2);
      const score = Math.abs(dist - 60);
      if (score < bestScore) {
        bestScore = score;
        bestX = rx;
        bestZ = rz;
      }
    }

    pc.x = Math.max(-240, Math.min(240, bestX));
    pc.z = Math.max(-240, Math.min(240, bestZ));
    pc.heading = Math.atan2(playerX - pc.x, playerZ - pc.z);
    pc.speed = 0;
    pc.lateralVel = 0;
    pc.steerInput = 0;
    pc.avoidTimer = 0;
    pc.lastX = bestX;
    pc.lastZ = bestZ;
  },

  // ────────────────────────────────────────────────────
  //  Player caught — game over
  // ────────────────────────────────────────────────────

  _onPlayerCaught() {
    if (!window.GAME || GAME.gameOver) return;

    GAME.gameOver = true;
    GAME.activeCar.explode();

    UI.showNotification('🚔 BUSTED! 🚔', 3000);

    // Show game over after dramatic pause
    GAME.gameOverTimeout = setTimeout(() => {
      const coinState = COINS.getState();
      const levelReached = CONFIG.LEVELS[GAME.currentLevel].level;
      UI.showGameOver(levelReached, coinState.collected, coinState.total);
      GAME.gameOverShown = true;
    }, 2000);
  },

  // ────────────────────────────────────────────────────
  //  Siren sound (Web Audio API)
  // ────────────────────────────────────────────────────

  _startSiren() {
    try {
      if (!this._audioCtx) {
        this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = this._audioCtx;

      // Resume if suspended
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const sfxVol = window.SETTINGS ? window.SETTINGS.sfxVolume : 0.8;

      this._sirenGain = ctx.createGain();
      this._sirenGain.gain.value = 0.15 * sfxVol;
      this._sirenGain.connect(ctx.destination);

      this._sirenOsc = ctx.createOscillator();
      this._sirenOsc.type = 'sawtooth';
      this._sirenOsc.frequency.value = 600;
      this._sirenOsc.connect(this._sirenGain);
      this._sirenOsc.start();

      this._sirenStarted = true;
    } catch (e) {
      console.warn('Police siren failed:', e);
    }
  },

  _updateSiren() {
    if (!this._sirenStarted || !this._sirenOsc) return;

    // Alternate between high and low tones
    const targetFreq = this.sirenHigh ? 800 : 600;
    const currentFreq = this._sirenOsc.frequency.value;
    this._sirenOsc.frequency.value = currentFreq + (targetFreq - currentFreq) * 0.1;

    // Update volume based on SFX setting
    if (this._sirenGain) {
      const sfxVol = window.SETTINGS ? window.SETTINGS.sfxVolume : 0.8;
      this._sirenGain.gain.value = 0.15 * sfxVol;
    }
  },

  _stopSiren() {
    if (this._sirenOsc) {
      try { this._sirenOsc.stop(); } catch (_) {}
      this._sirenOsc = null;
    }
    if (this._sirenGain) {
      this._sirenGain.disconnect();
      this._sirenGain = null;
    }
    this._sirenStarted = false;
  },

  // ────────────────────────────────────────────────────
  //  Reset — called on level complete / retry / menu
  // ────────────────────────────────────────────────────

  reset() {
    // Remove police car meshes
    if (this.policeCars && this.policeCars.length > 0) {
      for (const pc of this.policeCars) {
        if (pc.mesh) {
          SCENE.scene.remove(pc.mesh);
          pc.mesh.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
          });
        }
      }
    }

    this.policeCars = [];
    this.isActive = false;
    this.crushCount = 0;
    this.sirenTime = 0;
    this.sirenHigh = false;

    this._stopSiren();

    // Update HUD
    if (window.UI && UI.updateCrushCounter) {
      UI.updateCrushCounter(0, CONFIG.POLICE.CRUSH_THRESHOLD);
    }
  },

  // ────────────────────────────────────────────────────
  //  Query (for minimap)
  // ────────────────────────────────────────────────────

  getPositions() {
    if (!this.isActive || this.policeCars.length === 0) return [];
    return this.policeCars.map(pc => ({ x: pc.x, z: pc.z }));
  }
};
