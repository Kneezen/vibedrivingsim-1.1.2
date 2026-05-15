/**
 * save.js — Persistent save system using localStorage.
 * Tracks highest level completed and unlocked weapons.
 * Dependencies: window.CONFIG
 * Exports:      window.SAVE
 */

window.SAVE = {

  STORAGE_KEY: 'driveSim_save',

  // ── Default state ──────────────────────────────────
  _state: {
    highestLevelCompleted: 0,
    unlockedWeapons: [],
    selectedCarId: null
  },

  // ────────────────────────────────────────────────────
  //  Load from localStorage
  // ────────────────────────────────────────────────────

  load() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this._state.highestLevelCompleted = parsed.highestLevelCompleted || 0;
        this._state.unlockedWeapons = parsed.unlockedWeapons || [];
        this._state.selectedCarId = parsed.selectedCarId || null;
        console.log('SAVE: Loaded —', this._state);
      } else {
        console.log('SAVE: No save found, using defaults');
      }
    } catch (e) {
      console.warn('SAVE: Failed to load:', e);
    }
    return this._state;
  },

  // ────────────────────────────────────────────────────
  //  Save to localStorage
  // ────────────────────────────────────────────────────

  save() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this._state));
      console.log('SAVE: Saved —', this._state);
    } catch (e) {
      console.warn('SAVE: Failed to save:', e);
    }
  },

  // ────────────────────────────────────────────────────
  //  Level tracking
  // ────────────────────────────────────────────────────

  /**
   * Record that a level was completed. Only updates if it's
   * higher than the previous best.
   * @param {number} levelIndex — 0-indexed level
   */
  onLevelComplete(levelIndex) {
    const levelNum = levelIndex + 1; // 1-indexed for display
    if (levelNum > this._state.highestLevelCompleted) {
      this._state.highestLevelCompleted = levelNum;
    }

    // Check if this level unlocks a weapon
    if (window.CONFIG && CONFIG.WEAPONS && CONFIG.WEAPONS.UNLOCK_LEVELS) {
      const unlocks = CONFIG.WEAPONS.UNLOCK_LEVELS;
      for (const [weaponId, unlockLevel] of Object.entries(unlocks)) {
        if (levelNum >= unlockLevel && !this._state.unlockedWeapons.includes(weaponId)) {
          this._state.unlockedWeapons.push(weaponId);
          return weaponId; // Return newly unlocked weapon ID for notification
        }
      }
    }

    return null; // No new unlock
  },

  getHighestLevel() {
    return this._state.highestLevelCompleted;
  },

  // ────────────────────────────────────────────────────
  //  Weapon unlock queries
  // ────────────────────────────────────────────────────

  isWeaponUnlocked(weaponId) {
    return this._state.unlockedWeapons.includes(weaponId);
  },

  getUnlockedWeapons() {
    return [...this._state.unlockedWeapons];
  },

  unlockWeapon(weaponId) {
    if (!this._state.unlockedWeapons.includes(weaponId)) {
      this._state.unlockedWeapons.push(weaponId);
    }
  },

  // ────────────────────────────────────────────────────
  //  Car selection persistence
  // ────────────────────────────────────────────────────

  setSelectedCar(carId) {
    this._state.selectedCarId = carId;
  },

  getSelectedCar() {
    return this._state.selectedCarId;
  },

  // ────────────────────────────────────────────────────
  //  Reset (for debugging)
  // ────────────────────────────────────────────────────

  clearSave() {
    this._state = {
      highestLevelCompleted: 0,
      unlockedWeapons: [],
      selectedCarId: null
    };
    localStorage.removeItem(this.STORAGE_KEY);
    console.log('SAVE: Cleared');
  }
};
