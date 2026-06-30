/**
 * car.js — Car entity with semi-realistic arcade physics.
 *
 * Physics model:
 *  • Longitudinal: torque-curve acceleration, aerodynamic + rolling drag,
 *    progressive braking with weight transfer feel.
 *  • Lateral: slip-angle based grip, understeer at high speed,
 *    smooth steering input with progressive buildup.
 *  • Visual: body pitch under accel/braking, body roll in turns.
 *
 * Dependencies: window.CONFIG, window.CONTROLS, window.CAR_MODELS, window.SCENE
 * Exports:      window.CAR  ({ CarEntity })
 */

class CarEntity {

  constructor(carConfig) {
    this.config = carConfig;
    this.mesh   = CAR_MODELS.buildCar(carConfig);

    // ── Kinematic state ──────────────────────────────
    this.speed       = 0;          // forward velocity (units/frame-tick)
    this.lateralVel  = 0;          // sideways slide velocity
    this.steerInput  = 0;          // raw input (−1 to 1), smoothed
    this.steerAngle  = 0;          // actual wheel angle (radians)
    this.heading     = 0;          // yaw in radians (Y axis)
    this.position    = { x: 0, y: 0.65, z: 0 };
    this.isGrounded  = true;

    // ── Audio / FX ──────────────────────────────────────
    this.hornActive  = false;
    this.wasHornActive = false;
    this.hornAudio   = new Audio('sounds/horn.mp3');
    this.hornAudio.loop = true;
    this.hornAudio.volume = 1.0;

    // ── Engine sound (Web Audio API for pitch control) ──
    this.engineAudioCtx   = null;
    this.engineSource      = null;
    this.engineGain        = null;
    this.engineBuffer      = null;
    this.engineReady       = false;
    this.engineStarted     = false;
    this._initEngineSound();

    // ── Per-car physics (scaled by multipliers) ──────
    this.maxSpeed     = CONFIG.PHYSICS.MAX_SPEED     * (carConfig.maxSpeed     || 1);
    this.accelBase    = CONFIG.PHYSICS.ACCELERATION  * (carConfig.acceleration || 1);
    this.handling     = carConfig.handling || 1;

    // ── Drag coefficients ────────────────────────────
    this.dragCoeff    = 0.0008;    // aerodynamic drag  (∝ v²)
    this.rollResist   = 0.005;     // rolling resistance (∝ v)

    // ── Lateral grip ─────────────────────────────────
    this.gripBase     = 0.92;      // base lateral grip (0-1)
    this.gripFactor   = this.gripBase * this.handling;

    // ── Dashboard state ──────────────────────────────
    this.gear      = 'N';
    this.rpm       = 800;
    this.skidding  = false;
    this.slipAngle = 0;

    // ── Visual body dynamics ─────────────────────────
    this.bodyPitch = 0;            // nose up/down
    this.bodyRoll  = 0;            // lean in turns
    this.prevSpeed = 0;            // for computing acceleration delta

    // ── Explosion state ──────────────────────────────
    this.isExploded     = false;
    this.explosionParts = [];      // debris meshes
    this.fireParts      = [];      // fire sprite meshes
    this.fireLight      = null;
    this.explosionTime  = 0;
  }

  // ──────────────────────────────────────────────────
  //  Main update
  // ──────────────────────────────────────────────────

