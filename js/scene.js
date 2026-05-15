/**
 * scene.js — Three.js renderer, scene, and lighting setup.
 * Exports: window.SCENE
 */

window.SCENE = {

  /** @type {THREE.WebGLRenderer} */
  renderer: null,

  /** @type {THREE.Scene} */
  scene: null,

  /** @type {THREE.Clock} */
  clock: null,

  /**
   * Initialise the renderer, scene, clock, and lighting.
   * Must be called once before any rendering happens.
   */
  init() {
    const canvas = document.getElementById('gameCanvas');

    // ── Renderer ───────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.8;
    this.renderer = renderer;

    // ── Scene ──────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 100, 400);
    this.scene = scene;

    // ── Clock ──────────────────────────────────────────
    this.clock = new THREE.Clock();

    // ── Lighting ───────────────────────────────────────
    this.setupLighting();

    // ── Resize handler ─────────────────────────────────
    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);

      // Update camera aspect if one exists globally
      if (window.CAMERA_SYSTEM && window.CAMERA_SYSTEM.camera) {
        window.CAMERA_SYSTEM.camera.aspect = window.innerWidth / window.innerHeight;
        window.CAMERA_SYSTEM.camera.updateProjectionMatrix();
      }
    });
  },

  /**
   * Create and add all lights to the scene.
   */
  setupLighting() {
    // Soft overall ambient
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambient);

    // Main directional (sun)
    const sun = new THREE.DirectionalLight(0xfff5e0, 1.2);
    sun.position.set(100, 150, 100);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.left = -250;
    sun.shadow.camera.right = 250;
    sun.shadow.camera.top = 250;
    sun.shadow.camera.bottom = -250;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 500;
    this.scene.add(sun);

    // Sky / ground hemisphere fill
    const hemi = new THREE.HemisphereLight(0x87CEEB, 0x556832, 0.3);
    this.scene.add(hemi);
  },

  /**
   * Render a single frame.
   * @param {THREE.Camera} camera
   */
  render(camera) {
    this.renderer.render(this.scene, camera);
  },

  /**
   * Return the delta time (seconds) since the last getDelta() call.
   * @returns {number}
   */
  getDelta() {
    return this.clock.getDelta();
  }
};
