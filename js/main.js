/**
 * main.js — Game orchestrator: boots every subsystem and
 * runs the core update → camera → UI → render loop.
 * Dependencies: CONFIG, SCENE, CITY, CAR, CONTROLS,
 *               CAMERA_SYSTEM, UI, CAR_SELECTOR, COINS
 * Exports:      window.GAME
 */

window.GAME = {

  activeCar: null,
  isRunning: false,
  isPaused: false,
  animFrameId: null,
  lastCameraToggle: false,
  totalTime: 0,

  // ── Level state ─────────────────────────────────────
  currentLevel: 0,        // 0-indexed into CONFIG.LEVELS
  levelTimer: 0,          // seconds remaining
  gameOver: false,
  gameOverShown: false,
  levelTransitioning: false,
  selectedCarConfig: null, // remember which car was selected
  gameOverTimeout: null,   // pending game-over setTimeout ID

  // ────────────────────────────────────────────────────
  //  Bootstrap
  // ────────────────────────────────────────────────────

  init() {
    UI.showLoading();

    // Core systems
    SCENE.init();
    CITY.init();
    CONTROLS.init();
    CAMERA_SYSTEM.init();
    UI.init();

    // Load saved progress
    if (window.SAVE) {
      SAVE.load();
    }

    // Car selector — pass start callback
    CAR_SELECTOR.init(selectedCarConfig => {
      GAME.startGame(selectedCarConfig);
    });

    // Retry button
    const retryBtn = document.getElementById('retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => GAME.retry());
    }

    // Pause menu buttons
    const resumeBtn = document.getElementById('resume-btn');
    if (resumeBtn) {
      resumeBtn.addEventListener('click', () => GAME.resumeGame());
    }
    const mainMenuBtn = document.getElementById('main-menu-btn');
    if (mainMenuBtn) {
      mainMenuBtn.addEventListener('click', () => GAME.showMenu());
    }

    // Hide loading after a brief dramatic pause
    setTimeout(() => {
      UI.hideLoading();
    }, 800);

    GAME.initMainMenu();
  },

  // ────────────────────────────────────────────────────
  //  Start / restart with a chosen car
  // ────────────────────────────────────────────────────

  startGame(carConfig) {
    // Pause background music
    if (GAME.bgMusic) {
      GAME.bgMusic.pause();
    }

    // Remove previous car if any
    if (GAME.activeCar) {
      GAME.activeCar.removeFromScene();
    }

    // Store the selected car for retry
    GAME.selectedCarConfig = carConfig;

    // Reset game state
    GAME.gameOver = false;
    GAME.gameOverShown = false;
    GAME.levelTransitioning = false;
    GAME.currentLevel = 0;

    // Reset pedestrians
    if (window.CITY && CITY.revivePedestrians) {
      CITY.revivePedestrians();
    }

    // Create new car entity
    GAME.activeCar = new CAR.CarEntity(carConfig);

    // Place on a valid road
    const spawn = CITY.getValidSpawnPoint();
    GAME.activeCar.setPosition(spawn.x, spawn.z);
    GAME.activeCar.addToScene();

    GAME.isRunning = true;

    // Hide game over screen if visible
    UI.hideGameOver();

    document.getElementById('ui-overlay').style.display = 'block';
    UI.showNotification(`🚗 ${carConfig.name} — LET'S RIDE!`);

    // Ensure we don't stack animation loops
    if (GAME.animFrameId) {
      cancelAnimationFrame(GAME.animFrameId);
      GAME.animFrameId = null;
    }

    // Mark as transitioning until level starts (prevents instant game-over)
    GAME.levelTransitioning = true;

    // Start at level 1 after intro notification
    setTimeout(() => GAME.startLevel(0), 1000);

    // Kick off the loop
    GAME.gameLoop();
  },

  // ────────────────────────────────────────────────────
  //  Level management
  // ────────────────────────────────────────────────────

  startLevel(levelIndex) {
    // Clamp to available levels
    if (levelIndex >= CONFIG.LEVELS.length) {
      // Player beat all levels!
      UI.showNotification('🏆 YOU BEAT ALL LEVELS! CONGRATULATIONS!', 5000);
      return;
    }

    GAME.currentLevel = levelIndex;
    GAME.levelTransitioning = false;

    const levelConfig = CONFIG.LEVELS[levelIndex];
    GAME.levelTimer = levelConfig.timeSeconds;

    // Clear and spawn new coins
    COINS.clear();
    COINS.spawnCoins(levelConfig.coins);

    // Reset police car and crush counter for the new level
    if (window.POLICE && POLICE.reset) {
      POLICE.reset();
    }

    // Reset weapons for the new level
    if (window.WEAPONS && WEAPONS.reset) {
      WEAPONS.reset();
    }

    UI.showNotification(`⭐ LEVEL ${levelConfig.level} — Collect ${levelConfig.coins} coins!`, 3000);
  },

  // ────────────────────────────────────────────────────
  //  Main game loop
  // ────────────────────────────────────────────────────

  gameLoop() {
    GAME.animFrameId = requestAnimationFrame(GAME.gameLoop);

    if (!GAME.isRunning) return;

    // Delta (capped to prevent spiral-of-death on tab switch)
    const delta = Math.min(SCENE.getDelta(), 0.05);
    GAME.totalTime += delta;

    // ── Input ────────────────────────────────────────
    const input = CONTROLS.getInput();

    // ── Camera mode toggle (edge-triggered) ──────────
    if (input.cameraToggle && !GAME.lastCameraToggle) {
      CAMERA_SYSTEM.modeIndex = (CAMERA_SYSTEM.modeIndex + 1) % CAMERA_SYSTEM.modes.length;
      CAMERA_SYSTEM.mode = CAMERA_SYSTEM.modes[CAMERA_SYSTEM.modeIndex];
      UI.showNotification(`Camera: ${CAMERA_SYSTEM.mode.toUpperCase()}`);
    }
    GAME.lastCameraToggle = input.cameraToggle;

    // ── Update car physics ───────────────────────────
    GAME.activeCar.update(delta, input);

    // ── Weapon input handling ─────────────────────────
    if (window.WEAPONS) {
      // Equip weapon slots (edge-triggered)
      if (input.weaponSlot1 && !GAME._lastWeapon1) WEAPONS.equip('saw');
      if (input.weaponSlot2 && !GAME._lastWeapon2) WEAPONS.equip('machinegun');
      if (input.weaponSlot3 && !GAME._lastWeapon3) WEAPONS.equip('oil');
      if (input.weaponSlot4 && !GAME._lastWeapon4) WEAPONS.equip('flamethrower');
      GAME._lastWeapon1 = input.weaponSlot1;
      GAME._lastWeapon2 = input.weaponSlot2;
      GAME._lastWeapon3 = input.weaponSlot3;
      GAME._lastWeapon4 = input.weaponSlot4;

      // Fire
      if (input.fire && !GAME.gameOver) {
        WEAPONS.fire(GAME.activeCar, delta, input.fire);
      } else {
        WEAPONS.stopFire();
      }

      // Update projectiles and effects
      WEAPONS.update(delta, GAME.activeCar);
    }

    // ── Update pedestrians ───────────────────────────
    if (window.CITY && CITY.updatePedestrians) {
      CITY.updatePedestrians(delta, GAME.activeCar);
    }

    // ── Update police chase ──────────────────────────
    if (window.POLICE && POLICE.update) {
      POLICE.update(delta, GAME.activeCar);
    }

    // ── Level logic (timer + coins) ──────────────────
    if (!GAME.gameOver && !GAME.levelTransitioning) {
      // Update coins
      COINS.update(delta, GAME.activeCar);

      // Decrement timer
      GAME.levelTimer -= delta;

      // Check win condition
      if (COINS.allCollected()) {
        GAME.levelTransitioning = true;
        UI.showLevelComplete();

        // Save progress and check weapon unlocks
        if (window.SAVE) {
          const newWeapon = SAVE.onLevelComplete(GAME.currentLevel);
          SAVE.save();
          if (newWeapon) {
            const weaponNames = { saw: 'Saw Blades 🪚', machinegun: 'Machine Gun 🔫', oil: 'Oil Slick 🛢️', flamethrower: 'Flamethrower 🔥' };
            setTimeout(() => {
              UI.showNotification(`🔓 NEW WEAPON UNLOCKED: ${weaponNames[newWeapon] || newWeapon}!`, 4000);
            }, 1200);
          }
        }

        // Advance to next level after animation
        setTimeout(() => {
          GAME.startLevel(GAME.currentLevel + 1);
        }, 2500);
      }

      // Check lose condition
      if (GAME.levelTimer <= 0 && !GAME.gameOver) {
        GAME.levelTimer = 0;
        GAME.gameOver = true;

        // Explode the car!
        GAME.activeCar.explode();

        // Show game over after a dramatic pause
        GAME.gameOverTimeout = setTimeout(() => {
          const coinState = COINS.getState();
          const levelReached = CONFIG.LEVELS[GAME.currentLevel].level;
          UI.showGameOver(levelReached, coinState.collected, coinState.total);
          GAME.gameOverShown = true;
        }, 2000);
      }
    }

    // ── Update camera ────────────────────────────────
    CAMERA_SYSTEM.update(GAME.activeCar, delta);

    // ── Update HUD ───────────────────────────────────
    const carData = GAME.activeCar.getData();
    UI.update(carData, {
      buildings:   CITY.buildings,
      roadNetwork: CITY.roadNetwork
    });

    // Update level HUD
    if (!GAME.gameOver) {
      const coinState = COINS.getState();
      UI.updateLevelHUD({
        level: CONFIG.LEVELS[GAME.currentLevel] ? CONFIG.LEVELS[GAME.currentLevel].level : 1,
        timeRemaining: GAME.levelTimer,
        coinsCollected: coinState.collected,
        coinsTotal: coinState.total
      });
    }

    // Update weapon HUD
    if (window.WEAPONS && window.UI && UI.updateWeaponHUD) {
      UI.updateWeaponHUD(WEAPONS.getState());
    }

    // ── Render ───────────────────────────────────────
    SCENE.render(CAMERA_SYSTEM.camera);
  },

  // ────────────────────────────────────────────────────
  //  Retry — restart from level 1 with same car
  // ────────────────────────────────────────────────────

  retry() {
    if (!GAME.selectedCarConfig) return;

    // Cancel any pending game-over timeout from previous round
    if (GAME.gameOverTimeout) {
      clearTimeout(GAME.gameOverTimeout);
      GAME.gameOverTimeout = null;
    }

    // IMMEDIATELY prevent the game loop from triggering another explosion
    GAME.levelTransitioning = true;
    GAME.gameOver = true;  // keep true until fully reset to block lose-check
    GAME.levelTimer = 999; // safe value so timer check can't fire

    UI.hideGameOver();
    COINS.clear();

    // Reset police
    if (window.POLICE && POLICE.reset) {
      POLICE.reset();
    }

    // Reset weapons
    if (window.WEAPONS && WEAPONS.reset) {
      WEAPONS.reset();
    }

    // Revive pedestrians
    if (window.CITY && CITY.revivePedestrians) {
      CITY.revivePedestrians();
    }

    // Remove old car (also cleans up explosion VFX)
    if (GAME.activeCar) {
      GAME.activeCar.removeFromScene();
    }

    // Now fully reset state
    GAME.gameOver = false;
    GAME.gameOverShown = false;
    GAME.currentLevel = 0;

    // Flush the scene clock so first frame doesn't have a huge delta
    SCENE.clock.getDelta();

    // Create fresh car
    GAME.activeCar = new CAR.CarEntity(GAME.selectedCarConfig);
    const spawn = CITY.getValidSpawnPoint();
    GAME.activeCar.setPosition(spawn.x, spawn.z);
    GAME.activeCar.addToScene();

    GAME.isRunning = true;
    document.getElementById('ui-overlay').style.display = 'block';
    UI.showNotification(`🔄 RETRY — LET'S GO!`);

    // Start level 1 after intro
    setTimeout(() => GAME.startLevel(0), 1000);
  },

  // ────────────────────────────────────────────────────
  //  Pause / resume
  // ────────────────────────────────────────────────────

  pause() {
    GAME.isRunning = false;
  },

  resume() {
    if (!GAME.isRunning) {
      GAME.isRunning = true;
      GAME.gameLoop();
    }
  },

  // ────────────────────────────────────────────────────
  //  UI Actions
  // ────────────────────────────────────────────────────

  resetCar() {
    if (!GAME.activeCar) return;
    const spawn = CITY.getValidSpawnPoint();
    GAME.activeCar.setPosition(spawn.x, spawn.z);
    UI.showNotification('CAR RESET', 1500);
  },

  pauseGame() {
    if (!GAME.isRunning || GAME.isPaused) return;
    GAME.isPaused = true;
    GAME.isRunning = false;
    document.getElementById('pause-menu').style.display = 'flex';
  },

  resumeGame() {
    if (!GAME.isPaused) return;
    GAME.isPaused = false;
    document.getElementById('pause-menu').style.display = 'none';
    GAME.isRunning = true;
    GAME.gameLoop();
  },

  showMenu() {
    GAME.isPaused = false;
    document.getElementById('pause-menu').style.display = 'none';
    GAME.pause();
    COINS.clear();

    // Reset police
    if (window.POLICE && POLICE.reset) {
      POLICE.reset();
    }
    
    // Revive pedestrians
    if (window.CITY && CITY.revivePedestrians) {
      CITY.revivePedestrians();
    }
    
    // Resume background music if not playing
    if (GAME.bgMusic && GAME.bgMusic.paused) {
      GAME.bgMusic.play().catch(e => console.warn('BGM Play failed:', e));
    }
    UI.hideLevelHUD();
    document.getElementById('ui-overlay').style.display = 'none';
    document.getElementById('main-menu-screen').style.display = 'flex';
    
    // Restart preview animation loop if it was stopped
    if (!CAR_SELECTOR.previewAnimFrame) {
      const animate = () => {
        CAR_SELECTOR.previewAnimFrame = requestAnimationFrame(animate);
        const car = CAR_SELECTOR.previewCars[CAR_SELECTOR.currentPreviewIndex];
        if (car) car.rotation.y += 0.008;
        CAR_SELECTOR.previewRenderer.render(CAR_SELECTOR.previewScene, CAR_SELECTOR.previewCamera);
      };
      animate();
    }
  },

  // ────────────────────────────────────────────────────
  //  Main Menu & Settings Logic
  // ────────────────────────────────────────────────────

  initMainMenu() {
    // ── Tab Switching ──
    const tabs = document.querySelectorAll('.nav-btn');
    const panes = document.querySelectorAll('.tab-pane');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        panes.forEach(p => p.classList.remove('active'));

        tab.classList.add('active');
        document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
      });
    });

    // ── Fullscreen Toggle ──
    const fsToggle = document.getElementById('setting-fullscreen');
    if (fsToggle) {
      fsToggle.addEventListener('click', (e) => {
        if (e.target.checked) {
          document.documentElement.requestFullscreen().catch(err => {
            console.warn('Fullscreen request failed:', err);
            fsToggle.checked = false;
          });
        } else {
          if (document.fullscreenElement) {
            document.exitFullscreen();
          }
        }
      });

      // Keep checkbox synced if user presses ESC to exit fullscreen
      document.addEventListener('fullscreenchange', () => {
        fsToggle.checked = !!document.fullscreenElement;
      });
    }

    // ── SFX Volume ──
    const sfxSlider = document.getElementById('setting-sfx');
    if (sfxSlider) {
      sfxSlider.addEventListener('input', (e) => {
        window.SETTINGS.sfxVolume = parseFloat(e.target.value);
      });
    }

    // ── Background Music ──
    GAME.bgMusic = new Audio('sounds/music.mp3');
    GAME.bgMusic.loop = true;
    GAME.bgMusic.volume = window.SETTINGS.musicVolume;

    const musicSlider = document.getElementById('setting-music');
    if (musicSlider) {
      musicSlider.addEventListener('input', (e) => {
        const vol = parseFloat(e.target.value);
        window.SETTINGS.musicVolume = vol;
        if (GAME.bgMusic) {
          GAME.bgMusic.volume = vol;
        }
      });
    }
    
    // Attempt to start music on first click anywhere
    const startMusic = () => {
      if (GAME.bgMusic && GAME.bgMusic.paused) {
        GAME.bgMusic.play().catch(e => console.warn('BGM Play failed:', e));
      }
      document.removeEventListener('click', startMusic);
    };
    document.addEventListener('click', startMusic);
  }
};

// ── Auto-start on DOM ready ──────────────────────────
document.addEventListener('DOMContentLoaded', () => GAME.init());