  update(delta, input) {
    // If car is exploded, only animate fire/debris
    if (this.isExploded) {
      this.updateExplosion(delta);
      return;
    }

    const dt   = delta * 60;       // normalise to ~60 fps
    const phys = CONFIG.PHYSICS;
    const absSpeed = Math.abs(this.speed);
    const speedRatio = absSpeed / this.maxSpeed;   // 0 … 1

    // ──────────────────────────────────────────────
    //  1. THROTTLE / BRAKING / COASTING
    // ──────────────────────────────────────────────

    if (input.brake) {
      // ── Handbrake ──────────────────────────────
      this.gear = 'N';
      const brakeForce = phys.BRAKING * 2.5 * dt;
      if (this.speed > 0.003) {
        this.speed -= brakeForce;
        if (this.speed < 0) this.speed = 0;
      } else if (this.speed < -0.003) {
        this.speed += brakeForce;
        if (this.speed > 0) this.speed = 0;
      } else {
        this.speed = 0;
      }
      // Handbrake kills lateral grip → more sliding
      this.lateralVel *= 0.92;

    } else if (input.forward) {
      // ── Accelerate ─────────────────────────────
      this.gear = 'D';
      // Torque curve: strong at low speed, tapering at top end
      const torqueMult = 1.0 - speedRatio * 0.55;
      this.speed += this.accelBase * torqueMult * dt;
      if (this.speed > this.maxSpeed) this.speed = this.maxSpeed;

    } else if (input.backward) {
      // ── Reverse / engine brake ─────────────────
      if (this.speed > 0.02) {
        // Still moving forward → progressive engine brake
        const engineBrake = phys.BRAKING * (1.5 + speedRatio) * dt;
        this.speed -= engineBrake;
        if (this.speed < 0) this.speed = 0;
      } else {
        this.gear = 'R';
        const revTorque = phys.ACCELERATION * 0.4 * dt;
        this.speed -= revTorque;
        if (this.speed < -phys.REVERSE_SPEED) {
          this.speed = -phys.REVERSE_SPEED;
        }
      }

    } else {
      // ── Coasting ───────────────────────────────
      // Aerodynamic drag (∝ v²) + rolling resistance (∝ v)
      if (absSpeed > 0.001) {
        const drag = (this.dragCoeff * this.speed * absSpeed +
                      this.rollResist * this.speed) * dt;
        this.speed -= drag;
        // Catch near-zero to avoid jitter
        if (Math.abs(this.speed) < 0.003) {
          this.speed = 0;
          this.gear = 'N';
        }
      } else {
        this.speed = 0;
        this.gear = 'N';
      }
    }

    // ──────────────────────────────────────────────
    //  2. STEERING (smooth input → wheel angle)
    // ──────────────────────────────────────────────

    // Target steer: −1 (left) … 0 … +1 (right)
    let targetSteer = 0;
    if (input.left)  targetSteer = -1;
    if (input.right) targetSteer =  1;

    // Smooth the raw input (simulates steering wheel inertia)
    const steerSmooth = 0.14 * dt;   // how fast input builds up
    const steerReturn = 0.15 * dt;   // how fast it centres

    if (targetSteer !== 0) {
      this.steerInput += (targetSteer - this.steerInput) * steerSmooth;
    } else {
      this.steerInput *= (1 - steerReturn);
      if (Math.abs(this.steerInput) < 0.01) this.steerInput = 0;
    }

    // Clamp raw input
    this.steerInput = Math.max(-1, Math.min(1, this.steerInput));

    // Convert input to actual wheel angle
    // Max angle reduces at high speed (understeer)
    const maxWheelAngle = 0.45 * (1.0 - speedRatio * phys.TURN_REDUCTION_AT_SPEED);
    this.steerAngle = this.steerInput * maxWheelAngle * this.handling;

    // ──────────────────────────────────────────────
    //  3. HEADING + LATERAL DYNAMICS
    // ──────────────────────────────────────────────

    const oldHeading = this.heading;
    let newX = this.position.x;
    let newZ = this.position.z;

    if (absSpeed > 0.008) {
      const L = 5.0; // Wheelbase
      const distance = this.speed * dt;

      // Arcade lateral dynamics (sliding) - centrifugal force pushes OUTSIDE
      // steerAngle < 0 means left turn, should push RIGHT (positive lateralVel)
      const lateralForce = -this.steerAngle * this.speed * 0.015 * dt;
      this.lateralVel += lateralForce;
      const gripDamp = this.gripFactor * (input.brake ? 0.6 : 1.0);
      this.lateralVel *= (1 - gripDamp * 0.15 * dt);

      this.slipAngle = Math.abs(this.steerAngle) * speedRatio * 1.5;

      // FWD Kinematic bicycle model (position = front axle)
      // The front wheels determine the movement direction
      const wheelHeading = this.heading - this.steerAngle;
      
      // 1. Move front axle in the direction the wheels are pointing
      newX = this.position.x - Math.sin(wheelHeading) * distance;
      newZ = this.position.z - Math.cos(wheelHeading) * distance;

      // 2. Update body heading (the rear of the car is dragged behind)
      this.heading -= (distance / L) * Math.sin(this.steerAngle);

    } else {
      this.slipAngle = 0;
      this.lateralVel *= 0.85;
    }

    // Dampen lateral velocity
    if (Math.abs(this.lateralVel) < 0.0005) this.lateralVel = 0;

    // ──────────────────────────────────────────────
    //  4. POSITION UPDATE
    // ──────────────────────────────────────────────

    // Apply lateral slide (drift) to new position
    newX += Math.cos(this.heading) * this.lateralVel * dt;
    newZ -= Math.sin(this.heading) * this.lateralVel * dt;

    // The physics tracks the front axle. Find the visual center for collisions.
    const centerX = newX + Math.sin(this.heading) * 2.5;
    const centerZ = newZ + Math.cos(this.heading) * 2.5;

    let collided = false;

    // Boundary clamp (X: ±245, Z: ±195 to match trimmed map)
    const boundX = 245;
    const boundZ = 195;
    if (centerX > boundX || centerX < -boundX || centerZ > boundZ || centerZ < -boundZ) {
      collided = true;
    }

    // ── Building collision ───────────────────────
    let hitBuilding = null;

    if (!collided && window.CITY && CITY.checkWallCollision) {
      hitBuilding = CITY.checkWallCollision(centerX, centerZ, 2.0); // building collision radius
      if (hitBuilding) {
        collided = true;
      }
    }

    if (collided) {
      newX = this.position.x;
      newZ = this.position.z;
      this.heading = oldHeading;
      this.speed *= -0.4;
      this.lateralVel *= 0.3;
      
      // Gentle nudge towards safety to help get unstuck
      if (Math.abs(this.speed) < 0.1) {
          if (hitBuilding) {
              // Nudge AWAY from the building's center
              newX += Math.sign(centerX - hitBuilding.x) * 0.1;
              newZ += Math.sign(centerZ - hitBuilding.z) * 0.1;
          } else {
              // Map boundary: Nudge towards map center
              newX -= Math.sign(newX) * 0.1;
              newZ -= Math.sign(newZ) * 0.1;
          }
      }
    }

    this.position.x = newX;
    this.position.z = newZ;
    this.position.y = window.CITY && CITY.getRoadHeight ? CITY.getRoadHeight(newX, newZ) : 0.65;

    // ──────────────────────────────────────────────
    //  5. VISUAL — BODY DYNAMICS
    // ──────────────────────────────────────────────

    // Acceleration delta for pitch
    const accelDelta = this.speed - this.prevSpeed;
    this.prevSpeed = this.speed;

    // Pitch: nose dips under braking, rises under accel
    const targetPitch = -accelDelta * 8;
    this.bodyPitch += (targetPitch - this.bodyPitch) * 0.12;
    this.bodyPitch = Math.max(-0.04, Math.min(0.04, this.bodyPitch));

    // Roll: lean into turns
    const targetRoll = -this.steerAngle * speedRatio * 0.5;
    this.bodyRoll += (targetRoll - this.bodyRoll) * 0.1;
    this.bodyRoll = Math.max(-0.06, Math.min(0.06, this.bodyRoll));

    // Sync mesh
    this.mesh.position.set(this.position.x, this.position.y, this.position.z);
    this.mesh.rotation.set(this.bodyPitch, this.heading, this.bodyRoll);

    // ── Wheel animation ──────────────────────────
    CAR_MODELS.updateWheels(this.mesh, this.speed, this.steerAngle, delta);

    // ── RPM simulation (engine sound feel) ───────
    // Idle 800 → redline 7800, with slight oscillation
    const rpmBase = speedRatio * 7000 + 800;
    const rpmNoise = Math.sin(Date.now() * 0.005) * 50;
    this.rpm = rpmBase + rpmNoise;

    // ── Skid detection ───────────────────────────
    this.skidding = (this.slipAngle > 0.25 && absSpeed > 0.2) ||
                    (input.brake && absSpeed > 0.15);

    // ── Horn ─────────────────────────────────────
    this.hornActive = !!input.horn;
    if (this.hornActive && !this.wasHornActive) {
      this.hornAudio.currentTime = 0;
      const sfxVol = window.SETTINGS ? window.SETTINGS.sfxVolume : 1.0;
      this.hornAudio.volume = 1.0 * sfxVol;
      this.hornAudio.play().catch(e => console.warn('Horn failed:', e));
    } else if (!this.hornActive && this.wasHornActive) {
      this.hornAudio.pause();
    }
    this.wasHornActive = this.hornActive;

    // ── Engine sound ─────────────────────────────
    this._updateEngineSound(speedRatio, input);
  }

