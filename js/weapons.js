/**
 * weapons.js — Weapon system with 4 weapon types.
 * Saw Blades, Machine Gun, Oil Slick, Flamethrower.
 * Dependencies: window.CONFIG, window.SCENE, window.SAVE, window.POLICE, window.CITY
 * Exports:      window.WEAPONS
 */

window.WEAPONS = {

  // ── State ──────────────────────────────────────────
  equipped: null,          // 'saw' | 'machinegun' | 'oil' | 'flamethrower' | null
  projectiles: [],         // saw blades + bullets
  oilSlicks: [],           // active oil patches on the road
  flameActive: false,      // is flamethrower firing right now
  flameParticles: [],      // visual flame sprites

  // Per-weapon ammo/cooldown
  saw: { ammo: 3, rechargeTimers: [] },
  machinegun: { ammo: 60, reloading: false, reloadTimer: 0, fireTimer: 0 },
  oil: { charges: 2, rechargeTimers: [] },
  flamethrower: { fuel: 5, recharging: false, rechargeTimer: 0 },

  // Shared geometry/materials (created once to avoid alloc lag)
  _sawGeo: null,
  _sawMat: null,
  _bulletGeo: null,
  _bulletMat: null,
  _oilGeo: null,
  _oilMat: null,
  _flameMats: null,
  _initialized: false,

  // ────────────────────────────────────────────────────
  //  Init shared resources
  // ────────────────────────────────────────────────────

  _initResources() {
    if (this._initialized) return;

    // Saw blade — flat cylinder (disc)
    this._sawGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.08, 16);
    this._sawMat = new THREE.MeshLambertMaterial({ color: 0xcccccc, emissive: 0x444444, emissiveIntensity: 0.3 });

    // Bullet — small elongated box
    this._bulletGeo = new THREE.BoxGeometry(0.1, 0.1, 0.4);
    this._bulletMat = new THREE.MeshLambertMaterial({ color: 0xffff00, emissive: 0xffaa00, emissiveIntensity: 0.8 });

    // Oil slick — flat dark circle
    this._oilGeo = new THREE.CircleGeometry(5, 24);
    this._oilGeo.rotateX(-Math.PI / 2);
    this._oilMat = new THREE.MeshLambertMaterial({
      color: 0x111111, transparent: true, opacity: 0.7, depthWrite: false
    });

    // Flame sprite materials (pre-built)
    const flameColors = [0xff4400, 0xff6600, 0xff8800, 0xffaa00, 0xffcc00];
    this._flameMats = flameColors.map(c => new THREE.SpriteMaterial({
      color: c, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending
    }));

    this._initialized = true;
  },

  // ────────────────────────────────────────────────────
  //  Equip a weapon
  // ────────────────────────────────────────────────────

  equip(weaponId) {
    if (!window.SAVE || !SAVE.isWeaponUnlocked(weaponId)) return false;

    // Toggle off if already equipped
    if (this.equipped === weaponId) {
      this.equipped = null;
      return true;
    }

    // Stop flamethrower if switching away
    if (this.equipped === 'flamethrower') {
      this.flameActive = false;
    }

    this.equipped = weaponId;
    return true;
  },

  // ────────────────────────────────────────────────────
  //  Fire the equipped weapon
  // ────────────────────────────────────────────────────

  fire(car, delta, isHeld) {
    if (!this.equipped || !car || car.isExploded) return;
    this._initResources();

    switch (this.equipped) {
      case 'saw':        this._fireSaw(car); break;
      case 'machinegun': this._fireMachineGun(car, delta, isHeld); break;
      case 'oil':        this._fireOil(car); break;
      case 'flamethrower': this._fireFlamethrower(car, delta, isHeld); break;
    }
  },

  /**
   * Called when fire key is released.
   */
  stopFire() {
    if (this.equipped === 'flamethrower') {
      this.flameActive = false;
    }
  },

  // ────────────────────────────────────────────────────
  //  Saw Blade
  // ────────────────────────────────────────────────────

  _fireSaw(car) {
    const cfg = CONFIG.WEAPONS.SAW;
    if (this.saw.ammo <= 0) return;

    this.saw.ammo--;
    // Start recharge timer for this blade set
    this.saw.rechargeTimers.push(cfg.RECHARGE_TIME);

    // Shared teeth geometry for all 3 blades
    const teethGeo = new THREE.BoxGeometry(0.15, 0.12, 0.15);
    const teethMat = new THREE.MeshLambertMaterial({ color: 0x999999 });

    // Fire 3 blades in a strict side-by-side line (same direction, lateral offset)
    const lateralSpacing = 2.5; // distance between blades
    const offsets = [-lateralSpacing, 0, lateralSpacing];

    // Car's right direction (perpendicular to forward)
    const rightX = Math.cos(car.heading);
    const rightZ = -Math.sin(car.heading);

    for (const offset of offsets) {
      const mesh = new THREE.Mesh(this._sawGeo, this._sawMat);
      const spawnX = car.position.x + rightX * offset;
      const spawnZ = car.position.z + rightZ * offset;
      mesh.position.set(spawnX, 1.0, spawnZ);
      mesh.rotation.x = Math.PI / 2;
      mesh.castShadow = false;
      SCENE.scene.add(mesh);

      // Saw teeth
      for (let i = 0; i < 8; i++) {
        const tooth = new THREE.Mesh(teethGeo, teethMat);
        const angle = (i / 8) * Math.PI * 2;
        tooth.position.set(Math.cos(angle) * 0.75, 0, Math.sin(angle) * 0.75);
        mesh.add(tooth);
      }

      // All blades travel in the same forward direction
      this.projectiles.push({
        type: 'saw',
        mesh: mesh,
        x: spawnX,
        z: spawnZ,
        dx: -Math.sin(car.heading) * cfg.SPEED,
        dz: -Math.cos(car.heading) * cfg.SPEED,
        life: cfg.LIFETIME,
        damage: cfg.DAMAGE,
        bounces: 2
      });
    }
  },

  // ────────────────────────────────────────────────────
  //  Machine Gun
  // ────────────────────────────────────────────────────

  _fireMachineGun(car, delta, isHeld) {
    if (!isHeld) return;
    const cfg = CONFIG.WEAPONS.MACHINEGUN;

    // Reloading
    if (this.machinegun.reloading) return;

    // Fire rate limiter
    this.machinegun.fireTimer -= delta;
    if (this.machinegun.fireTimer > 0) return;
    this.machinegun.fireTimer = cfg.FIRE_RATE;

    if (this.machinegun.ammo <= 0) {
      // Start reload
      this.machinegun.reloading = true;
      this.machinegun.reloadTimer = cfg.RELOAD_TIME;
      if (window.UI) UI.showNotification('🔫 RELOADING...', 1500);
      return;
    }

    this.machinegun.ammo--;

    const mesh = new THREE.Mesh(this._bulletGeo, this._bulletMat);
    // Spawn from front of car
    const spawnX = car.position.x - Math.sin(car.heading) * 5;
    const spawnZ = car.position.z - Math.cos(car.heading) * 5;
    mesh.position.set(spawnX, 1.0, spawnZ);
    mesh.rotation.y = car.heading;
    mesh.castShadow = false;
    SCENE.scene.add(mesh);

    // Apply spread
    const spread = (Math.random() - 0.5) * cfg.SPREAD;
    const heading = car.heading + spread;

    this.projectiles.push({
      type: 'bullet',
      mesh: mesh,
      x: spawnX,
      z: spawnZ,
      dx: -Math.sin(heading) * cfg.SPEED,
      dz: -Math.cos(heading) * cfg.SPEED,
      life: cfg.RANGE / cfg.SPEED / 60, // convert range to lifetime
      damage: cfg.DAMAGE
    });
  },

  // ────────────────────────────────────────────────────
  //  Oil Slick
  // ────────────────────────────────────────────────────

  _fireOil(car) {
    const cfg = CONFIG.WEAPONS.OIL;
    if (this.oil.charges <= 0) return;

    // Prevent rapid drops — check if we just placed one
    if (this._oilCooldown > 0) return;
    this._oilCooldown = 1.0; // 1 second between drops

    this.oil.charges--;
    this.oil.rechargeTimers.push(cfg.RECHARGE_TIME);

    // Drop behind the car
    const dropX = car.position.x + Math.sin(car.heading) * 6;
    const dropZ = car.position.z + Math.cos(car.heading) * 6;

    const mesh = new THREE.Mesh(this._oilGeo, this._oilMat.clone());
    mesh.position.set(dropX, 0.05, dropZ);
    mesh.castShadow = false;
    SCENE.scene.add(mesh);

    // Add iridescent shimmer ring
    const ringGeo = new THREE.RingGeometry(4.5, 5.0, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshLambertMaterial({
      color: 0x224488, transparent: true, opacity: 0.3, depthWrite: false
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(dropX, 0.06, dropZ);
    SCENE.scene.add(ring);

    this.oilSlicks.push({
      mesh: mesh,
      ring: ring,
      x: dropX,
      z: dropZ,
      life: cfg.PERSIST_TIME,
      radius: cfg.RADIUS,
      spinDuration: cfg.SPIN_DURATION
    });
  },

  // ────────────────────────────────────────────────────
  //  Flamethrower
  // ────────────────────────────────────────────────────

  _fireFlamethrower(car, delta, isHeld) {
    if (!isHeld) {
      this.flameActive = false;
      return;
    }
    const cfg = CONFIG.WEAPONS.FLAMETHROWER;

    if (this.flamethrower.fuel <= 0) {
      this.flameActive = false;
      return;
    }

    this.flameActive = true;
    this.flamethrower.fuel -= delta;
    if (this.flamethrower.fuel < 0) this.flamethrower.fuel = 0;

    // Emit flame particles
    for (let i = 0; i < 3; i++) {
      const mat = this._flameMats[Math.floor(Math.random() * this._flameMats.length)];
      const sprite = new THREE.Sprite(mat);
      const scale = 0.8 + Math.random() * 1.2;
      sprite.scale.set(scale, scale, 1);

      // Spawn at front of car with slight offset
      const offsetAngle = car.heading + (Math.random() - 0.5) * cfg.CONE_ANGLE;
      const dist = 5 + Math.random() * 2;
      sprite.position.set(
        car.position.x - Math.sin(offsetAngle) * dist,
        0.5 + Math.random() * 1.5,
        car.position.z - Math.cos(offsetAngle) * dist
      );

      SCENE.scene.add(sprite);
      this.flameParticles.push({
        sprite: sprite,
        x: sprite.position.x,
        z: sprite.position.z,
        dx: -Math.sin(offsetAngle) * 0.3,
        dz: -Math.cos(offsetAngle) * 0.3,
        life: 0.3 + Math.random() * 0.2,
        baseScale: scale
      });
    }
  },

  // ────────────────────────────────────────────────────
  //  Per-frame update
  // ────────────────────────────────────────────────────

  _oilCooldown: 0,

  update(delta, car) {
    if (!car) return;
    this._initResources();

    const dt = delta * 60;

    // ── Oil drop cooldown ─────────────────────────
    if (this._oilCooldown > 0) this._oilCooldown -= delta;

    // ── Saw recharge timers ───────────────────────
    const sawCfg = CONFIG.WEAPONS.SAW;
    for (let i = this.saw.rechargeTimers.length - 1; i >= 0; i--) {
      this.saw.rechargeTimers[i] -= delta;
      if (this.saw.rechargeTimers[i] <= 0) {
        this.saw.rechargeTimers.splice(i, 1);
        if (this.saw.ammo < sawCfg.MAX_AMMO) this.saw.ammo++;
      }
    }

    // ── Machine gun reload ────────────────────────
    if (this.machinegun.reloading) {
      this.machinegun.reloadTimer -= delta;
      if (this.machinegun.reloadTimer <= 0) {
        this.machinegun.reloading = false;
        this.machinegun.ammo = CONFIG.WEAPONS.MACHINEGUN.MAX_AMMO;
      }
    }

    // ── Oil recharge timers ───────────────────────
    const oilCfg = CONFIG.WEAPONS.OIL;
    for (let i = this.oil.rechargeTimers.length - 1; i >= 0; i--) {
      this.oil.rechargeTimers[i] -= delta;
      if (this.oil.rechargeTimers[i] <= 0) {
        this.oil.rechargeTimers.splice(i, 1);
        if (this.oil.charges < oilCfg.MAX_CHARGES) this.oil.charges++;
      }
    }

    // ── Flamethrower recharge (when not firing) ───
    const ftCfg = CONFIG.WEAPONS.FLAMETHROWER;
    if (!this.flameActive && this.flamethrower.fuel < ftCfg.MAX_FUEL) {
      this.flamethrower.fuel += ftCfg.RECHARGE_RATE * delta;
      if (this.flamethrower.fuel > ftCfg.MAX_FUEL) this.flamethrower.fuel = ftCfg.MAX_FUEL;
    }

    // ── Update projectiles (saws + bullets) ───────
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= delta;

      if (p.life <= 0) {
        this._removeProjectile(i);
        continue;
      }

      // Move
      p.x += p.dx * dt;
      p.z += p.dz * dt;
      p.mesh.position.set(p.x, p.mesh.position.y, p.z);

      // Spin saw blades
      if (p.type === 'saw') {
        p.mesh.rotation.y += delta * 20;
      }

      // Building collision (bounce for saws, destroy for bullets)
      if (window.CITY && CITY.buildings) {
        for (const b of CITY.buildings) {
          if (Math.abs(p.x - b.x) < b.width / 2 + 0.5 &&
              Math.abs(p.z - b.z) < b.depth / 2 + 0.5) {
            if (p.type === 'saw' && p.bounces > 0) {
              p.bounces--;
              // Reflect — determine which face was hit
              const relX = p.x - b.x;
              const relZ = p.z - b.z;
              if (Math.abs(relX / (b.width / 2)) > Math.abs(relZ / (b.depth / 2))) {
                p.dx = -p.dx;
              } else {
                p.dz = -p.dz;
              }
              // Push out of building
              p.x += p.dx * 2;
              p.z += p.dz * 2;
            } else {
              this._removeProjectile(i);
            }
            break;
          }
        }
      }

      // Boundary check
      if (Math.abs(p.x) > 248 || Math.abs(p.z) > 248) {
        this._removeProjectile(i);
        continue;
      }

      // Police hit check
      if (window.POLICE && POLICE.isActive) {
        for (let j = 0; j < POLICE.policeCars.length; j++) {
          const pc = POLICE.policeCars[j];
          const dist = Math.sqrt((p.x - pc.x) ** 2 + (p.z - pc.z) ** 2);
          if (dist < 4.0) {
            POLICE.takeDamage(j, p.damage);
            this._removeProjectile(i);
            break;
          }
        }
      }

      // Pedestrian hit check
      if (window.CITY && CITY.pedestrians) {
        this._checkPedHit(p.x, p.z, 2.0, i);
      }
    }

    // ── Update oil slicks ─────────────────────────
    for (let i = this.oilSlicks.length - 1; i >= 0; i--) {
      const oil = this.oilSlicks[i];
      oil.life -= delta;

      if (oil.life <= 0) {
        SCENE.scene.remove(oil.mesh);
        SCENE.scene.remove(oil.ring);
        if (oil.mesh.material && oil.mesh.material !== this._oilMat) oil.mesh.material.dispose();
        if (oil.ring.geometry) oil.ring.geometry.dispose();
        if (oil.ring.material) oil.ring.material.dispose();
        this.oilSlicks.splice(i, 1);
        continue;
      }

      // Fade out in last 2 seconds
      if (oil.life < 2) {
        oil.mesh.material.opacity = 0.7 * (oil.life / 2);
        if (oil.ring.material) oil.ring.material.opacity = 0.3 * (oil.life / 2);
      }

      // Check police collision
      if (window.POLICE && POLICE.isActive) {
        for (let j = 0; j < POLICE.policeCars.length; j++) {
          const pc = POLICE.policeCars[j];
          const dist = Math.sqrt((oil.x - pc.x) ** 2 + (oil.z - pc.z) ** 2);
          if (dist < oil.radius && (!pc.oilSpinTimer || pc.oilSpinTimer <= 0)) {
            POLICE.applyOilSlick(j, oil.spinDuration);
          }
        }
      }
    }

    // ── Update flame particles ────────────────────
    for (let i = this.flameParticles.length - 1; i >= 0; i--) {
      const fp = this.flameParticles[i];
      fp.life -= delta;

      if (fp.life <= 0) {
        SCENE.scene.remove(fp.sprite);
        this.flameParticles.splice(i, 1);
        continue;
      }

      fp.x += fp.dx * dt;
      fp.z += fp.dz * dt;
      fp.sprite.position.set(fp.x, fp.sprite.position.y + delta * 2, fp.z);

      // Fade and shrink
      const t = fp.life / 0.5;
      fp.sprite.material.opacity = 0.7 * t;
      const s = fp.baseScale * t;
      fp.sprite.scale.set(s, s, 1);
    }

    // ── Flamethrower damage zone (cone in front of car) ─
    if (this.flameActive && car && !car.isExploded) {
      const ftCfg2 = CONFIG.WEAPONS.FLAMETHROWER;

      // Check police in cone
      if (window.POLICE && POLICE.isActive) {
        for (let j = 0; j < POLICE.policeCars.length; j++) {
          const pc = POLICE.policeCars[j];
          if (this._isInCone(car, pc.x, pc.z, ftCfg2.RANGE, ftCfg2.CONE_ANGLE)) {
            POLICE.takeDamage(j, ftCfg2.DAMAGE_PER_SEC * delta);
          }
        }
      }

      // Check pedestrians in cone
      if (window.CITY && CITY.pedestrians) {
        for (const ped of CITY.pedestrians) {
          if (ped.isDead) continue;
          if (this._isInCone(car, ped.x, ped.z, ftCfg2.RANGE, ftCfg2.CONE_ANGLE)) {
            this._killPedestrian(ped);
          }
        }
      }
    }
  },

  // ────────────────────────────────────────────────────
  //  Helpers
  // ────────────────────────────────────────────────────

  _isInCone(car, targetX, targetZ, range, halfAngle) {
    const dx = targetX - car.position.x;
    const dz = targetZ - car.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > range || dist < 1) return false;

    // Car's forward direction
    const fwdX = -Math.sin(car.heading);
    const fwdZ = -Math.cos(car.heading);

    // Angle between forward and target
    const dot = (dx * fwdX + dz * fwdZ) / dist;
    return dot > Math.cos(halfAngle);
  },

  _checkPedHit(px, pz, radius, projectileIndex) {
    if (!window.CITY || !CITY.pedestrians) return;

    for (const ped of CITY.pedestrians) {
      if (ped.isDead) continue;
      const dist = Math.sqrt((px - ped.x) ** 2 + (pz - ped.z) ** 2);
      if (dist < radius) {
        this._killPedestrian(ped);
        // Remove the projectile on hit (except saw which passes through)
        if (projectileIndex >= 0 && this.projectiles[projectileIndex] &&
            this.projectiles[projectileIndex].type !== 'saw') {
          this._removeProjectile(projectileIndex);
        }
        return;
      }
    }
  },

  _killPedestrian(ped) {
    if (!ped || ped.isDead) return;
    ped.isDead = true;

    // Squish visual (same as car crush)
    const tempMatrix = new THREE.Matrix4();
    const tempPos = new THREE.Vector3();
    const tempQuat = new THREE.Quaternion();
    const tempScale = new THREE.Vector3(1.8, 0.05, 1.8);

    tempPos.set(ped.x, 0.35, ped.z);
    tempQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ped.heading);
    tempMatrix.compose(tempPos, tempQuat, tempScale);
    CITY.pedBodyMesh.setMatrixAt(ped.idx, tempMatrix);

    tempPos.set(ped.x, 0.35, ped.z);
    tempMatrix.compose(tempPos, tempQuat, tempScale);
    CITY.pedHeadMesh.setMatrixAt(ped.idx, tempMatrix);

    // Blood pool
    tempScale.set(1 + Math.random(), 1, 1 + Math.random());
    tempPos.set(ped.x, 0.31, ped.z);
    tempQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI);
    tempMatrix.compose(tempPos, tempQuat, tempScale);
    CITY.bloodMesh.setMatrixAt(ped.idx, tempMatrix);

    CITY.pedBodyMesh.instanceMatrix.needsUpdate = true;
    CITY.pedHeadMesh.instanceMatrix.needsUpdate = true;
    CITY.bloodMesh.instanceMatrix.needsUpdate = true;

    CITY.playCrushSound();

    // Weapon kills also count toward police spawn threshold
    if (window.POLICE && POLICE.onPedestrianCrushed) {
      POLICE.onPedestrianCrushed();
    }
  },

  _removeProjectile(index) {
    const p = this.projectiles[index];
    if (!p) return;
    SCENE.scene.remove(p.mesh);
    // Don't dispose shared geo/mat, just remove from scene
    this.projectiles.splice(index, 1);
  },

  // ────────────────────────────────────────────────────
  //  Reset — called on level start / retry
  // ────────────────────────────────────────────────────

  reset() {
    // Clear projectiles
    for (const p of this.projectiles) {
      SCENE.scene.remove(p.mesh);
    }
    this.projectiles = [];

    // Clear oil slicks
    for (const oil of this.oilSlicks) {
      SCENE.scene.remove(oil.mesh);
      SCENE.scene.remove(oil.ring);
      if (oil.mesh.material && oil.mesh.material !== this._oilMat) oil.mesh.material.dispose();
      if (oil.ring.geometry) oil.ring.geometry.dispose();
      if (oil.ring.material) oil.ring.material.dispose();
    }
    this.oilSlicks = [];

    // Clear flame particles
    for (const fp of this.flameParticles) {
      SCENE.scene.remove(fp.sprite);
    }
    this.flameParticles = [];
    this.flameActive = false;

    // Reset ammo
    this.saw.ammo = CONFIG.WEAPONS.SAW.MAX_AMMO;
    this.saw.rechargeTimers = [];
    this.machinegun.ammo = CONFIG.WEAPONS.MACHINEGUN.MAX_AMMO;
    this.machinegun.reloading = false;
    this.machinegun.reloadTimer = 0;
    this.machinegun.fireTimer = 0;
    this.oil.charges = CONFIG.WEAPONS.OIL.MAX_CHARGES;
    this.oil.rechargeTimers = [];
    this.flamethrower.fuel = CONFIG.WEAPONS.FLAMETHROWER.MAX_FUEL;
    this.flamethrower.recharging = false;
    this.flamethrower.rechargeTimer = 0;

    this._oilCooldown = 0;
  },

  // ────────────────────────────────────────────────────
  //  Get state (for HUD rendering)
  // ────────────────────────────────────────────────────

  getState() {
    const cfg = CONFIG.WEAPONS;
    return {
      equipped: this.equipped,
      saw: {
        ammo: this.saw.ammo,
        maxAmmo: cfg.SAW.MAX_AMMO,
        recharging: this.saw.rechargeTimers.length > 0
      },
      machinegun: {
        ammo: this.machinegun.ammo,
        maxAmmo: cfg.MACHINEGUN.MAX_AMMO,
        reloading: this.machinegun.reloading,
        reloadProgress: this.machinegun.reloading
          ? 1 - (this.machinegun.reloadTimer / cfg.MACHINEGUN.RELOAD_TIME)
          : 1
      },
      oil: {
        charges: this.oil.charges,
        maxCharges: cfg.OIL.MAX_CHARGES,
        recharging: this.oil.rechargeTimers.length > 0
      },
      flamethrower: {
        fuel: this.flamethrower.fuel,
        maxFuel: cfg.FLAMETHROWER.MAX_FUEL,
        active: this.flameActive
      }
    };
  }
};
