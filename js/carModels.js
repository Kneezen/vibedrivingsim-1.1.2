/**
 * carModels.js — Procedural 3D car mesh builder using only
 * Three.js primitive geometries (no external models).
 * Dependencies: window.CONFIG
 * Exports:      window.CAR_MODELS
 */

window.CAR_MODELS = {

  // ────────────────────────────────────────────────────
  //  Build a full-size car group
  // ────────────────────────────────────────────────────

  /**
   * @param {Object} carConfig — one entry from CONFIG.CARS
   * @returns {THREE.Group}
   */
  buildCar(carConfig) {
    const rootGroup = new THREE.Group();
    const g = new THREE.Group();
    g.position.z = 2.5; // Shift visuals so origin (0,0) is at the front wheels (-2.5 + 2.5 = 0)
    rootGroup.add(g);

    const bodyMat = new THREE.MeshPhongMaterial({
      color: carConfig.color,
      shininess: 80
    });
    const cabinMat = new THREE.MeshPhongMaterial({
      color: carConfig.color,
      shininess: 60
    });
    const trimMat = new THREE.MeshPhongMaterial({
      color: carConfig.trimColor || 0x222222,
      shininess: 40
    });
    const glassMat = new THREE.MeshPhongMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 0.5,
      shininess: 120
    });
    const bumperMat = new THREE.MeshPhongMaterial({ color: 0x222222, shininess: 30 });
    const headlightMat = new THREE.MeshPhongMaterial({
      color: 0xffffee,
      emissive: 0xffffaa,
      emissiveIntensity: 0.8
    });
    const taillightMat = new THREE.MeshPhongMaterial({
      color: 0xff2200,
      emissive: 0xff2200,
      emissiveIntensity: 0.8
    });
    const wheelMat  = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 20 });
    const hubMat    = new THREE.MeshPhongMaterial({ color: 0xaaaaaa, shininess: 100 });
    const darkMat   = new THREE.MeshPhongMaterial({ color: 0x1a1a1a });
    const exhaustMat = new THREE.MeshPhongMaterial({ color: 0x444444, shininess: 60 });

    // 1 ── Main body ──────────────────────────────────
    const body = new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, 8), bodyMat);
    body.position.y = 0.9;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    // 2 ── Cabin / roof ───────────────────────────────
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.0, 4), cabinMat);
    cabin.position.set(0, 1.9, 0.3);
    cabin.castShadow = true;
    g.add(cabin);

    // 3 ── Windshield (front) ─────────────────────────
    const wsGeo = new THREE.BoxGeometry(2.8, 0.8, 0.1);
    const windshield = new THREE.Mesh(wsGeo, glassMat);
    windshield.position.set(0, 1.85, -1.6);
    windshield.rotation.x = -0.2;
    g.add(windshield);

    // 4 ── Rear window ────────────────────────────────
    const rearWin = new THREE.Mesh(wsGeo, glassMat);
    rearWin.position.set(0, 1.85, 2.2);
    rearWin.rotation.x = 0.2;
    g.add(rearWin);

    // 5 ── Hood ───────────────────────────────────────
    const hood = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.15, 2.5), bodyMat);
    hood.position.set(0, 1.45, -2.7);
    hood.castShadow = true;
    g.add(hood);

    // 6 ── Trunk ──────────────────────────────────────
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.3, 1.5), bodyMat);
    trunk.position.set(0, 1.4, 3.2);
    trunk.castShadow = true;
    g.add(trunk);

    // 7 ── Bumpers ────────────────────────────────────
    const bGeo = new THREE.BoxGeometry(4.0, 0.3, 0.2);
    const frontBumper = new THREE.Mesh(bGeo, bumperMat);
    frontBumper.position.set(0, 0.4, -4.1);
    frontBumper.castShadow = true;
    g.add(frontBumper);

    const rearBumper = new THREE.Mesh(bGeo, bumperMat);
    rearBumper.position.set(0, 0.4, 4.1);
    rearBumper.castShadow = true;
    g.add(rearBumper);

    // 8 ── Headlights ─────────────────────────────────
    const hlGeo = new THREE.BoxGeometry(0.6, 0.3, 0.1);
    const hlL = new THREE.Mesh(hlGeo, headlightMat);
    hlL.position.set(-1.4, 0.9, -4.05);
    g.add(hlL);
    const hlR = new THREE.Mesh(hlGeo, headlightMat);
    hlR.position.set(1.4, 0.9, -4.05);
    g.add(hlR);

    // 9 ── Tail lights ────────────────────────────────
    const tlL = new THREE.Mesh(hlGeo, taillightMat);
    tlL.position.set(-1.4, 0.9, 4.05);
    g.add(tlL);
    const tlR = new THREE.Mesh(hlGeo, taillightMat);
    tlR.position.set(1.4, 0.9, 4.05);
    g.add(tlR);

    // 10 ── Wheels + hubcaps ──────────────────────────
    const wheelGeo = new THREE.CylinderGeometry(0.65, 0.65, 0.4, 16);
    const hubGeo   = new THREE.CylinderGeometry(0.35, 0.35, 0.41, 8);

    const wheelPositions = [
      { name: 'FL', x: -2.1, z: -2.5 },
      { name: 'FR', x:  2.1, z: -2.5 },
      { name: 'RL', x: -2.1, z:  2.5 },
      { name: 'RR', x:  2.1, z:  2.5 }
    ];

    const wheels = [];
    const frontWheels = [];

    wheelPositions.forEach((wp, i) => {
      const wheelGroup = new THREE.Group();

      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.castShadow = true;
      wheelGroup.add(wheel);

      const hub = new THREE.Mesh(hubGeo, hubMat);
      hub.rotation.z = Math.PI / 2;
      wheelGroup.add(hub);

      wheelGroup.position.set(wp.x, 0.65, wp.z);
      g.add(wheelGroup);
      wheels.push(wheelGroup);

      if (i < 2) frontWheels.push(wheelGroup);
    });

    // 11 ── Wheel wells ───────────────────────────────
    const wellGeo = new THREE.BoxGeometry(0.8, 0.2, 1.2);
    wheelPositions.forEach(wp => {
      const well = new THREE.Mesh(wellGeo, darkMat);
      well.position.set(wp.x, 1.1, wp.z);
      g.add(well);
    });

    // 12 ── Exhaust pipe ──────────────────────────────
    const exGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.8, 8);
    const exhaust = new THREE.Mesh(exGeo, exhaustMat);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(1.0, 0.4, 4.3);
    g.add(exhaust);

    // 13 ── Roof rack (for off-roader & muscle car) ───
    if (carConfig.id === 'off_roader' || carConfig.id === 'muscle_car') {
      const rackBar = new THREE.MeshPhongMaterial({ color: 0x333333, shininess: 40 });
      // Side rails
      const railGeo = new THREE.BoxGeometry(0.12, 0.12, 3.2);
      const railL = new THREE.Mesh(railGeo, rackBar);
      railL.position.set(-1.3, 2.5, 0.3);
      g.add(railL);
      const railR = new THREE.Mesh(railGeo, rackBar);
      railR.position.set(1.3, 2.5, 0.3);
      g.add(railR);
      // Cross bars
      const crossGeo = new THREE.BoxGeometry(2.6, 0.1, 0.12);
      for (let ci = -1; ci <= 1; ci++) {
        const cross = new THREE.Mesh(crossGeo, rackBar);
        cross.position.set(0, 2.56, 0.3 + ci * 1.2);
        g.add(cross);
      }
    }

    // ── Side mirrors ─────────────────────────────────
    const mirrorGeo = new THREE.BoxGeometry(0.4, 0.3, 0.5);
    const mirrorL = new THREE.Mesh(mirrorGeo, trimMat);
    mirrorL.position.set(-2.2, 1.5, -0.8);
    g.add(mirrorL);
    const mirrorR = new THREE.Mesh(mirrorGeo, trimMat);
    mirrorR.position.set(2.2, 1.5, -0.8);
    g.add(mirrorR);

    // ── Door lines (subtle trim) ─────────────────────
    const doorGeo = new THREE.BoxGeometry(0.05, 0.9, 2.8);
    const doorL = new THREE.Mesh(doorGeo, trimMat);
    doorL.position.set(-2.01, 1.1, 0);
    g.add(doorL);
    const doorR = new THREE.Mesh(doorGeo, trimMat);
    doorR.position.set(2.01, 1.1, 0);
    g.add(doorR);

    // ── Grille ───────────────────────────────────────
    const grilleGeo = new THREE.BoxGeometry(2.4, 0.5, 0.08);
    const grilleMat = new THREE.MeshPhongMaterial({ color: 0x222222, shininess: 60 });
    const grille = new THREE.Mesh(grilleGeo, grilleMat);
    grille.position.set(0, 0.6, -4.08);
    g.add(grille);

    // ── Under-body shadow catcher ────────────────────
    const underGeo = new THREE.BoxGeometry(3.8, 0.05, 7.8);
    const underMat = new THREE.MeshPhongMaterial({ color: 0x0a0a0a });
    const under = new THREE.Mesh(underGeo, underMat);
    under.position.set(0, 0.15, 0);
    under.receiveShadow = true;
    g.add(under);

    // ── Store references ─────────────────────────────
    g.userData.wheels = wheels;
    g.userData.frontWheels = frontWheels;
    g.userData.carConfig = carConfig;

    // Enable shadow on entire group
    g.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    // Store references on rootGroup too so updateWheels finds them
    rootGroup.userData.wheels = wheels;
    rootGroup.userData.frontWheels = frontWheels;
    rootGroup.userData.carConfig = carConfig;

    return rootGroup;
  },

  // ────────────────────────────────────────────────────
  //  Preview car (for selector screen)
  // ────────────────────────────────────────────────────

  /**
   * @param {Object} carConfig
   * @param {number} [size=0.5] — uniform scale
   * @returns {THREE.Group}
   */
  buildPreviewCar(carConfig, size) {
    const s = size || 0.5;
    const car = this.buildCar(carConfig);
    car.scale.set(s, s, s);
    return car;
  },

  // ────────────────────────────────────────────────────
  //  Wheel animation
  // ────────────────────────────────────────────────────

  /**
   * @param {THREE.Group} carGroup
   * @param {number} speed      — current forward speed
   * @param {number} steerAngle — current steering input (−1 … 1)
   * @param {number} delta      — frame delta in seconds
   */
  updateWheels(carGroup, speed, steerAngle, delta) {
    const wheels      = carGroup.userData.wheels;
    const frontWheels = carGroup.userData.frontWheels;
    if (!wheels) return;

    // Roll all wheels based on speed
    const roll = speed * delta * 10;
    wheels.forEach(w => {
      // The cylinder is rotated 90° on Z, so rolling is around X in local space
      w.children[0].rotation.x += roll;
      if (w.children[1]) w.children[1].rotation.x += roll;
    });

    // Steer front wheels
    if (frontWheels) {
      const yaw = steerAngle * 0.4;
      frontWheels.forEach(w => { w.rotation.y = yaw; });
    }
  }
};