  // ──────────────────────────────────────────────────
  //  Engine sound (Web Audio API)
  // ──────────────────────────────────────────────────

  _initEngineSound() {
    // Create audio context (may be suspended until user gesture)
    try {
      this.engineAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('Web Audio API not available:', e);
      return;
    }

    // Load the engine sound file into a buffer
    fetch('sounds/engine.mp3')
      .then(res => res.arrayBuffer())
      .then(buf => this.engineAudioCtx.decodeAudioData(buf))
      .then(decoded => {
        this.engineBuffer = decoded;
        this.engineReady = true;

        // Try to start immediately (will work if context is running)
        if (this.engineAudioCtx.state === 'running') {
          this._startEngineLoop();
        }
      })
      .catch(e => console.warn('Engine sound load failed:', e));

    // Resume audio context on first user interaction
    const resumeCtx = () => {
      if (this.engineAudioCtx && this.engineAudioCtx.state === 'suspended') {
        this.engineAudioCtx.resume().then(() => {
          if (this.engineReady && !this.engineStarted) {
            this._startEngineLoop();
          }
        });
      }
      document.removeEventListener('click', resumeCtx);
      document.removeEventListener('keydown', resumeCtx);
    };
    document.addEventListener('click', resumeCtx);
    document.addEventListener('keydown', resumeCtx);
  }

