/**
 * controls.js — Keyboard and touch input handling.
 * Exports: window.CONTROLS
 */

window.CONTROLS = {

  keys: {
    forward: false,
    backward: false,
    left: false,
    right: false,
    brake: false,
    horn: false,
    cameraToggle: false,
    weaponSlot1: false,
    weaponSlot2: false,
    weaponSlot3: false,
    weaponSlot4: false,
    fire: false
  },

  isMobile: false,
  touchStartX: 0,
  touchStartY: 0,

  // ────────────────────────────────────────────────────

  init() {
    this.isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

    const keyMap = {
      KeyW: 'forward',    ArrowUp: 'forward',
      KeyS: 'backward',   ArrowDown: 'backward',
      KeyA: 'left',       ArrowLeft: 'left',
      KeyD: 'right',      ArrowRight: 'right',
      Space: 'brake',
      KeyH: 'horn',
      KeyC: 'cameraToggle',
      Digit1: 'weaponSlot1',
      Digit2: 'weaponSlot2',
      Digit3: 'weaponSlot3',
      Digit4: 'weaponSlot4',
      KeyF: 'fire'
    };

    const blocked = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

    // ── Cheat code: "aezakmı" ──────────────────────
    const cheatCode = 'aezakmı';
    let cheatBuffer = '';

    window.addEventListener('keypress', e => {
      cheatBuffer += e.key;
      // Keep buffer trimmed to cheat code length
      if (cheatBuffer.length > cheatCode.length) {
        cheatBuffer = cheatBuffer.slice(-cheatCode.length);
      }
      if (cheatBuffer === cheatCode) {
        cheatBuffer = '';
        // Unlock all weapons
        if (window.SAVE) {
          SAVE.unlockWeapon('saw');
          SAVE.unlockWeapon('machinegun');
          SAVE.unlockWeapon('oil');
          SAVE.unlockWeapon('flamethrower');
          SAVE.save();
        }
        if (window.UI) {
          UI.showNotification('🔓 AEZAKMI — ALL WEAPONS UNLOCKED! 💀', 4000);
        }
        // Refresh arsenal tab if visible
        if (window.CAR_SELECTOR && CAR_SELECTOR.buildArsenalTab) {
          CAR_SELECTOR.buildArsenalTab();
        }
      }
    });

    window.addEventListener('keydown', e => {
      if (blocked.has(e.code)) e.preventDefault();

      if (e.code === 'Escape' && window.GAME) {
        if (GAME.isPaused) {
          GAME.resumeGame();
        } else if (GAME.isRunning) {
          GAME.pauseGame();
        }
        return;
      }
      if (e.code === 'KeyR' && window.GAME && window.GAME.isRunning) {
        window.GAME.resetCar();
        return;
      }

      const action = keyMap[e.code];
      if (action) this.keys[action] = true;
    });

    window.addEventListener('keyup', e => {
      const action = keyMap[e.code];
      if (action) this.keys[action] = false;
    });

    if (this.isMobile) this.initTouchControls();
  },

  // ────────────────────────────────────────────────────

  initTouchControls() {
    // Inject styles
    const style = document.createElement('style');
    style.textContent = `
      #mobile-controls { position:fixed; bottom:0; left:0; width:100%; z-index:20;
        pointer-events:none; display:flex; justify-content:space-between; padding:16px; }
      #mobile-controls .mc-group { pointer-events:auto; display:grid; gap:4px; }
      #mobile-controls .mc-dpad { grid-template-columns:60px 60px 60px; grid-template-rows:60px 60px; }
      #mobile-controls .mc-btn { width:60px; height:60px; border:none; border-radius:12px;
        background:rgba(255,255,255,0.15); color:#fff; font-size:22px; display:flex;
        align-items:center; justify-content:center; touch-action:none;
        -webkit-user-select:none; user-select:none; }
      #mobile-controls .mc-btn:active { background:rgba(0,255,204,0.3); }
      .mc-brake { width:80px!important; height:80px!important; border-radius:50%!important;
        font-size:14px!important; font-weight:bold; letter-spacing:1px; }
    `;
    document.head.appendChild(style);

    // Build DOM
    const wrap = document.createElement('div');
    wrap.id = 'mobile-controls';

    // D-pad (left side)
    const dpad = document.createElement('div');
    dpad.className = 'mc-group mc-dpad';
    const dirs = [
      { label: '▲', key: 'forward',  col: '2/3', row: '1/2' },
      { label: '◄', key: 'left',     col: '1/2', row: '2/3' },
      { label: '►', key: 'right',    col: '3/4', row: '2/3' },
      { label: '▼', key: 'backward', col: '2/3', row: '2/3' }
    ];

    dirs.forEach(d => {
      const btn = document.createElement('button');
      btn.className = 'mc-btn';
      btn.textContent = d.label;
      btn.style.gridColumn = d.col;
      btn.style.gridRow = d.row;
      btn.addEventListener('touchstart', e => { e.preventDefault(); this.keys[d.key] = true; });
      btn.addEventListener('touchend',   e => { e.preventDefault(); this.keys[d.key] = false; });
      btn.addEventListener('touchcancel', () => { this.keys[d.key] = false; });
      dpad.appendChild(btn);
    });

    // Brake (right side)
    const brakeGroup = document.createElement('div');
    brakeGroup.className = 'mc-group';
    brakeGroup.style.alignSelf = 'flex-end';
    const brakeBtn = document.createElement('button');
    brakeBtn.className = 'mc-btn mc-brake';
    brakeBtn.textContent = 'BRAKE';
    brakeBtn.addEventListener('touchstart', e => { e.preventDefault(); this.keys.brake = true; });
    brakeBtn.addEventListener('touchend',   e => { e.preventDefault(); this.keys.brake = false; });
    brakeBtn.addEventListener('touchcancel', () => { this.keys.brake = false; });
    brakeGroup.appendChild(brakeBtn);

    wrap.appendChild(dpad);
    wrap.appendChild(brakeGroup);
    document.body.appendChild(wrap);
  },

  // ────────────────────────────────────────────────────

  getInput() {
    return { ...this.keys };
  }
};
