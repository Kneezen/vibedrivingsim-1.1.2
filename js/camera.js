/**
 * camera.js — Smooth follow camera with multiple view modes.
 * Dependencies: window.CONFIG, window.SCENE
 * Exports:      window.CAMERA_SYSTEM
 */

window.CAMERA_SYSTEM = {

  camera: null,
  mode: 'follow',
  targetPosition: new THREE.Vector3(),
  targetLookAt:   new THREE.Vector3(),
  currentLookAt:  new THREE.Vector3(),
  modeIndex: 0,
  modes: ['follow', 'hood', 'top'],

  // Track camera-toggle key so we fire once per press, not every frame
  _cameraKeyHeld: false,

  // ── Screen shake state ───────────────────────────
  _shakeIntensity: 0,
  _shakeDuration: 0,
  _shakeTimer: 0,

  // ────────────────────────────────────────────────────

  init() {
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 800);
    this.camera.position.set(0, 20, 30);

    window.addEventListener('resize', () => this.onResize());
  },

  // ────────────────────────────────────────────────────

  /**
   * Trigger a screen shake effect.
   * @param {number} intensity — max offset in world units (e.g. 0.5)
   * @param {number} duration  — how long the shake lasts in seconds
   */
  shake(intensity, duration) {
    // Allow stacking: keep the stronger of current vs new
    this._shakeIntensity = Math.max(this._shakeIntensity, intensity);
    this._shakeDuration = Math.max(this._shakeDuration, duration);
    this._shakeTimer = this._shakeDuration;
  },

  // ────────────────────────────────────────────────────

  /**
   * @param {CarEntity} carEntity
   * @param {number}    delta — seconds
   */
  update(carEntity, delta) {
    if (!carEntity || !this.camera) return;

    const cam     = this.camera;
    const carPos  = carEntity.mesh.position;
    const heading = carEntity.heading;
    const data    = carEntity.getData();
    const lerp    = CONFIG.CAMERA.LERP_SPEED;

    switch (this.mode) {

      // ── Third-person follow ──────────────────────
      case 'follow': {
        const dist   = CONFIG.CAMERA.DISTANCE;
        // Raise camera a bit at high speed for a wider view
        const speedBoost = (data.speed / 160) * 3;
        const height = CONFIG.CAMERA.HEIGHT + speedBoost;

        this.targetPosition.set(
          carPos.x + Math.sin(heading) * dist,
          carPos.y + height,
          carPos.z + Math.cos(heading) * dist
        );

        cam.position.lerp(this.targetPosition, lerp);

        this.targetLookAt.set(carPos.x, carPos.y + 2, carPos.z);
        this.currentLookAt.lerp(this.targetLookAt, lerp);
        cam.lookAt(this.currentLookAt);
        break;
      }

      // ── Hood / dashboard ─────────────────────────
      case 'hood': {
        const fwdX = -Math.sin(heading);
        const fwdZ = -Math.cos(heading);

        cam.position.set(
          carPos.x + fwdX * 1.5,
          carPos.y + 1.8,
          carPos.z + fwdZ * 1.5
        );

        this.targetLookAt.set(
          carPos.x + fwdX * 20,
          carPos.y + 1.5,
          carPos.z + fwdZ * 20
        );
        this.currentLookAt.lerp(this.targetLookAt, 0.15);
        cam.lookAt(this.currentLookAt);
        break;
      }

      // ── Top-down ─────────────────────────────────
      case 'top': {
        this.targetPosition.set(carPos.x, 60, carPos.z);
        cam.position.lerp(this.targetPosition, lerp);

        this.targetLookAt.set(carPos.x, 0, carPos.z);
        this.currentLookAt.lerp(this.targetLookAt, lerp);
        cam.lookAt(this.currentLookAt);
        break;
      }
    }

    // ── Apply screen shake offset ────────────────────
    if (this._shakeTimer > 0) {
      this._shakeTimer -= delta;
      // Ease out: shake fades as timer approaches 0
      const t = Math.max(0, this._shakeTimer / this._shakeDuration);
      const strength = this._shakeIntensity * t;

      cam.position.x += (Math.random() - 0.5) * 2 * strength;
      cam.position.y += (Math.random() - 0.5) * 2 * strength * 0.5;
      cam.position.z += (Math.random() - 0.5) * 2 * strength;

      if (this._shakeTimer <= 0) {
        this._shakeIntensity = 0;
        this._shakeDuration = 0;
      }
    }
  },

  // ────────────────────────────────────────────────────

  /**
   * Cycle to the next camera mode on key press (edge-triggered).
   * @param {Object} input — snapshot from CONTROLS.getInput()
   */
  cycleMode(input) {
    if (input.cameraToggle) {
      if (!this._cameraKeyHeld) {
        this._cameraKeyHeld = true;
        this.modeIndex = (this.modeIndex + 1) % this.modes.length;
        this.mode = this.modes[this.modeIndex];
      }
    } else {
      this._cameraKeyHeld = false;
    }
  },

  // ────────────────────────────────────────────────────

  onResize() {
    if (!this.camera) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
};