  _startEngineLoop() {
    if (!this.engineBuffer || !this.engineAudioCtx || this.engineStarted) return;

    // Gain node for volume control
    this.engineGain = this.engineAudioCtx.createGain();
    this.engineGain.gain.value = 0.15;   // idle volume
    this.engineGain.connect(this.engineAudioCtx.destination);

    // Source node — looping
    this.engineSource = this.engineAudioCtx.createBufferSource();
    this.engineSource.buffer = this.engineBuffer;
    this.engineSource.loop = true;
    this.engineSource.playbackRate.value = 0.6;  // idle pitch
    this.engineSource.connect(this.engineGain);
    this.engineSource.start(0);

    this.engineStarted = true;
  }

  _updateEngineSound(speedRatio, input) {
    if (!this.engineStarted || !this.engineSource || !this.engineGain) return;

    // Map RPM (800–7800) → playback rate (0.6–2.5)
    const rpmNorm = (this.rpm - 800) / 7000;  // 0…1
    const targetRate = 0.6 + rpmNorm * 1.9;

    // Smooth the playback rate to avoid pops
    const currentRate = this.engineSource.playbackRate.value;
    this.engineSource.playbackRate.value = currentRate + (targetRate - currentRate) * 0.08;

    // Volume: louder under throttle, quieter at idle
    let targetVol = 0.15 + rpmNorm * 0.45;    // 0.15 → 0.60
    if (input.forward)  targetVol += 0.1;       // throttle boost
    if (input.backward) targetVol += 0.05;      // reverse boost
    targetVol = Math.min(targetVol, 0.7);
    
    // Apply SFX Volume setting
    targetVol *= window.SETTINGS ? window.SETTINGS.sfxVolume : 0.8;

    const currentVol = this.engineGain.gain.value;
    this.engineGain.gain.value = currentVol + (targetVol - currentVol) * 0.06;
  }

