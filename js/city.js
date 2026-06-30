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
    if (opts && opts.hideMesh)      mesh.visible = false;
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
    // Clear procedural arrays
    this.buildings = [];
    this.roadNetwork = [];
    this.intersections = [];
    this.pedestrians = [];
    this.mapMeshes = [];

    // Collision & Height Grid
    this.gridSize = 4;
    this.mapHalfX = 250; // X: -250 to 250 (fits model perfectly)
    this.mapHalfZ = 200; // Z: -200 to 200 (trimmed to fit model, was 250)
    this.mapHalf = this.mapHalfX; // backwards compat for X lookups
    this.gridColsX = Math.ceil((this.mapHalfX * 2) / this.gridSize);
    this.gridColsZ = Math.ceil((this.mapHalfZ * 2) / this.gridSize);
    this.gridCols = this.gridColsX; // keep for backwards compat with X-based code
    this.totalCells = this.gridColsX * this.gridColsZ;
    this.heightGrid = new Float32Array(this.totalCells);  // max height per cell
    this.groundHeightGrid = new Float32Array(this.totalCells); // ground-level height
    this.wallGrid = new Uint8Array(this.totalCells);      // 1 = building, 0 = drivable

    // Add static map model
    if (window.MODELS && window.MODELS['map']) {
      const mapModel = window.MODELS['map'].clone();
      
      // New York City scale and offset (centered)
      mapModel.scale.set(2, 2, 2);
      mapModel.position.set(123.3, -0.5, -61.1); 
      
      // Update world matrix to accurately compute bounding boxes
      mapModel.updateMatrixWorld(true);
      
      mapModel.traverse(child => {
        if (child.isMesh) {
          this.mapMeshes.push(child);
        }
      });
      
      SCENE.scene.add(mapModel);
      
      // Scan the map to build height and collision grids
      this._buildCollisionGrid();
    }
    
    // Add a road segment spanning the drivable area so coins/police can spawn
    this.roadNetwork.push({
      x: -this.mapHalfX, z: -this.mapHalfZ, w: this.mapHalfX * 2, h: this.mapHalfZ * 2, width: this.mapHalfX * 2, depth: this.mapHalfZ * 2
    });
    
    // Create an invisible ground plane for basic physics/shadows if needed
    const groundGeo = new THREE.PlaneGeometry(1000, 1000);
    const groundMat = new THREE.MeshBasicMaterial({ visible: false });
    this.groundMesh = new THREE.Mesh(groundGeo, groundMat);
    this.groundMesh.rotation.x = -Math.PI / 2;
    SCENE.scene.add(this.groundMesh);

    // Spawn pedestrians on the new map
    this.createPedestrians();

    // Spawn boundary walls
    this.createBoundaryWalls();
  },

  createBoundaryWalls() {
    // We will build a perimeter of tall skyscrapers to serve as the boundary walls
    const palette = [0xc0a080, 0x8090b0, 0xa0b0c0, 0xb0c0d0, 0x909090, 0xd0c0b0, 0x7080a0];
    const bodyBuckets = palette.map(() => []);
    const windowGeos = [];

    const addSkyscraper = (cx, cz, bw, bd, isNS) => {
      const bh = 100 + Math.random() * 80;
      const ci = Math.floor(Math.random() * palette.length);
      bodyBuckets[ci].push(this._stamp(new THREE.BoxGeometry(bw, bh, bd), cx, bh / 2, cz));

      // Windows
      const floorH = 8;
      const floors = Math.floor(bh / floorH);
      const winCount = Math.floor((isNS ? bw : bd) / 6);
      const winGeo = isNS ? new THREE.BoxGeometry(1.5, 2, 0.1) : new THREE.BoxGeometry(0.1, 2, 1.5);
      
      for (let f = 1; f < floors; f++) {
        const wy = f * floorH;
        for (let wi = 0; wi < winCount; wi++) {
          if (Math.random() < 0.4) continue;
          if (isNS) {
            const wx = cx - bw / 2 + 3 + wi * 6;
            // Face inwards
            const wz = cz + (cz > 0 ? -bd/2 - 0.1 : bd/2 + 0.1);
            windowGeos.push(this._stamp(winGeo, wx, wy, wz));
          } else {
            const wz = cz - bd / 2 + 3 + wi * 6;
            // Face inwards
            const wx = cx + (cx > 0 ? -bw/2 - 0.1 : bw/2 + 0.1);
            windowGeos.push(this._stamp(winGeo, wx, wy, wz));
          }
        }
      }
    };

    // North & South walls
    for (let x = -this.mapHalfX; x <= this.mapHalfX; x += 30) {
      addSkyscraper(x, -this.mapHalfZ - 10, 30, 20, true);
      addSkyscraper(x, this.mapHalfZ + 10, 30, 20, true);
    }

    // East & West walls
    for (let z = -this.mapHalfZ; z <= this.mapHalfZ; z += 30) {
      addSkyscraper(this.mapHalfX + 10, z, 20, 30, false);
      addSkyscraper(-this.mapHalfX - 10, z, 20, 30, false);
    }

    // Merge each colour bucket into one mesh
    palette.forEach((color, i) => {
      if (bodyBuckets[i].length > 0) {
        this._mergeMesh(bodyBuckets[i],
          new THREE.MeshLambertMaterial({ color: color }),
          { castShadow: true, receiveShadow: true });
      }
    });

    // Windows (emissive)
    if (windowGeos.length > 0) {
      this._mergeMesh(windowGeos,
        new THREE.MeshLambertMaterial({ color: 0xffffcc, emissive: 0xffeeaa, emissiveIntensity: 0.6 }),
        {});
    }
  },

  _buildCollisionGrid() {
    if (this.mapMeshes.length === 0) return;
    
    // ── Building-Only Collision System ──────────────────────────────────
    // Strategy: scan every triangle, track the MAX height per grid cell.
    // If a cell's max height exceeds BUILDING_THRESHOLD, it's a building → solid wall.
    // Everything else (roads, lamps, trees, benches) → completely drivable, zero collision.
    // Ground height is tracked separately using only low, flat surfaces.
    
    const BUILDING_THRESHOLD = 40; // world-space meters; buildings are 40m+ tall
    
    console.log("Building collision grid (building-only mode)...");
    const startTime = performance.now();

    // Initialize grids
    for (let i = 0; i < this.heightGrid.length; i++) {
      this.heightGrid[i] = -9999;         // track max height per cell
      this.groundHeightGrid[i] = -9999;   // track ground-level height
      this.wallGrid[i] = 0;               // default: drivable
    }
    
    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const vC = new THREE.Vector3();

    // Pass 1: Scan every triangle to find max height and ground height per cell
    for (const mesh of this.mapMeshes) {
      if (!mesh.geometry || !mesh.geometry.isBufferGeometry) continue;

      mesh.updateMatrixWorld(true);
      const posAttribute = mesh.geometry.attributes.position;
      const index = mesh.geometry.index;
      
      if (!posAttribute) continue;

      const numTriangles = index ? index.count / 3 : posAttribute.count / 3;

      for (let i = 0; i < numTriangles; i++) {
        let a, b, c;
        if (index) {
          a = index.getX(i * 3);
          b = index.getX(i * 3 + 1);
          c = index.getX(i * 3 + 2);
        } else {
          a = i * 3; b = i * 3 + 1; c = i * 3 + 2;
        }

        vA.fromBufferAttribute(posAttribute, a).applyMatrix4(mesh.matrixWorld);
        vB.fromBufferAttribute(posAttribute, b).applyMatrix4(mesh.matrixWorld);
        vC.fromBufferAttribute(posAttribute, c).applyMatrix4(mesh.matrixWorld);

        const triMaxY = Math.max(vA.y, vB.y, vC.y);
        const triMinY = Math.min(vA.y, vB.y, vC.y);

        // Face normal (for detecting flat surfaces)
        const cb = new THREE.Vector3().subVectors(vC, vB);
        const ab = new THREE.Vector3().subVectors(vA, vB);
        const normal = cb.cross(ab).normalize();
        const isFlat = Math.abs(normal.y) > 0.7;

        // Bounding box of this triangle in grid space
        const minX = Math.min(vA.x, vB.x, vC.x);
        const maxX = Math.max(vA.x, vB.x, vC.x);
        const minZ = Math.min(vA.z, vB.z, vC.z);
        const maxZ = Math.max(vA.z, vB.z, vC.z);

        const minCx = Math.max(0, Math.floor((minX + this.mapHalfX) / this.gridSize));
        const maxCx = Math.min(this.gridColsX - 1, Math.floor((maxX + this.mapHalfX) / this.gridSize));
        const minCz = Math.max(0, Math.floor((minZ + this.mapHalfZ) / this.gridSize));
        const maxCz = Math.min(this.gridColsZ - 1, Math.floor((maxZ + this.mapHalfZ) / this.gridSize));

        for (let cX = minCx; cX <= maxCx; cX++) {
          for (let cZ = minCz; cZ <= maxCz; cZ++) {
            const idx = cX + cZ * this.gridColsX;

            // Track the tallest thing in this cell
            if (triMaxY > this.heightGrid[idx]) {
              this.heightGrid[idx] = triMaxY;
            }

            // Track ground height: only flat surfaces near road level (below 5m)
            // This prevents lamp tops and tree canopies from being treated as ground
            if (isFlat && triMaxY < 5.0) {
              if (triMaxY > this.groundHeightGrid[idx]) {
                this.groundHeightGrid[idx] = triMaxY;
              }
            }
          }
        }
      }
    }

    // Pass 2: Classify cells — buildings vs drivable
    let wallCount = 0;
    let drivableCount = 0;
    for (let i = 0; i < this.wallGrid.length; i++) {
      if (this.heightGrid[i] > BUILDING_THRESHOLD) {
        this.wallGrid[i] = 1; // BUILDING — solid, impenetrable
        wallCount++;
      } else {
        this.wallGrid[i] = 0; // Everything else — completely drivable
        drivableCount++;
      }
    }

    // Build buildings list for minimap / debug
    this.buildings = [];
    for (let cX = 0; cX < this.gridColsX; cX++) {
      for (let cZ = 0; cZ < this.gridColsZ; cZ++) {
        const idx = cX + cZ * this.gridColsX;
        if (this.wallGrid[idx] === 1) {
          const x = -this.mapHalfX + cX * this.gridSize + this.gridSize / 2;
          const z = -this.mapHalfZ + cZ * this.gridSize + this.gridSize / 2;
          this.buildings.push({
            x: x, z: z, width: this.gridSize, depth: this.gridSize
          });
        }
      }
    }
    
    console.log(`Collision grid built in ${(performance.now() - startTime).toFixed(0)}ms — ${wallCount} building cells, ${drivableCount} drivable cells`);
  },

  getRoadHeight(x, z) {
    if (this.mapMeshes.length === 0) return 0.65;
    
    const cX = Math.floor((x + this.mapHalfX) / this.gridSize);
    const cZ = Math.floor((z + this.mapHalfZ) / this.gridSize);
    
    if (cX >= 0 && cX < this.gridColsX && cZ >= 0 && cZ < this.gridColsZ) {
      const idx = cX + cZ * this.gridColsX;
      if (this.groundHeightGrid[idx] > -9999) {
        return this.groundHeightGrid[idx] + 0.65;
      }
    }
    
    return 0.65; // fallback
  },

  checkWallCollision(x, z, radius) {
    if (this.mapMeshes.length === 0) return null;
    
    const offsets = [
      [-radius, -radius], [radius, -radius],
      [-radius, radius], [radius, radius]
    ];
    
    for (let off of offsets) {
      const cx = x + off[0];
      const cz = z + off[1];
      const cX = Math.floor((cx + this.mapHalfX) / this.gridSize);
      const cZ = Math.floor((cz + this.mapHalfZ) / this.gridSize);
      
      if (cX < 0 || cX >= this.gridColsX || cZ < 0 || cZ >= this.gridColsZ) {
        return { x: 0, z: 0 }; // map boundary
      }
      
      const idx = cX + cZ * this.gridColsX;
      if (this.wallGrid[idx] === 1) {
        const blockX = -this.mapHalfX + cX * this.gridSize + this.gridSize / 2;
        const blockZ = -this.mapHalfZ + cZ * this.gridSize + this.gridSize / 2;
        return { x: blockX, z: blockZ };
      }
    }
    return null;
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

    this.streetLights = [];

    const add = (x, z) => {
      if (this.isOnRoad(x, z)) return; // Prevents streetlights from spawning in the middle of intersections/roads
      
      const key = `${Math.round(x)},${Math.round(z)}`;
      if (placed.has(key)) return;
      placed.add(key);

      poleGeos.push(this._stamp(poleGeo, x, 4, z));
      headGeos.push(this._stamp(headGeo, x, 8.15, z));

      // Only add actual PointLights sparingly
      if (lightCount < MAX_POINT_LIGHTS) {
        const light = new THREE.PointLight(0xffffff, 0.8, 35);
        light.position.set(x, 8.3, z);
        light.castShadow = false;
        SCENE.scene.add(light);
        this.streetLights.push(light);
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
    this._mergeMesh(headGeos, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5 }), {});
  },

  // ────────────────────────────────────────────────────
  //  Queries
  // ────────────────────────────────────────────────────

  isOnRoad(x, z) {
    if (this.wallGrid) {
      const cX = Math.floor((x + this.mapHalfX) / this.gridSize);
      const cZ = Math.floor((z + this.mapHalfZ) / this.gridSize);
      if (cX >= 0 && cX < this.gridColsX && cZ >= 0 && cZ < this.gridColsZ) {
        return this.wallGrid[cX + cZ * this.gridColsX] === 0;
      }
    }
    return true; // fallback
  },

  getValidSpawnPoint() {
    if (!this.wallGrid) return { x: 0, z: 0 };
    
    // Search from the center outwards for a valid road/ground cell
    const centerCX = Math.floor(this.gridColsX / 2);
    const centerCZ = Math.floor(this.gridColsZ / 2);
    const maxRadius = Math.max(this.gridColsX, this.gridColsZ) / 2;
    
    for (let radius = 0; radius < maxRadius; radius++) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue; 
          
          const cX = centerCX + dx;
          const cZ = centerCZ + dz;
          
          if (cX >= 0 && cX < this.gridColsX && cZ >= 0 && cZ < this.gridColsZ) {
            const idx = cX + cZ * this.gridColsX;
            // Valid if it's not a building and has a valid ground surface
            if (this.wallGrid[idx] === 0 && this.groundHeightGrid[idx] > -9999) {
              const x = -this.mapHalfX + cX * this.gridSize + this.gridSize / 2;
              const z = -this.mapHalfZ + cZ * this.gridSize + this.gridSize / 2;
              return { x, z };
            }
          }
        }
      }
    }
    
    return { x: 0, z: 0 }; // Fallback
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

    while (placed < count && attempts < 5000) {
      attempts++;
      const x = -this.mapHalfX + Math.random() * (this.mapHalfX * 2);
      const z = -this.mapHalfZ + Math.random() * (this.mapHalfZ * 2);
      
      // Must be on drivable ground (not a building) with valid ground height
      const cX = Math.floor((x + this.mapHalfX) / this.gridSize);
      const cZ = Math.floor((z + this.mapHalfZ) / this.gridSize);
      if (cX < 0 || cX >= this.gridColsX || cZ < 0 || cZ >= this.gridColsZ) continue;
      
      const idx = cX + cZ * this.gridColsX;
      if (this.wallGrid[idx] === 1) continue; // inside a building
      if (this.groundHeightGrid[idx] <= -9999) continue; // no ground here
      
      // Must be near a building edge (sidewalk area) — check if any neighbor is a building
      let nearBuilding = false;
      for (let ox = -2; ox <= 2; ox++) {
        for (let oz = -2; oz <= 2; oz++) {
          if (ox === 0 && oz === 0) continue;
          const nx = cX + ox, nz = cZ + oz;
          if (nx >= 0 && nx < this.gridColsX && nz >= 0 && nz < this.gridColsZ) {
            if (this.wallGrid[nx + nz * this.gridColsX] === 1) {
              nearBuilding = true;
              break;
            }
          }
        }
        if (nearBuilding) break;
      }
      if (!nearBuilding) continue;

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

      const groundY = this.getRoadHeight(x, z) - 0.65; // strip the car offset
      tempPos.set(x, groundY + 0.6, z);
      tempQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      tempMatrix.compose(tempPos, tempQuat, tempScale);
      this.pedBodyMesh.setMatrixAt(placed, tempMatrix);
      
      tempPos.set(x, groundY + 1.4, z);
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
        
        // Reveal blood pool
        const terrainHeight = this.getRoadHeight(p.x, p.z) - 0.65;
        
        tempScale.set(1.8, 0.05, 1.8);
        tempPos.set(p.x, terrainHeight + 0.35, p.z);
        tempQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.heading);
        tempMatrix.compose(tempPos, tempQuat, tempScale);
        this.pedBodyMesh.setMatrixAt(p.idx, tempMatrix);
        
        tempPos.set(p.x, terrainHeight + 0.35, p.z);
        tempMatrix.compose(tempPos, tempQuat, tempScale);
        this.pedHeadMesh.setMatrixAt(p.idx, tempMatrix);
        
        tempScale.set(1 + Math.random(), 1, 1 + Math.random());
        tempPos.set(p.x, terrainHeight + 0.31, p.z);
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
      let hit = false;
      
      if (nextX > this.mapHalfX - 5 || nextX < -this.mapHalfX + 5 || nextZ > this.mapHalfZ - 5 || nextZ < -this.mapHalfZ + 5) hit = true;
      
      // Check if next position is inside a building
      if (!hit) {
        const gX = Math.floor((nextX + this.mapHalfX) / this.gridSize);
        const gZ = Math.floor((nextZ + this.mapHalfZ) / this.gridSize);
        if (gX >= 0 && gX < this.gridColsX && gZ >= 0 && gZ < this.gridColsZ) {
          if (this.wallGrid[gX + gZ * this.gridColsX] === 1) hit = true;
        } else {
          hit = true;
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
      const terrainHeight = this.getRoadHeight(p.x, p.z) - 0.65; // get raw road y
      
      tempScale.set(1, 1, 1);
      tempQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.heading);
      
      tempPos.set(p.x, terrainHeight + 0.6 + bounce, p.z);
      tempMatrix.compose(tempPos, tempQuat, tempScale);
      this.pedBodyMesh.setMatrixAt(p.idx, tempMatrix);
      
      tempPos.set(p.x, terrainHeight + 1.4 + bounce, p.z);
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
      const terrainHeight = this.getRoadHeight(p.x, p.z) - 0.65;
      
      tempPos.set(p.x, terrainHeight + 0.6, p.z);
      tempMatrix.compose(tempPos, tempQuat, tempScale);
      this.pedBodyMesh.setMatrixAt(p.idx, tempMatrix);

      // Restore head
      tempPos.set(p.x, terrainHeight + 1.4, p.z);
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
