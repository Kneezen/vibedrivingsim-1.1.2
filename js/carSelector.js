/**
 * carSelector.js — Car selection screen with 3D rotating previews
 * and stat bars.
 * Dependencies: window.CONFIG, window.CAR_MODELS
 * Exports:      window.CAR_SELECTOR
 */

window.CAR_SELECTOR = {

  selectedCarIndex: 0,
  onStart: null,
  previewRenderer: null,
  previewScene: null,
  previewCamera: null,
  previewCars: [],
  previewAnimFrame: null,
  currentPreviewIndex: 0,

  // ────────────────────────────────────────────────────

  init(onStartCallback) {
    this.onStart = onStartCallback;
    this.buildUI();
    this.initPreviewRenderer();
    this.buildArsenalTab();
    this.selectedCarIndex = 0;
  },

  // ────────────────────────────────────────────────────
  //  Build DOM
  // ────────────────────────────────────────────────────

  buildUI() {
    const container = document.getElementById('car-selector-container');

    container.innerHTML = `
      <p style="color:#888; font-family:monospace; margin-bottom:20px;
                letter-spacing:2px; text-align:center;">SELECT YOUR VEHICLE</p>
      <div id="preview-container" style="width:300px;height:160px;margin:0 auto 20px;
           border:2px solid rgba(0,255,204,0.3);border-radius:8px;overflow:hidden;
           background:#12121e;"></div>
      <div id="car-stats" style="width:300px;margin:0 auto 20px;font-family:monospace;
           font-size:12px;color:#ccc;"></div>
      <div class="car-grid" id="car-grid"></div>
      <div style="text-align:center; margin-top:30px;">
        <button id="start-btn">START DRIVING →</button>
      </div>
    `;

    // ── Car cards ────────────────────────────────────
    const grid = document.getElementById('car-grid');

    CONFIG.CARS.forEach((car, i) => {
      const card = document.createElement('div');
      card.className = 'car-card' + (i === 0 ? ' selected' : '');
      card.dataset.index = i;
      card.innerHTML = `
        <div style="font-size:32px">${car.emoji}</div>
        <div style="font-weight:bold;margin:8px 0">${car.name}</div>
        <div style="font-size:11px;color:#aaa">${car.description}</div>
      `;
      card.addEventListener('click', () => this.selectCar(i));
      grid.appendChild(card);
    });

    // ── Stats panel (initial) ────────────────────────
    this.renderStats(CONFIG.CARS[0]);

    // ── Start button ─────────────────────────────────
    document.getElementById('start-btn').addEventListener('click', () => {
      if (this.onStart) {
        this.onStart(CONFIG.CARS[this.selectedCarIndex]);
      }
      if (this.previewAnimFrame) {
        cancelAnimationFrame(this.previewAnimFrame);
        this.previewAnimFrame = null;
      }
      document.getElementById('main-menu-screen').style.display = 'none';
    });

    // ── Tab switching (handles all tabs including Arsenal) ──
    const navBtns = document.querySelectorAll('.nav-btn[data-tab]');
    navBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        // Deactivate all
        navBtns.forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

        // Activate clicked
        btn.classList.add('active');
        const tabId = `tab-${btn.dataset.tab}`;
        const pane = document.getElementById(tabId);
        if (pane) pane.classList.add('active');

        // Refresh Arsenal when switching to it
        if (btn.dataset.tab === 'arsenal') {
          this.buildArsenalTab();
        }
      });
    });
  },

  // ────────────────────────────────────────────────────
  //  Arsenal Tab
  // ────────────────────────────────────────────────────

  buildArsenalTab() {
    const grid = document.getElementById('arsenal-grid');
    if (!grid) return;

    const weapons = [
      {
        id: 'saw', name: 'Saw Blades', icon: '🪚', unlockLevel: 2, key: '1',
        desc: 'Throw spinning saw blades that bounce off buildings.',
        stats: { Damage: '15/hit', Range: '20m', Ammo: '3 blades', Recharge: '8s/blade' }
      },
      {
        id: 'machinegun', name: 'Machine Gun', icon: '🔫', unlockLevel: 4, key: '2',
        desc: 'Rapid-fire bullets with spread. Hold F to fire.',
        stats: { Damage: '3/bullet', Range: '40m', Ammo: '60 rounds', Reload: '2.5s' }
      },
      {
        id: 'oil', name: 'Oil Slick', icon: '🛢️', unlockLevel: 6, key: '3',
        desc: 'Drop an oil patch behind your car. Makes police spin out.',
        stats: { Effect: 'Spin 4s', Duration: '10s', Charges: '2', Recharge: '15s' }
      },
      {
        id: 'flamethrower', name: 'Flamethrower', icon: '🔥', unlockLevel: 8, key: '4',
        desc: 'Cone of fire ahead of your car. Hold F to spray.',
        stats: { Damage: '8/sec', Range: '12m', Fuel: '5s', Recharge: '~6s' }
      }
    ];

    grid.innerHTML = '';

    for (const w of weapons) {
      const unlocked = window.SAVE && SAVE.isWeaponUnlocked(w.id);
      const card = document.createElement('div');
      card.className = 'arsenal-card' + (unlocked ? ' unlocked' : ' locked');

      let statsHTML = '';
      for (const [k, v] of Object.entries(w.stats)) {
        statsHTML += `<div class="arsenal-stat"><span class="stat-label">${k}</span><span class="stat-value">${v}</span></div>`;
      }

      card.innerHTML = `
        <div class="arsenal-header">
          <span class="arsenal-icon">${w.icon}</span>
          <span class="arsenal-name">${w.name}</span>
          <span class="arsenal-key">[${w.key}]</span>
        </div>
        <div class="arsenal-desc">${w.desc}</div>
        <div class="arsenal-stats">${statsHTML}</div>
        <div class="arsenal-unlock-status">
          ${unlocked ? '✅ UNLOCKED' : `🔒 Complete Level ${w.unlockLevel} to unlock`}
        </div>
      `;

      grid.appendChild(card);
    }
  },

  // ────────────────────────────────────────────────────
  //  Stat bars
  // ────────────────────────────────────────────────────

  renderStats(car) {
    const el = document.getElementById('car-stats');
    if (!el) return;

    const bar = (label, value, color) => {
      const pct = Math.min(100, Math.round(value * 66));   // multiplier ~1.5 → 100%
      return `
        <div style="margin-bottom:6px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:2px;">
            <span>${label}</span><span style="color:${color}">${pct}%</span>
          </div>
          <div style="width:100%;height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:${color};border-radius:3px;
                        transition:width 0.3s;"></div>
          </div>
        </div>`;
    };

    el.innerHTML =
      bar('TOP SPEED',     car.maxSpeed,      '#00ffcc') +
      bar('ACCELERATION',  car.acceleration,  '#ffcc00') +
      bar('HANDLING',      car.handling,       '#44aaff');
  },

  // ────────────────────────────────────────────────────
  //  Select a car
  // ────────────────────────────────────────────────────

  selectCar(index) {
    this.selectedCarIndex = index;

    // Update card highlight
    const cards = document.querySelectorAll('#car-grid .car-card');
    cards.forEach((c, i) => {
      c.classList.toggle('selected', i === index);
    });

    // Update stats
    this.renderStats(CONFIG.CARS[index]);

    // Update 3D preview
    this.updatePreview(index);
  },

  // ────────────────────────────────────────────────────
  //  3D preview renderer
  // ────────────────────────────────────────────────────

  initPreviewRenderer() {
    const container = document.getElementById('preview-container');
    if (!container) return;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(300, 160);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    this.previewRenderer = renderer;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    this.previewScene = scene;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 8, 5);
    scene.add(dir);

    // Camera
    const camera = new THREE.PerspectiveCamera(50, 300 / 160, 0.1, 100);
    camera.position.set(0, 4, 12);
    camera.lookAt(0, 1, 0);
    this.previewCamera = camera;

    // Build all preview cars
    this.previewCars = CONFIG.CARS.map((cfg, i) => {
      const car = CAR_MODELS.buildCar(cfg);
      car.scale.set(0.9, 0.9, 0.9);
      car.visible = (i === 0);
      scene.add(car);
      return car;
    });

    this.currentPreviewIndex = 0;

    // Animation loop
    const animate = () => {
      this.previewAnimFrame = requestAnimationFrame(animate);
      const car = this.previewCars[this.currentPreviewIndex];
      if (car) car.rotation.y += 0.008;
      renderer.render(scene, camera);
    };
    animate();
  },

  // ────────────────────────────────────────────────────

  updatePreview(index) {
    this.previewCars.forEach((c, i) => {
      c.visible = (i === index);
      if (i === index) c.rotation.y = 0;     // reset rotation on switch
    });
    this.currentPreviewIndex = index;
  }
};