  _stopEngineSound() {
    if (this.engineSource) {
      try { this.engineSource.stop(); } catch (_) {}
      this.engineSource = null;
    }
    if (this.engineGain) {
      this.engineGain.disconnect();
      this.engineGain = null;
    }
    if (this.engineAudioCtx) {
      this.engineAudioCtx.close().catch(() => {});
      this.engineAudioCtx = null;
    }
    this.engineStarted = false;
    this.engineReady   = false;
  }

  // ──────────────────────────────────────────────────
  //  Explosion & Fire VFX
  // ──────────────────────────────────────────────────

  explode() {
    if (this.isExploded) return;
    this.isExploded = true;
    this.speed = 0;
    this.lateralVel = 0;

    // Stop engine sound
    this._stopEngineSound();
    // Stop horn
    if (this.hornAudio) this.hornAudio.pause();

    const px = this.position.x;
    const py = this.position.y;
    const pz = this.position.z;

    // ── Debris particles (shared geo + materials to avoid alloc lag) ──
    const sharedGeo = new THREE.BoxGeometry(1, 1, 1); // unit cube, scaled per-instance
    const debrisMat = new THREE.MeshLambertMaterial({ color: 0x333333, transparent: true });
    const fireMat   = new THREE.MeshLambertMaterial({ color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 0.8, transparent: true });

    for (let i = 0; i < 15; i++) {
      const size = 0.3 + Math.random() * 0.8;
      const mat = Math.random() > 0.4 ? debrisMat : fireMat;
      const mesh = new THREE.Mesh(sharedGeo, mat);
      mesh.scale.set(size, size, size);
      mesh.position.set(px, py + 1, pz);
      mesh.castShadow = false;

      const vel = {
        x: (Math.random() - 0.5) * 0.6,
        y: 0.2 + Math.random() * 0.4,
        z: (Math.random() - 0.5) * 0.6
      };
      const rotVel = {
        x: (Math.random() - 0.5) * 0.2,
        y: (Math.random() - 0.5) * 0.2,
        z: (Math.random() - 0.5) * 0.2
      };

      SCENE.scene.add(mesh);
      this.explosionParts.push({ mesh, vel, rotVel, life: 3 + Math.random() * 2 });
    }

    // ── Fire sprites (shared materials per colour to reduce alloc) ────
    const fireColors = [0xff4400, 0xff6600, 0xff8800, 0xffaa00, 0xffcc00];
    const fireMatCache = fireColors.map(c => new THREE.SpriteMaterial({
      color: c, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending
    }));

    for (let i = 0; i < 10; i++) {
      const spriteMat = fireMatCache[i % fireMatCache.length];
      const sprite = new THREE.Sprite(spriteMat);
      const scale = 1.5 + Math.random() * 2;
      sprite.scale.set(scale, scale, 1);
      sprite.position.set(
        px + (Math.random() - 0.5) * 3,
        py + 1 + Math.random() * 2,
        pz + (Math.random() - 0.5) * 3
      );
      SCENE.scene.add(sprite);
      this.fireParts.push({
        sprite,
        baseY: sprite.position.y,
        phase: Math.random() * Math.PI * 2,
        speed: 1 + Math.random() * 2,
        baseScale: scale
      });
    }

    // ── Fire glow light ──────────────────────────────
    this.fireLight = new THREE.PointLight(0xff4400, 2, 30);
    this.fireLight.position.set(px, py + 3, pz);
    this.fireLight.castShadow = false;
    SCENE.scene.add(this.fireLight);

    this.explosionTime = 0;

    // ── Trigger screen shake ─────────────────────────
    if (window.CAMERA_SYSTEM && CAMERA_SYSTEM.shake) {
      CAMERA_SYSTEM.shake(0.6, 0.8); // intensity, duration
    }
  }

