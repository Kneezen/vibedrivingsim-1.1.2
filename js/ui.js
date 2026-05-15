/**
 * ui.js — HUD elements: speedometer, gear indicator, minimap,
 * controls hint, notifications, and loading screen.
 * Dependencies: window.CONFIG
 * Exports:      window.UI
 */

window.UI = {

  elements: {},
  minimapCanvas: null,
  minimapCtx: null,
  lastNotification: null,

  // ────────────────────────────────────────────────────

  init() {
    this.elements.uiOverlay = document.getElementById('ui-overlay');
    this.buildHUD();
    this.buildMinimap();
    this.buildControlsHint();
    this.buildLevelHUD();
    this.buildWeaponHUD();
  },

  // ────────────────────────────────────────────────────
  //  HUD construction
  // ────────────────────────────────────────────────────

  buildHUD() {
    const overlay = this.elements.uiOverlay;

    // ── Speedometer ──────────────────────────────────
    let speedo = document.getElementById('speedometer');
    if (!speedo) {
      speedo = document.createElement('div');
      speedo.id = 'speedometer';
      overlay.appendChild(speedo);
    }

    // Speed value
    let speedVal = document.getElementById('speed-value');
    if (!speedVal) {
      speedVal = document.createElement('div');
      speedVal.id = 'speed-value';
      speedVal.textContent = '0';
      speedo.appendChild(speedVal);
    }
    this.elements.speedValue = speedVal;

    // Speed label
    let speedLabel = document.getElementById('speed-label');
    if (!speedLabel) {
      speedLabel = document.createElement('div');
      speedLabel.id = 'speed-label';
      speedLabel.textContent = 'KM/H';
      speedo.appendChild(speedLabel);
    }

    // RPM bar container
    let rpmBar = document.getElementById('rpm-bar');
    if (!rpmBar) {
      rpmBar = document.createElement('div');
      rpmBar.id = 'rpm-bar';
      Object.assign(rpmBar.style, {
        width: '80%', height: '4px', background: 'rgba(255,255,255,0.15)',
        borderRadius: '2px', marginTop: '6px', overflow: 'hidden'
      });
      const rpmFill = document.createElement('div');
      rpmFill.id = 'rpm-fill';
      Object.assign(rpmFill.style, {
        width: '0%', height: '100%',
        background: 'linear-gradient(90deg, #00ffcc, #ff4444)',
        borderRadius: '2px', transition: 'width 0.08s'
      });
      rpmBar.appendChild(rpmFill);
      speedo.appendChild(rpmBar);
    }
    this.elements.rpmFill = document.getElementById('rpm-fill');

    // ── Gear indicator ───────────────────────────────
    let gear = document.getElementById('gear-indicator');
    if (!gear) {
      gear = document.createElement('div');
      gear.id = 'gear-indicator';
      gear.textContent = '[N]';
      overlay.appendChild(gear);
    }
    this.elements.gearIndicator = gear;

    // ── Skid indicator ───────────────────────────────
    let skid = document.getElementById('skid-indicator');
    if (!skid) {
      skid = document.createElement('div');
      skid.id = 'skid-indicator';
      skid.textContent = 'SKID!';
      Object.assign(skid.style, {
        position: 'absolute', top: '80px', left: '50%',
        transform: 'translateX(-50%)',
        color: '#ff3333', fontSize: '22px', fontWeight: 'bold',
        fontFamily: 'monospace', letterSpacing: '4px',
        textShadow: '0 0 10px rgba(255,50,50,0.6)',
        display: 'none', pointerEvents: 'none'
      });
      overlay.appendChild(skid);
    }
    this.elements.skidIndicator = skid;

    // ── Menu / Reset Buttons ─────────────────────────
    let btnContainer = document.getElementById('hud-buttons');
    if (!btnContainer) {
      btnContainer = document.createElement('div');
      btnContainer.id = 'hud-buttons';
      Object.assign(btnContainer.style, {
        position: 'absolute', top: '190px', left: '20px',
        display: 'flex', gap: '10px'
      });
      
      const btnStyle = {
        padding: '8px 16px', background: 'rgba(0,0,0,0.6)',
        border: '1px solid #00ffcc', color: '#00ffcc',
        fontFamily: 'monospace', fontSize: '14px',
        cursor: 'pointer', borderRadius: '4px',
        transition: 'all 0.2s', pointerEvents: 'auto'
      };

      const resetBtn = document.createElement('button');
      resetBtn.textContent = '⟲ RESET';
      Object.assign(resetBtn.style, btnStyle);
      resetBtn.onmouseover = () => resetBtn.style.background = 'rgba(0,255,204,0.2)';
      resetBtn.onmouseout = () => resetBtn.style.background = 'rgba(0,0,0,0.6)';
      resetBtn.onclick = () => window.GAME && window.GAME.resetCar();

      const menuBtn = document.createElement('button');
      menuBtn.textContent = '☰ MENU';
      Object.assign(menuBtn.style, btnStyle);
      menuBtn.onmouseover = () => menuBtn.style.background = 'rgba(0,255,204,0.2)';
      menuBtn.onmouseout = () => menuBtn.style.background = 'rgba(0,0,0,0.6)';
      menuBtn.onclick = () => window.GAME && window.GAME.showMenu();

      btnContainer.appendChild(menuBtn);
      btnContainer.appendChild(resetBtn);
      overlay.appendChild(btnContainer);
    }
  },

  // ────────────────────────────────────────────────────
  //  Minimap
  // ────────────────────────────────────────────────────

  buildMinimap() {
    let container = document.getElementById('minimap');
    if (!container) {
      container = document.createElement('div');
      container.id = 'minimap';
      this.elements.uiOverlay.appendChild(container);
    }

    const canvas = document.createElement('canvas');
    canvas.id = 'minimap-canvas';
    canvas.width = 150;
    canvas.height = 150;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    this.minimapCanvas = canvas;
    this.minimapCtx = canvas.getContext('2d');
  },

  // ────────────────────────────────────────────────────
  //  Controls hint
  // ────────────────────────────────────────────────────

  buildControlsHint() {
    let hint = document.getElementById('controls-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'controls-hint';
      this.elements.uiOverlay.appendChild(hint);
    }
    hint.innerHTML = [
      'W / ↑ — Accelerate',
      'S / ↓ — Brake / Reverse',
      'A / ← — Steer Left',
      'D / → — Steer Right',
      'SPACE — Handbrake',
      'C — Camera Mode',
      'H — Horn',
      '1-4 — Weapon Slot',
      'F — Fire Weapon',
      'R — Reset Car',
      'ESC — Menu'
    ].join('<br>');
  },

  // ────────────────────────────────────────────────────
  //  Weapon HUD
  // ────────────────────────────────────────────────────

  buildWeaponHUD() {
    const overlay = this.elements.uiOverlay;

    let bar = document.getElementById('weapon-hud');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'weapon-hud';
      overlay.appendChild(bar);
    }

    const weapons = [
      { id: 'saw',          key: '1', icon: '🪚', name: 'Saw' },
      { id: 'machinegun',   key: '2', icon: '🔫', name: 'MG' },
      { id: 'oil',          key: '3', icon: '🛢️', name: 'Oil' },
      { id: 'flamethrower', key: '4', icon: '🔥', name: 'Flame' }
    ];

    bar.innerHTML = '';
    for (const w of weapons) {
      const slot = document.createElement('div');
      slot.className = 'weapon-slot';
      slot.id = `weapon-slot-${w.id}`;
      slot.innerHTML = `
        <div class="weapon-key">${w.key}</div>
        <div class="weapon-icon">${w.icon}</div>
        <div class="weapon-name">${w.name}</div>
        <div class="weapon-ammo" id="weapon-ammo-${w.id}"></div>
        <div class="weapon-cooldown-overlay" id="weapon-cd-${w.id}"></div>
      `;
      bar.appendChild(slot);
    }

    this.elements.weaponHUD = bar;
  },

  updateWeaponHUD(state) {
    if (!state || !this.elements.weaponHUD) return;

    const weapons = ['saw', 'machinegun', 'oil', 'flamethrower'];

    for (const wId of weapons) {
      const slot = document.getElementById(`weapon-slot-${wId}`);
      const ammoEl = document.getElementById(`weapon-ammo-${wId}`);
      const cdEl = document.getElementById(`weapon-cd-${wId}`);
      if (!slot) continue;

      const unlocked = window.SAVE && SAVE.isWeaponUnlocked(wId);
      const isEquipped = state.equipped === wId;

      // Lock/unlock state
      slot.classList.toggle('locked', !unlocked);
      slot.classList.toggle('equipped', isEquipped);

      if (!unlocked) {
        if (ammoEl) ammoEl.textContent = '🔒';
        if (cdEl) cdEl.style.height = '100%';
        continue;
      }

      if (cdEl) cdEl.style.height = '0%';

      // Ammo display per weapon type
      if (ammoEl) {
        switch (wId) {
          case 'saw':
            ammoEl.textContent = `${state.saw.ammo}/${state.saw.maxAmmo}`;
            break;
          case 'machinegun':
            if (state.machinegun.reloading) {
              ammoEl.textContent = 'RELOAD';
              ammoEl.style.color = '#ff8800';
            } else {
              ammoEl.textContent = `${state.machinegun.ammo}/${state.machinegun.maxAmmo}`;
              ammoEl.style.color = '';
            }
            break;
          case 'oil':
            ammoEl.textContent = `${state.oil.charges}/${state.oil.maxCharges}`;
            break;
          case 'flamethrower': {
            const pct = Math.round((state.flamethrower.fuel / state.flamethrower.maxFuel) * 100);
            ammoEl.textContent = `${pct}%`;
            if (state.flamethrower.active) ammoEl.style.color = '#ff4400';
            else ammoEl.style.color = '';
            break;
          }
        }
      }

      // Cooldown overlay for recharging weapons
      if (cdEl) {
        let cdPct = 0;
        if (wId === 'saw' && state.saw.recharging) cdPct = 30;
        if (wId === 'machinegun' && state.machinegun.reloading) {
          cdPct = (1 - state.machinegun.reloadProgress) * 100;
        }
        if (wId === 'oil' && state.oil.recharging) cdPct = 30;
        cdEl.style.height = cdPct + '%';
      }
    }
  },

  // ────────────────────────────────────────────────────
  //  Level HUD (timer, coin counter, level indicator)
  // ────────────────────────────────────────────────────

  buildLevelHUD() {
    const overlay = this.elements.uiOverlay;

    // Timer
    let timer = document.getElementById('level-timer');
    if (!timer) {
      timer = document.createElement('div');
      timer.id = 'level-timer';
      timer.textContent = '0:00';
      timer.style.display = 'none';
      overlay.appendChild(timer);
    }
    this.elements.levelTimer = timer;

    // Coin counter
    let coinCounter = document.getElementById('coin-counter');
    if (!coinCounter) {
      coinCounter = document.createElement('div');
      coinCounter.id = 'coin-counter';
      coinCounter.textContent = '🪙 0 / 0';
      coinCounter.style.display = 'none';
      overlay.appendChild(coinCounter);
    }
    this.elements.coinCounter = coinCounter;

    // Level indicator
    let levelInd = document.getElementById('level-indicator');
    if (!levelInd) {
      levelInd = document.createElement('div');
      levelInd.id = 'level-indicator';
      levelInd.textContent = 'LEVEL 1';
      levelInd.style.display = 'none';
      overlay.appendChild(levelInd);
    }
    this.elements.levelIndicator = levelInd;

    // Crush counter (for police system)
    let crushCounter = document.getElementById('crush-counter');
    if (!crushCounter) {
      crushCounter = document.createElement('div');
      crushCounter.id = 'crush-counter';
      crushCounter.textContent = '💀 0 / 10';
      Object.assign(crushCounter.style, {
        position: 'absolute', top: '155px', right: '20px',
        color: '#ff4444', fontSize: '18px', fontFamily: 'monospace',
        fontWeight: 'bold', letterSpacing: '1px',
        textShadow: '0 0 8px rgba(255,50,50,0.4)',
        display: 'none', pointerEvents: 'none'
      });
      overlay.appendChild(crushCounter);
    }
    this.elements.crushCounter = crushCounter;
  },

  /**
   * Update level HUD elements each frame.
   * @param {Object} levelData — { level, timeRemaining, coinsCollected, coinsTotal }
   */
  updateLevelHUD(levelData) {
    if (!levelData) return;

    // Timer
    const t = Math.max(0, Math.ceil(levelData.timeRemaining));
    const mins = Math.floor(t / 60);
    const secs = t % 60;
    const timerEl = this.elements.levelTimer;
    if (timerEl) {
      timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
      timerEl.style.display = 'block';
      if (t <= 10) {
        timerEl.classList.add('low-time');
      } else {
        timerEl.classList.remove('low-time');
      }
    }

    // Coin counter
    const coinEl = this.elements.coinCounter;
    if (coinEl) {
      coinEl.textContent = `🪙 ${levelData.coinsCollected} / ${levelData.coinsTotal}`;
      coinEl.style.display = 'block';
    }

    // Level indicator
    const lvlEl = this.elements.levelIndicator;
    if (lvlEl) {
      lvlEl.textContent = `LEVEL ${levelData.level}`;
      lvlEl.style.display = 'block';
    }
  },

  /**
   * Hide the level HUD elements (for menu/game-over).
   */
  hideLevelHUD() {
    if (this.elements.levelTimer)     this.elements.levelTimer.style.display = 'none';
    if (this.elements.coinCounter)    this.elements.coinCounter.style.display = 'none';
    if (this.elements.levelIndicator) this.elements.levelIndicator.style.display = 'none';
    if (this.elements.crushCounter)   this.elements.crushCounter.style.display = 'none';
  },

  /**
   * Update the crush counter display.
   * @param {number} current — current crush count
   * @param {number} threshold — kills needed for police
   */
  updateCrushCounter(current, baseThreshold) {
    const el = this.elements.crushCounter;
    if (!el) return;
    
    // Calculate the next threshold for the UI display
    const nextThreshold = Math.max(baseThreshold, Math.ceil((current + 1) / baseThreshold) * baseThreshold);
    
    el.textContent = `💀 ${current} / ${nextThreshold}`;
    el.style.display = 'block';

    // Flash red when getting close
    if (current >= nextThreshold - 2 && current < nextThreshold) {
      el.style.color = '#ff8800';
      el.style.textShadow = '0 0 12px rgba(255,136,0,0.6)';
    } else if (current > 0 && current % baseThreshold === 0) {
      el.style.color = '#ff0000';
      el.style.textShadow = '0 0 16px rgba(255,0,0,0.8)';
    } else {
      el.style.color = '#ff4444';
      el.style.textShadow = '0 0 8px rgba(255,50,50,0.4)';
    }
  },

  // ────────────────────────────────────────────────────
  //  Level complete banner
  // ────────────────────────────────────────────────────

  showLevelComplete() {
    const banner = document.getElementById('level-complete-banner');
    if (!banner) return;
    banner.classList.remove('show');
    // Force reflow to restart animation
    void banner.offsetWidth;
    banner.classList.add('show');
    setTimeout(() => banner.classList.remove('show'), 2200);
  },

  // ────────────────────────────────────────────────────
  //  Game Over overlay
  // ────────────────────────────────────────────────────

  showGameOver(levelReached, coinsCollected, coinsTotal) {
    const screen = document.getElementById('game-over-screen');
    if (!screen) return;

    const stats = document.getElementById('game-over-stats');
    if (stats) {
      stats.innerHTML = `
        LEVEL REACHED: <span>${levelReached}</span><br>
        COINS COLLECTED: <span>${coinsCollected} / ${coinsTotal}</span>
      `;
    }

    // Show with animation
    screen.style.display = 'flex';
    requestAnimationFrame(() => {
      screen.classList.add('visible');
    });
  },

  hideGameOver() {
    const screen = document.getElementById('game-over-screen');
    if (!screen) return;
    screen.classList.remove('visible');
    screen.style.display = 'none';
  },

  // ────────────────────────────────────────────────────
  //  Per-frame update
  // ────────────────────────────────────────────────────

  /**
   * @param {Object} carData   — from CarEntity.getData()
   * @param {Object} cityData  — { buildings, roadNetwork }
   */
  update(carData, cityData) {
    // Speed
    this.elements.speedValue.textContent = carData.speed;

    // Gear
    const gearColors = { D: '#00ffcc', R: '#ff4444', N: '#ffcc00' };
    this.elements.gearIndicator.textContent = `[${carData.gear}]`;
    this.elements.gearIndicator.style.color = gearColors[carData.gear] || '#ffffff';

    // RPM bar (0-8000 mapped to 0-100%)
    const rpmPct = Math.min(100, (carData.rpm / 8000) * 100);
    this.elements.rpmFill.style.width = rpmPct + '%';

    // Skid indicator
    this.elements.skidIndicator.style.display = carData.skidding ? 'block' : 'none';

    // Minimap
    this.updateMinimap(carData, cityData);
  },

  // ────────────────────────────────────────────────────
  //  Minimap rendering
  // ────────────────────────────────────────────────────

  updateMinimap(carData, cityData) {
    const ctx = this.minimapCtx;
    if (!ctx) return;

    const S = 150;
    const W = CONFIG.MAP_SIZE;       // 500
    const scale = S / W;             // 0.3

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, S, S);

    // Roads
    ctx.fillStyle = '#444444';
    cityData.roadNetwork.forEach(r => {
      ctx.fillRect(
        (r.x + W / 2) * scale,
        (r.z + W / 2) * scale,
        r.w * scale,
        r.h * scale
      );
    });

    // Buildings
    ctx.fillStyle = '#666688';
    cityData.buildings.forEach(b => {
      ctx.fillRect(
        (b.x - b.width / 2 + W / 2) * scale,
        (b.z - b.depth / 2 + W / 2) * scale,
        b.width * scale,
        b.depth * scale
      );
    });

    // Coins
    if (window.COINS && window.COINS.coins) {
      ctx.fillStyle = '#ffd700';
      window.COINS.coins.forEach(c => {
        if (!c.collected) {
          ctx.beginPath();
          ctx.arc(
            (c.x + W / 2) * scale,
            (c.z + W / 2) * scale,
            2, // radius on minimap
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      });
    }

    // Player car arrow
    const mx = (carData.position.x + W / 2) * scale;
    const mz = (carData.position.z + W / 2) * scale;
    const h  = carData.heading;
    const sz = 5;

    ctx.save();
    ctx.translate(mx, mz);
    ctx.rotate(-h);
    ctx.fillStyle = '#00ffcc';
    ctx.beginPath();
    ctx.moveTo(0, -sz);
    ctx.lineTo(-sz * 0.6, sz * 0.5);
    ctx.lineTo(sz * 0.6, sz * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Police cars (blinking red/blue dots)
    if (window.POLICE && POLICE.getPositions) {
      const policePositions = POLICE.getPositions();
      if (policePositions && policePositions.length > 0) {
        const blink = Math.sin(Date.now() * 0.01) > 0;
        
        for (const pos of policePositions) {
          const px = (pos.x + W / 2) * scale;
          const pz = (pos.z + W / 2) * scale;
          
          ctx.fillStyle = blink ? '#ff0000' : '#0044ff';
          ctx.beginPath();
          ctx.arc(px, pz, 3, 0, Math.PI * 2);
          ctx.fill();
          
          // Outer glow
          ctx.strokeStyle = blink ? 'rgba(255,0,0,0.4)' : 'rgba(0,68,255,0.4)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(px, pz, 5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
  },

  // ────────────────────────────────────────────────────
  //  Notifications
  // ────────────────────────────────────────────────────

  showNotification(message, duration) {
    duration = duration || 2500;

    let note = document.getElementById('notification');
    if (!note) {
      note = document.createElement('div');
      note.id = 'notification';
      Object.assign(note.style, {
        position: 'fixed', top: '50px', left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.75)', color: '#ffffff',
        padding: '12px 28px', borderRadius: '8px',
        fontSize: '16px', fontFamily: 'monospace',
        letterSpacing: '1px', zIndex: '600',
        transition: 'opacity 0.4s',
        backdropFilter: 'blur(6px)',
        border: '1px solid rgba(255,255,255,0.1)',
        pointerEvents: 'none'
      });
      document.body.appendChild(note);
    }

    // Clear previous timer
    if (this.lastNotification) clearTimeout(this.lastNotification);

    note.textContent = message;
    note.style.opacity = '1';
    note.style.display = 'block';

    this.lastNotification = setTimeout(() => {
      note.style.opacity = '0';
      setTimeout(() => { note.style.display = 'none'; }, 400);
    }, duration);
  },

  // ────────────────────────────────────────────────────
  //  Loading screen
  // ────────────────────────────────────────────────────

  hideLoading() {
    const el = document.getElementById('loading-screen');
    if (el) el.style.display = 'none';
  },

  showLoading() {
    const el = document.getElementById('loading-screen');
    if (el) el.style.display = 'flex';
  }
};
