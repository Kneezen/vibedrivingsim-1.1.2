/**
 * city.js — Procedural city generation: roads, buildings, sidewalks,
 * street lights, and a ground plane.
 * Uses geometry merging to keep draw calls low (~20 meshes total).
 * Dependencies: window.SCENE, window.CONFIG
 * Exports:      window.CITY
 */

window.CITY = {

  roadMesh: null,
  buildings: [],
  groundMesh: null,
  roadNetwork: [],

  // ────────────────────────────────────────────────────
  //  Helpers
  // ────────────────────────────────────────────────────

  /** Clone a geometry and translate it in-place (for merging). */
  _stamp(geo, x, y, z) {
    const g = geo.clone();
    g.translate(x, y, z);
    return g;
  },

  /** Merge an array of BufferGeometry into one, add as a single mesh. */
  _mergeMesh(geos, mat, opts) {
    if (geos.length === 0) return null;
    const merged = THREE.BufferGeometryUtils
      ? THREE.BufferGeometryUtils.mergeBufferGeometries(geos, false)
      : this._fallbackMerge(geos);
    const mesh = new THREE.Mesh(merged, mat);
    if (opts && opts.castShadow)    mesh.castShadow = true;
    if (opts && opts.receiveShadow) mesh.receiveShadow = true;
    SCENE.scene.add(mesh);
    return mesh;
  },

  /** r134 ships without BufferGeometryUtils on the global — inline a
      lightweight merge that concatenates position / normal / uv. */
  _fallbackMerge(geos) {
    const positions = [], normals = [], uvs = [];
    const indices = [];
    let offset = 0;
    for (const g of geos) {
      const pos = g.attributes.position;
      const nor = g.attributes.normal;
      const uv  = g.attributes.uv;
      const idx = g.index;
      for (let i = 0; i < pos.count; i++) {
        positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        if (nor) normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
        if (uv)  uvs.push(uv.getX(i), uv.getY(i));
      }
      if (idx) {
        for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + offset);
      } else {
        for (let i = 0; i < pos.count; i++) indices.push(offset + i);
      }
      offset += pos.count;
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (normals.length) merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    if (uvs.length)     merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    merged.setIndex(indices);
    return merged;
  },

  // ────────────────────────────────────────────────────
  //  Public API
  // ────────────────────────────────────────────────────

  init() {
    this.createGround();
    this.createRoadNetwork();
    this.createBuildings();
    this.createSidewalks();
    this.createStreetLights();
    this.createPedestrians();
  },

  // ────────────────────────────────────────────────────
  //  Ground
  // ────────────────────────────────────────────────────

  createGround() {
    const geo = new THREE.PlaneGeometry(520, 520);
    const mat = new THREE.MeshLambertMaterial({ color: 0x2d5a1b });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0;
    mesh.receiveShadow = true;
    this.groundMesh = mesh;
    SCENE.scene.add(mesh);
  },

  // ────────────────────────────────────────────────────
  //  Roads  (merged into 3 meshes: asphalt, yellow, white)
  // ────────────────────────────────────────────────────

  createRoadNetwork() {
    const { MAP_SIZE, BLOCK_SIZE, ROAD_WIDTH } = CONFIG;
    const stride = BLOCK_SIZE + ROAD_WIDTH;
    const count  = Math.floor(MAP_SIZE / stride);
    const half   = MAP_SIZE / 2;

    const roadGeos   = [];
    const yellowGeos = [];
    const whiteGeos  = [];

    const positions = [];
    for (let i = 0; i <= count; i++) {
      positions.push(-half + i * stride + ROAD_WIDTH / 2);
    }

    // Horizontal roads
    positions.forEach(pz => {
      roadGeos.push(this._stamp(new THREE.BoxGeometry(MAP_SIZE, 0.2, ROAD_WIDTH), 0, 0.01, pz));
      this.roadNetwork.push({ x: -half, z: pz - ROAD_WIDTH / 2, w: MAP_SIZE, h: ROAD_WIDTH });
    });

    // Vertical roads
    positions.forEach(px => {
      roadGeos.push(this._stamp(new THREE.BoxGeometry(ROAD_WIDTH, 0.2, MAP_SIZE), px, 0.01, 0));
      this.roadNetwork.push({ x: px - ROAD_WIDTH / 2, z: -half, w: ROAD_WIDTH, h: MAP_SIZE });
    });

    // Lane markings — shared template geos
    const dashH = new THREE.BoxGeometry(4, 0.01, 0.4);
    const dashV = new THREE.BoxGeometry(0.4, 0.01, 4);
    const edgeH = new THREE.BoxGeometry(4, 0.01, 0.2);
    const edgeV = new THREE.BoxGeometry(0.2, 0.01, 4);

    positions.forEach(pz => {
      for (let x = -half; x < half; x += 8) {
        yellowGeos.push(this._stamp(dashH, x, 0.22, pz));
        whiteGeos.push(this._stamp(edgeH, x, 0.22, pz - ROAD_WIDTH / 2 + 0.5));
        whiteGeos.push(this._stamp(edgeH, x, 0.22, pz + ROAD_WIDTH / 2 - 0.5));
      }
    });
    positions.forEach(px => {
      for (let z = -half; z < half; z += 8) {
        yellowGeos.push(this._stamp(dashV, px, 0.22, z));
        whiteGeos.push(this._stamp(edgeV, px - ROAD_WIDTH / 2 + 0.5, 0.22, z));
        whiteGeos.push(this._stamp(edgeV, px + ROAD_WIDTH / 2 - 0.5, 0.22, z));
      }
    });

    this._mergeMesh(roadGeos,   new THREE.MeshLambertMaterial({ color: 0x333333 }), { receiveShadow: true });
    this._mergeMesh(yellowGeos, new THREE.MeshLambertMaterial({ color: 0xddcc00 }), {});
    this._mergeMesh(whiteGeos,  new THREE.MeshLambertMaterial({ color: 0xcccccc }), {});
  },

  // ────────────────────────────────────────────────────
  //  Buildings  (merged by colour into ~8 meshes + 1 windows mesh)
  // ────────────────────────────────────────────────────

  createBuildings() {
    const { MAP_SIZE, BLOCK_SIZE, ROAD_WIDTH,
            BUILDING_MIN_HEIGHT, BUILDING_MAX_HEIGHT } = CONFIG;
    const stride = BLOCK_SIZE + ROAD_WIDTH;
    const count  = Math.floor(MAP_SIZE / stride);
    const half   = MAP_SIZE / 2;

    const palette = [0xc0a080, 0x8090b0, 0xa0b0c0, 0xb0c0d0,
                     0x909090, 0xd0c0b0, 0x7080a0];

    // Buckets: one geometry array per palette colour + one for roofs + one for windows
    const bodyBuckets = palette.map(() => []);
    const roofGeos    = [];
    const windowGeos  = [];

    const rand = (lo, hi) => lo + Math.random() * (hi - lo);

    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        const bx0 = -half + col * stride + ROAD_WIDTH;
        const bz0 = -half + row * stride + ROAD_WIDTH;
        const numBuildings = 1 + Math.floor(Math.random() * 4);

        for (let b = 0; b < numBuildings; b++) {
          const bw = rand(10, 45);
          const bd = rand(10, 45);
          const bh = rand(BUILDING_MIN_HEIGHT, BUILDING_MAX_HEIGHT);

          const maxOffX = Math.max(0, BLOCK_SIZE - bw - 2);
          const maxOffZ = Math.max(0, BLOCK_SIZE - bd - 2);
          const ox = Math.random() * maxOffX + 1;
          const oz = Math.random() * maxOffZ + 1;
          const cx = bx0 + ox + bw / 2;
          const cz = bz0 + oz + bd / 2;

          // Body
          const ci = Math.floor(Math.random() * palette.length);
          bodyBuckets[ci].push(this._stamp(new THREE.BoxGeometry(bw, bh, bd), cx, bh / 2, cz));

          // Roof
          roofGeos.push(this._stamp(new THREE.BoxGeometry(bw + 0.4, 1.5, bd + 0.4), cx, bh + 0.75, cz));

          // Windows — reduced density: every other floor, skip some
          const floorH = 6;
          const floors = Math.floor(bh / floorH);
          const winCount = Math.floor(bw / 5);
          const sideCount = Math.floor(bd / 5);
          const winGeo  = new THREE.BoxGeometry(1.2, 1.5, 0.1);
          const sideGeo = new THREE.BoxGeometry(0.1, 1.5, 1.2);

          for (let f = 1; f < floors; f++) {
            const wy = f * floorH;
            for (let wi = 0; wi < winCount; wi++) {
              if (Math.random() < 0.5) continue;
              const wx = cx - bw / 2 + 2.5 + wi * 5;
              windowGeos.push(this._stamp(winGeo, wx, wy, cz - bd / 2 - 0.04));
              if (Math.random() > 0.5) {
                windowGeos.push(this._stamp(winGeo, wx, wy, cz + bd / 2 + 0.04));
              }
            }
            for (let si = 0; si < sideCount; si++) {
              if (Math.random() < 0.5) continue;
              const wz = cz - bd / 2 + 2.5 + si * 5;
              windowGeos.push(this._stamp(sideGeo, cx - bw / 2 - 0.04, wy, wz));
              if (Math.random() > 0.5) {
                windowGeos.push(this._stamp(sideGeo, cx + bw / 2 + 0.04, wy, wz));
              }
            }
          }

          this.buildings.push({ mesh: null, x: cx, z: cz, width: bw, depth: bd });
        }
      }
    }

    // Merge each colour bucket into one mesh
    palette.forEach((color, i) => {
      this._mergeMesh(bodyBuckets[i],
        new THREE.MeshLambertMaterial({ color }),
        { castShadow: true, receiveShadow: true });
    });

    // Roof (darker grey)
    this._mergeMesh(roofGeos,
      new THREE.MeshLambertMaterial({ color: 0x555555 }),
      { castShadow: true });

    // Windows (emissive)
    this._mergeMesh(windowGeos,
      new THREE.MeshLambertMaterial({ color: 0xffffcc, emissive: 0xffeeaa, emissiveIntensity: 0.6 }),
      {});
  },

  // ────────────────────────────────────────────────────
  //  Sidewalks  (merged into 1 mesh)
  // ────────────────────────────────────────────────────

  createSidewalks() {
    const swWidth = 2;
    const geos = [];
    const { MAP_SIZE, BLOCK_SIZE, ROAD_WIDTH } = CONFIG;
    const stride = BLOCK_SIZE + ROAD_WIDTH;
    const count  = Math.floor(MAP_SIZE / stride);
    const half   = MAP_SIZE / 2;

    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        const bx0 = -half + col * stride + ROAD_WIDTH;
        const bz0 = -half + row * stride + ROAD_WIDTH;
        const cx = bx0 + BLOCK_SIZE / 2;
        const cz = bz0 + BLOCK_SIZE / 2;

        const w1 = BLOCK_SIZE + swWidth * 2;
        // Top edge
        geos.push(this._stamp(new THREE.BoxGeometry(w1, 0.3, swWidth),
          cx, 0.15, bz0 - swWidth / 2));
        // Bottom edge
        geos.push(this._stamp(new THREE.BoxGeometry(w1, 0.3, swWidth),
          cx, 0.15, bz0 + BLOCK_SIZE + swWidth / 2));
        // Left edge
        geos.push(this._stamp(new THREE.BoxGeometry(swWidth, 0.3, BLOCK_SIZE),
          bx0 - swWidth / 2, 0.15, cz));
        // Right edge
        geos.push(this._stamp(new THREE.BoxGeometry(swWidth, 0.3, BLOCK_SIZE),
          bx0 + BLOCK_SIZE + swWidth / 2, 0.15, cz));
      }
    }

    this._mergeMesh(geos,
      new THREE.MeshLambertMaterial({ color: 0x888888 }),
      { receiveShadow: true });
  },

  // ────────────────────────────────────────────────────
  //  Street lights  (merged poles+heads, sparse PointLights)
  // ────────────────────────────────────────────────────

  createStreetLights() {
    const poleGeo = new THREE.CylinderGeometry(0.2, 0.2, 8, 6);
    const headGeo = new THREE.BoxGeometry(1.5, 0.3, 1.5);
    const spacing = 80;   // wider spacing to reduce count

    const { MAP_SIZE, ROAD_WIDTH } = CONFIG;
    const half   = MAP_SIZE / 2;
    const stride = CONFIG.BLOCK_SIZE + ROAD_WIDTH;
    const count  = Math.floor(MAP_SIZE / stride);

    const positions = [];
    for (let i = 0; i <= count; i++) {
      positions.push(-half + i * stride + ROAD_WIDTH / 2);
    }

    const poleGeos = [];
    const headGeos = [];
    const placed   = new Set();
    let   lightCount = 0;
    const MAX_POINT_LIGHTS = 30;

    const add = (x, z) => {
      if (this.isOnRoad(x, z)) return; // Prevents streetlights from spawning in the middle of intersections/roads
      
      const key = `${Math.round(x)},${Math.round(z)}`;
      if (placed.has(key)) return;
      placed.add(key);

      poleGeos.push(this._stamp(poleGeo, x, 4, z));
      headGeos.push(this._stamp(headGeo, x, 8.15, z));

      // Only add actual PointLights sparingly
      if (lightCount < MAX_POINT_LIGHTS) {
        const light = new THREE.PointLight(0xfffaaa, 0.6, 35);
        light.position.set(x, 8.3, z);
        light.castShadow = false;
        SCENE.scene.add(light);
        lightCount++;
      }
    };

    positions.forEach(pz => {
      for (let x = -half; x < half; x += spacing) {
        add(x, pz - ROAD_WIDTH / 2 - 1.5);
        add(x, pz + ROAD_WIDTH / 2 + 1.5);
      }
    });
    positions.forEach(px => {
      for (let z = -half; z < half; z += spacing) {
        add(px - ROAD_WIDTH / 2 - 1.5, z);
        add(px + ROAD_WIDTH / 2 + 1.5, z);
      }
    });

    this._mergeMesh(poleGeos, new THREE.MeshLambertMaterial({ color: 0x555555 }), {});
    this._mergeMesh(headGeos, new THREE.MeshLambertMaterial({ color: 0xffff88, emissive: 0xffff44, emissiveIntensity: 0.5 }), {});
  },

  // ────────────────────────────────────────────────────
  //  Queries
  // ────────────────────────────────────────────────────

  isOnRoad(x, z) {
    const buf = 1;
    return this.roadNetwork.some(r =>
      x >= r.x - buf && x <= r.x + r.w + buf &&
      z >= r.z - buf && z <= r.z + r.h + buf
    );
  },

  getValidSpawnPoint() {
    for (const r of this.roadNetwork) {
      const cx = r.x + r.w / 2;
      const cz = r.z + r.h / 2;
      if (this.isOnRoad(cx, cz)) return { x: cx, z: cz };
    }
    return { x: 0, z: 0 };
  },

  // ────────────────────────────────────────────────────
  //  Pedestrians
  // ────────────────────────────────────────────────────

  createPedestrians() {
    this.pedestrians = [];
    
    const count = 400; // Number of pedestrians to spawn
    const bodyGeo = new THREE.BoxGeometry(0.6, 1.2, 0.6);
    const headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const headMat = new THREE.MeshLambertMaterial({ color: 0xffccaa });
    
    this.pedBodyMesh = new THREE.InstancedMesh(bodyGeo, bodyMat, count);
    this.pedBodyMesh.castShadow = true;
    this.pedBodyMesh.receiveShadow = true;
    
    this.pedHeadMesh = new THREE.InstancedMesh(headGeo, headMat, count);
    this.pedHeadMesh.castShadow = true;
    this.pedHeadMesh.receiveShadow = true;

    // Blood pools (hidden initially)
    const bloodGeo = new THREE.CircleGeometry(0.8, 16);
    bloodGeo.rotateX(-Math.PI / 2);
    const bloodMat = new THREE.MeshLambertMaterial({ color: 0x880000, depthWrite: false });
    this.bloodMesh = new THREE.InstancedMesh(bloodGeo, bloodMat, count);
    this.bloodMesh.receiveShadow = true;
    const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

    const colors = [0xff4444, 0x4444ff, 0x44ff44, 0xddaa33, 0xff88ff, 0xeeeeee, 0x333333, 0x111111];
    const half = CONFIG.MAP_SIZE / 2;

    let attempts = 0;
    let placed = 0;
    
    const tempMatrix = new THREE.Matrix4();
    const tempPos = new THREE.Vector3();
    const tempQuat = new THREE.Quaternion();
    const tempScale = new THREE.Vector3(1, 1, 1);
    const tempColor = new THREE.Color();

    while (placed < count && attempts < 3000) {
      attempts++;
      const x = -half + Math.random() * CONFIG.MAP_SIZE;
      const z = -half + Math.random() * CONFIG.MAP_SIZE;
      
      // 1. Must not be on a road
      if (this.isOnRoad(x, z)) continue;
      
      // 2. Must not be inside a building
      let inBuilding = false;
      for (const b of this.buildings) {
        if (Math.abs(x - b.x) < b.width / 2 + 0.5 && Math.abs(z - b.z) < b.depth / 2 + 0.5) {
          inBuilding = true;
          break;
        }
      }
      if (inBuilding) continue;

      // 3. Must be close to a road (on the sidewalk)
      let nearRoad = false;
      for (const r of this.roadNetwork) {
        const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
        const dz = Math.max(r.z - z, 0, z - (r.z + r.h));
        const dist = Math.sqrt(dx*dx + dz*dz);
        // Sidewalk is near the road, distance between 0 and 4
        if (dist > 0.5 && dist < 4.0) { 
          nearRoad = true;
          break;
        }
      }
      if (!nearRoad) continue;

      // Valid position!
      const cIdx = Math.floor(Math.random() * colors.length);
      const angle = Math.random() * Math.PI * 2;
      const baseSpeed = 1.5 + Math.random() * 1.5;
      
      this.pedestrians.push({
        idx: placed,
        x: x,
        z: z,
        heading: angle,
        baseSpeed: baseSpeed,
        speed: baseSpeed,
        isDead: false,
        isPanicking: false,
        panicTimer: 0,
        time: Math.random() * 100
      });

      tempPos.set(x, 0.6, z);
      tempQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      tempMatrix.compose(tempPos, tempQuat, tempScale);
      this.pedBodyMesh.setMatrixAt(placed, tempMatrix);
      
      tempPos.set(x, 1.4, z);
      tempMatrix.compose(tempPos, tempQuat, tempScale);
      this.pedHeadMesh.setMatrixAt(placed, tempMatrix);
      
      tempColor.setHex(colors[cIdx]);
      this.pedBodyMesh.setColorAt(placed, tempColor);
      
      this.bloodMesh.setMatrixAt(placed, hiddenMatrix);
      
      placed++;
    }

    this.pedBodyMesh.count = placed;
    this.pedHeadMesh.count = placed;
    this.bloodMesh.count = placed;
    this.pedBodyMesh.instanceMatrix.needsUpdate = true;
    this.pedHeadMesh.instanceMatrix.needsUpdate = true;
    this.bloodMesh.instanceMatrix.needsUpdate = true;
    if (this.pedBodyMesh.instanceColor) this.pedBodyMesh.instanceColor.needsUpdate = true;

    SCENE.scene.add(this.pedBodyMesh);
    SCENE.scene.add(this.pedHeadMesh);
    SCENE.scene.add(this.bloodMesh);
  },

  // ────────────────────────────────────────────────────
  //  Pedestrian update loop
  // ────────────────────────────────────────────────────

  updatePedestrians(delta, car) {
    if (!this.pedestrians || this.pedestrians.length === 0) return;

    let needsUpdate = false;
    const tempMatrix = new THREE.Matrix4();
    const tempPos = new THREE.Vector3();
    const tempQuat = new THREE.Quaternion();
    const tempScale = new THREE.Vector3(1, 1, 1);
    
    // Geometric center of the car for distance checking
    const cx = car.position.x + Math.sin(car.heading) * 2.5;
    const cz = car.position.z + Math.cos(car.heading) * 2.5;
    const carSpeed = Math.abs(car.speed);

    for (const p of this.pedestrians) {
      if (p.isDead) continue;
      
      if (p.isPanicking) {
        p.panicTimer -= delta;
        if (p.panicTimer <= 0) {
          p.isPanicking = false;
          p.speed = p.baseSpeed;
        }
      }

      p.time += delta * p.speed * 8; // step animation speed
      
      const nextX = p.x - Math.sin(p.heading) * p.speed * delta;
      const nextZ = p.z - Math.cos(p.heading) * p.speed * delta;

      // Crush check
      const distToCar = Math.sqrt((p.x - cx)**2 + (p.z - cz)**2);
      if (distToCar < 3.2 && carSpeed > 0.05) { 
        p.isDead = true;
        
        // Squish them visually (sidewalk is at y=0.3)
        tempScale.set(1.8, 0.05, 1.8);
        tempPos.set(p.x, 0.35, p.z);
        tempQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.heading);
        tempMatrix.compose(tempPos, tempQuat, tempScale);
        this.pedBodyMesh.setMatrixAt(p.idx, tempMatrix);
        
        tempPos.set(p.x, 0.35, p.z);
        tempMatrix.compose(tempPos, tempQuat, tempScale);
        this.pedHeadMesh.setMatrixAt(p.idx, tempMatrix);
        
        // Reveal blood pool
        tempScale.set(1 + Math.random(), 1, 1 + Math.random());
        tempPos.set(p.x, 0.31, p.z);
        tempQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI);
        tempMatrix.compose(tempPos, tempQuat, tempScale);
        this.bloodMesh.setMatrixAt(p.idx, tempMatrix);
        this.bloodMesh.instanceMatrix.needsUpdate = true;
        
        this.playCrushSound();
        needsUpdate = true;

        // Notify police system
        if (window.POLICE && POLICE.onPedestrianCrushed) {
          POLICE.onPedestrianCrushed();
        }

        // Panic nearby pedestrians
        for (const other of this.pedestrians) {
          if (other.isDead || other.idx === p.idx) continue;
          const dist = Math.sqrt((other.x - cx)**2 + (other.z - cz)**2);
          if (dist < 40.0) {
            other.isPanicking = true;
            other.panicTimer = 5.0;
            other.speed = other.baseSpeed * 2.5;
            // Run away from car
            const dx = other.x - cx;
            const dz = other.z - cz;
            other.heading = Math.atan2(-dx, -dz);
          }
        }

        continue;
      }
      
      // Pathfinding / Environment check
      const half = CONFIG.MAP_SIZE / 2 - 2;
      let hit = false;
      
      if (nextX > half || nextX < -half || nextZ > half || nextZ < -half) hit = true;
      if (!hit && this.isOnRoad(nextX, nextZ)) hit = true;
      
      if (!hit) {
        for (const b of this.buildings) {
          if (Math.abs(nextX - b.x) < b.width / 2 + 0.6 && Math.abs(nextZ - b.z) < b.depth / 2 + 0.6) {
            hit = true;
            break;
          }
        }
      }

      if (hit) {
        // Turn around or 90 degrees
        p.heading += (Math.random() > 0.5 ? Math.PI/2 : Math.PI);
      } else {
        p.x = nextX;
        p.z = nextZ;
      }

      // Matrix update for walking animation
      const bounceMult = p.isPanicking ? 0.35 : 0.15;
      const bounce = Math.abs(Math.sin(p.time)) * bounceMult;
      tempScale.set(1, 1, 1);
      tempQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.heading);
      
      tempPos.set(p.x, 0.6 + bounce, p.z);
      tempMatrix.compose(tempPos, tempQuat, tempScale);
      this.pedBodyMesh.setMatrixAt(p.idx, tempMatrix);
      
      tempPos.set(p.x, 1.4 + bounce, p.z);
      tempMatrix.compose(tempPos, tempQuat, tempScale);
      this.pedHeadMesh.setMatrixAt(p.idx, tempMatrix);
      
      needsUpdate = true;
    }
    
    if (needsUpdate) {
      this.pedBodyMesh.instanceMatrix.needsUpdate = true;
      this.pedHeadMesh.instanceMatrix.needsUpdate = true;
    }
  },

  // ────────────────────────────────────────────────────
  //  Revive Pedestrians
  // ────────────────────────────────────────────────────

  revivePedestrians() {
    if (!this.pedestrians || this.pedestrians.length === 0) return;

    const tempMatrix = new THREE.Matrix4();
    const tempPos = new THREE.Vector3();
    const tempQuat = new THREE.Quaternion();
    const tempScale = new THREE.Vector3(1, 1, 1);
    const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

    for (const p of this.pedestrians) {
      if (!p.isDead) {
        if (p.isPanicking) {
          p.isPanicking = false;
          p.speed = p.baseSpeed;
          p.panicTimer = 0;
        }
        continue;
      }

      p.isDead = false;
      p.isPanicking = false;
      p.panicTimer = 0;
      p.speed = p.baseSpeed;

      tempScale.set(1, 1, 1);
      tempQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.heading);

      // Restore body
      tempPos.set(p.x, 0.6, p.z);
      tempMatrix.compose(tempPos, tempQuat, tempScale);
      this.pedBodyMesh.setMatrixAt(p.idx, tempMatrix);

      // Restore head
      tempPos.set(p.x, 1.4, p.z);
      tempMatrix.compose(tempPos, tempQuat, tempScale);
      this.pedHeadMesh.setMatrixAt(p.idx, tempMatrix);

      // Hide blood pool
      this.bloodMesh.setMatrixAt(p.idx, hiddenMatrix);
    }

    this.pedBodyMesh.instanceMatrix.needsUpdate = true;
    this.pedHeadMesh.instanceMatrix.needsUpdate = true;
    this.bloodMesh.instanceMatrix.needsUpdate = true;
  },

  // ────────────────────────────────────────────────────
  //  Audio Synthesis
  // ────────────────────────────────────────────────────

  playCrushSound() {
    const sfxVol = window.SETTINGS ? window.SETTINGS.sfxVolume : 0.8;
    const audio = new Audio('sounds/crush.mp3');
    audio.volume = 0.8 * sfxVol;
    audio.play().catch(e => console.warn('Crush sound playback failed:', e));

    if (Math.random() < 1/8) {
      const screamAudio = new Audio('sounds/scream.mp3');
      screamAudio.volume = 0.8 * sfxVol;
      screamAudio.play().catch(e => console.warn('Scream sound playback failed:', e));
    }
  }
};
