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

  buildCar(carConfig) {
    const rootGroup = new THREE.Group();
    
    // Check if the preloaded model exists
    const gltfModel = window.MODELS && window.MODELS[carConfig.id];
    let carMesh;

    if (gltfModel) {
      // Wrapper group to handle rotation
      carMesh = new THREE.Group();
      const cloned = gltfModel.clone();
      carMesh.add(cloned);
      
      // Scale and center the model
      const box = new THREE.Box3().setFromObject(cloned);
      const size = new THREE.Vector3();
      box.getSize(size);
      
      // Normalize size so the car is roughly 8 units long
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim > 0) {
        const scale = 8.0 / maxDim;
        cloned.scale.set(scale, scale, scale);
      }
      
      // Recompute box after scale
      const scaledBox = new THREE.Box3().setFromObject(cloned);
      const center = new THREE.Vector3();
      scaledBox.getCenter(center);
      
      // Center the car at (0,0,0) and base at y=0
      cloned.position.set(-center.x, -scaledBox.min.y, -center.z);
      
      // The downloaded cars face +Z, but the game expects -Z to be forward.
      // Rotate the wrapper 180 degrees.
      carMesh.rotation.y = Math.PI;
      
      // Shift backwards so the origin is roughly at the front wheels (z = +2.5)
      carMesh.position.z = 2.5;
      
    } else {
      // Fallback if model missing
      const g = new THREE.Group();
      g.position.z = 2.5;
      const bodyMat = new THREE.MeshPhongMaterial({ color: carConfig.color });
      const body = new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, 8), bodyMat);
      body.position.y = 0.9;
      g.add(body);
      carMesh = g;
    }

    rootGroup.add(carMesh);
    rootGroup.userData.carConfig = carConfig;

    // ── Headlights ────────────────────────────────────
    const leftHeadlight = new THREE.SpotLight(0xffffee, 0, 150, Math.PI / 6, 0.5, 1.5);
    leftHeadlight.position.set(-1.5, 1.5, -3.5);
    leftHeadlight.target.position.set(-1.5, 0, -20);
    rootGroup.add(leftHeadlight);
    rootGroup.add(leftHeadlight.target);

    const rightHeadlight = new THREE.SpotLight(0xffffee, 0, 150, Math.PI / 6, 0.5, 1.5);
    rightHeadlight.position.set(1.5, 1.5, -3.5);
    rightHeadlight.target.position.set(1.5, 0, -20);
    rootGroup.add(rightHeadlight);
    rootGroup.add(rightHeadlight.target);

    rootGroup.userData.headlights = [leftHeadlight, rightHeadlight];

    // We no longer populate frontWheels or wheels since GLTF node names vary.
    // Wheels will remain static unless animated specially.
    rootGroup.userData.wheels = [];
    rootGroup.userData.frontWheels = [];

    // Enable shadows
    rootGroup.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

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
    
    // Toggle headlights based on theme
    if (carGroup.userData.headlights) {
      const isNight = window.SCENE && !SCENE.isDayTheme;
      const targetIntensity = isNight ? 3.0 : 0.0;
      carGroup.userData.headlights.forEach(hl => {
        hl.intensity = targetIntensity;
      });
    }

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