  updateExplosion(delta) {
    this.explosionTime += delta;

    // ── Animate debris ───────────────────────────────
    for (const part of this.explosionParts) {
      if (part.life <= 0) continue;
      part.life -= delta;

      part.vel.y -= 0.015;  // gravity
      part.mesh.position.x += part.vel.x;
      part.mesh.position.y += part.vel.y;
      part.mesh.position.z += part.vel.z;
      part.mesh.rotation.x += part.rotVel.x;
      part.mesh.rotation.y += part.rotVel.y;
      part.mesh.rotation.z += part.rotVel.z;

      // Stop at ground
      if (part.mesh.position.y < 0.2) {
        part.mesh.position.y = 0.2;
        part.vel.y = 0;
        part.vel.x *= 0.9;
        part.vel.z *= 0.9;
      }

      // Fade out
      if (part.life < 1) {
        part.mesh.material.opacity = part.life;
        part.mesh.material.transparent = true;
      }
    }

    // ── Animate fire ─────────────────────────────────
    for (const fire of this.fireParts) {
      fire.sprite.position.y = fire.baseY + Math.sin(this.explosionTime * fire.speed + fire.phase) * 0.5;
      const flicker = 0.6 + Math.sin(this.explosionTime * fire.speed * 3 + fire.phase) * 0.4;
      const s = fire.baseScale * flicker;
      fire.sprite.scale.set(s, s, 1);
      fire.sprite.material.opacity = 0.5 + flicker * 0.3;
    }

    // ── Flicker fire light ────────────────────────────
    if (this.fireLight) {
      this.fireLight.intensity = 1.5 + Math.sin(this.explosionTime * 8) * 0.8;
    }
  }

  cleanupExplosion() {
    for (const part of this.explosionParts) {
      SCENE.scene.remove(part.mesh);
      if (part.mesh.geometry) part.mesh.geometry.dispose();
    }
    this.explosionParts = [];

    for (const fire of this.fireParts) {
      SCENE.scene.remove(fire.sprite);
      if (fire.sprite.material) fire.sprite.material.dispose();
    }
    this.fireParts = [];

    if (this.fireLight) {
      SCENE.scene.remove(this.fireLight);
      this.fireLight = null;
    }
  }

  // ──────────────────────────────────────────────────
  //  Scene management
  // ──────────────────────────────────────────────────

  addToScene()      { SCENE.scene.add(this.mesh); }
  removeFromScene() {
    SCENE.scene.remove(this.mesh);
    this._stopEngineSound();
    this.cleanupExplosion();
  }

  // ──────────────────────────────────────────────────
  //  Positioning
  // ──────────────────────────────────────────────────

  setPosition(x, z) {
    this.position.x  = x;
    this.position.z  = z;
    this.position.y  = window.CITY && CITY.getRoadHeight ? CITY.getRoadHeight(x, z) : 0.65;
    this.heading     = 0;
    this.speed       = 0;
    this.steerInput  = 0;
    this.steerAngle  = 0;
    this.lateralVel  = 0;
    this.bodyPitch   = 0;
    this.bodyRoll    = 0;
  }

  // ──────────────────────────────────────────────────
  //  Read-outs
  // ──────────────────────────────────────────────────

  getSpeedKMH() {
    return Math.abs(Math.round(this.speed * 200));
  }

  getData() {
    return {
      speed:    this.getSpeedKMH(),
      gear:     this.gear,
      rpm:      this.rpm,
      heading:  this.heading,
      skidding: this.skidding,
      position: { ...this.position }
    };
  }
}

// ── Export ─────────────────────────────────────────────
window.CAR = { CarEntity };
