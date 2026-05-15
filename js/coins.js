/**
 * coins.js — Gold coin spawning, animation, and collection system.
 * Coins are placed on the road network and collected by driving over them.
 * Dependencies: window.CONFIG, window.SCENE, window.CITY
 * Exports:      window.COINS
 */

window.COINS = {

  coins: [],         // { mesh, x, z, collected }
  collected: 0,
  total: 0,
  time: 0,           // for animation

  // ── Audio context for coin chime ─────────────────────
  _audioCtx: null,

  // ────────────────────────────────────────────────────
  //  Spawn coins on the road
  // ────────────────────────────────────────────────────

  spawnCoins(count) {
    this.clear();
    this.total = count;
    this.collected = 0;
    this.time = 0;

    const C = CONFIG.COINS;
    const roads = CITY.roadNetwork;
    if (!roads || roads.length === 0) return;

    // Shared geometry and material for all coins
    const coinGeo = new THREE.CylinderGeometry(C.RADIUS, C.RADIUS, C.HEIGHT, 24);
    const coinMat = new THREE.MeshPhongMaterial({
      color: 0xffd700,
      emissive: 0xffaa00,
      emissiveIntensity: 0.4,
      shininess: 120,
      specular: 0xffffcc
    });

    // Inner ring for detail
    const ringGeo = new THREE.TorusGeometry(C.RADIUS * 0.6, 0.06, 8, 24);
    const ringMat = new THREE.MeshPhongMaterial({
      color: 0xffcc00,
      emissive: 0xff8800,
      emissiveIntensity: 0.3
    });

    let placed = 0;
    let attempts = 0;
    const maxAttempts = count * 50;
    const minDist = 15;  // min distance between coins

    while (placed < count && attempts < maxAttempts) {
      attempts++;

      // Pick a random road segment
      const road = roads[Math.floor(Math.random() * roads.length)];
      // Random position within the road segment
      const x = road.x + Math.random() * road.w;
      const z = road.z + Math.random() * road.h;

      // Check minimum distance from other coins
      let tooClose = false;
      for (const c of this.coins) {
        const dx = c.x - x;
        const dz = c.z - z;
        if (dx * dx + dz * dz < minDist * minDist) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      // Check not inside a building
      let inBuilding = false;
      if (CITY.buildings) {
        for (const b of CITY.buildings) {
          if (Math.abs(x - b.x) < b.width / 2 + 2 &&
              Math.abs(z - b.z) < b.depth / 2 + 2) {
            inBuilding = true;
            break;
          }
        }
      }
      if (inBuilding) continue;

      // Create coin mesh group
      const group = new THREE.Group();

      const coin = new THREE.Mesh(coinGeo, coinMat);
      coin.rotation.x = Math.PI / 2;  // lay flat initially, will spin
      coin.castShadow = true;
      group.add(coin);

      // Add decorative ring
      const ring = new THREE.Mesh(ringGeo, ringMat);
      group.add(ring);

      // The PointLight was causing shader recompilation stutters when visibility changed.
      // We rely on the coin's emissive material for the glow effect instead.

      group.position.set(x, C.HOVER_HEIGHT, z);
      SCENE.scene.add(group);

      this.coins.push({
        mesh: group,
        x: x,
        z: z,
        collected: false,
        phase: Math.random() * Math.PI * 2  // random start phase for bounce
      });

      placed++;
    }

    if (placed < count) {
      console.warn(`COINS: Only placed ${placed}/${count} coins`);
      this.total = placed;
    }
  },

  // ────────────────────────────────────────────────────
  //  Per-frame update
  // ────────────────────────────────────────────────────

  update(delta, car) {
    if (this.coins.length === 0) return;

    this.time += delta;
    const C = CONFIG.COINS;

    // Car center position
    const cx = car.position.x + Math.sin(car.heading) * 2.5;
    const cz = car.position.z + Math.cos(car.heading) * 2.5;

    for (const coin of this.coins) {
      if (coin.collected) continue;

      // ── Animate: spin + bounce ──────────────────────
      coin.mesh.rotation.y = this.time * C.SPIN_SPEED;
      const bounce = Math.sin(this.time * C.BOUNCE_SPEED + coin.phase) * C.BOUNCE_AMP;
      coin.mesh.position.y = C.HOVER_HEIGHT + bounce;

      // ── Collection check ────────────────────────────
      const dx = cx - coin.x;
      const dz = cz - coin.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < C.COLLECT_RADIUS) {
        coin.collected = true;
        this.collected++;

        // Hide the coin instead of removing from scene graph
        coin.mesh.visible = false;

        // Play chime sound
        this._playCollectSound();
      }
    }
  },

  // ────────────────────────────────────────────────────
  //  State query
  // ────────────────────────────────────────────────────

  getState() {
    return {
      collected: this.collected,
      total: this.total
    };
  },

  allCollected() {
    return this.total > 0 && this.collected >= this.total;
  },

  // ────────────────────────────────────────────────────
  //  Clear all coins
  // ────────────────────────────────────────────────────

  clear() {
    for (const coin of this.coins) {
      if (coin.mesh && coin.mesh.parent) {
        SCENE.scene.remove(coin.mesh);
        coin.mesh.traverse(child => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
      }
    }
    this.coins = [];
    this.collected = 0;
    this.total = 0;
    this.time = 0;
  },

  // ────────────────────────────────────────────────────
  //  Coin collect sound (Web Audio chime)
  // ────────────────────────────────────────────────────

  _playCollectSound() {
    try {
      if (!this._audioCtx) {
        this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = this._audioCtx;

      // Two-tone chime: ascending notes
      const now = ctx.currentTime;

      const sfxVol = window.SETTINGS ? window.SETTINGS.sfxVolume : 0.8;

      // Note 1
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.value = 880;  // A5
      gain1.gain.setValueAtTime(0.3 * sfxVol, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.2);

      // Note 2 (higher, slightly delayed)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.value = 1320;  // E6
      gain2.gain.setValueAtTime(0.25 * sfxVol, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.35);

    } catch (e) {
      console.warn('Coin sound failed:', e);
    }
  }
};
