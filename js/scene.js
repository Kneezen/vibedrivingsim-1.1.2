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
    scene.background = new THREE.Color(0x1a1a2e); // Night sky
    scene.fog = new THREE.FogExp2(0x1a1a2e, 0.004); // Night fog
    this.scene = scene;

    // ── Clock ──────────────────────────────────────────
    this.clock = new THREE.Clock();

    // ── Lighting ───────────────────────────────────────
    this.setupLighting();

    // Default to Day Theme
    this.setTheme(true);

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
    // Ambient light
    this.ambientLight = new THREE.AmbientLight(0x222244, 1.5);
    this.scene.add(this.ambientLight);

    // Main directional
    this.dirLight = new THREE.DirectionalLight(0x8899bb, 0.6);
    this.dirLight.position.set(100, 150, 100);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.left = -250;
    this.dirLight.shadow.camera.right = 250;
    this.dirLight.shadow.camera.top = 250;
    this.dirLight.shadow.camera.bottom = -250;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 500;
    // Bias to prevent shadow acne
    this.dirLight.shadow.bias = -0.001;
    this.scene.add(this.dirLight);

    // Sky / ground hemisphere fill
    this.hemiLight = new THREE.HemisphereLight(0x1a1a2e, 0x050508, 0.5);
    this.scene.add(this.hemiLight);
  },

  /**
   * Toggle between day and night theme
   * @param {boolean} isDay 
   */
  setTheme(isDay) {
    this.isDayTheme = isDay;

    if (isDay) {
      this.scene.background = new THREE.Color(0x87CEEB);
      this.scene.fog = new THREE.FogExp2(0x87CEEB, 0.003); // Day fog
      this.ambientLight.color.setHex(0xffffff);
      this.ambientLight.intensity = 0.4;
      this.dirLight.color.setHex(0xfff5e0);
      this.dirLight.intensity = 1.2;
      this.hemiLight.color.setHex(0x87CEEB);
      this.hemiLight.groundColor.setHex(0x556832);
      this.hemiLight.intensity = 0.3;
    } else {
      this.scene.background = new THREE.Color(0x1a1a2e); // Night sky
      this.scene.fog = new THREE.FogExp2(0x1a1a2e, 0.004); // Night fog
      this.ambientLight.color.setHex(0x222244);
      this.ambientLight.intensity = 1.5;
      this.dirLight.color.setHex(0x8899bb);
      this.dirLight.intensity = 0.6;
      this.hemiLight.color.setHex(0x1a1a2e);
      this.hemiLight.groundColor.setHex(0x050508);
      this.hemiLight.intensity = 0.5;
    }

    if (window.CITY && CITY.streetLights) {
      CITY.streetLights.forEach(l => l.intensity = isDay ? 0 : 0.8);
    }
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
