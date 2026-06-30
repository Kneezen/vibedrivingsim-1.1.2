/**
 * config.js — Global configuration for the driving simulator.
 * All game-wide constants live here so every module can reference
 * a single source of truth via window.CONFIG.
 */

window.SETTINGS = {
  sfxVolume: 0.8,
  musicVolume: 0.5
};

window.CONFIG = {

  // ── World ──────────────────────────────────────────────
  MAP_SIZE: 500,
  BLOCK_SIZE: 60,           // size of each city block
  ROAD_WIDTH: 16,           // total road width (2 lanes × 8)

  // ── Buildings ──────────────────────────────────────────
  BUILDING_MIN_HEIGHT: 20,
  BUILDING_MAX_HEIGHT: 120,

  // ── Physics ────────────────────────────────────────────
  PHYSICS: {
    MAX_SPEED: 0.8,
    REVERSE_SPEED: 0.3,
    ACCELERATION: 0.015,
    BRAKING: 0.03,
    FRICTION: 0.02,
    TURN_SPEED: 0.015,
    TURN_REDUCTION_AT_SPEED: 0.7   // reduce turning radius at high speed
  },

  // ── Camera ─────────────────────────────────────────────
  CAMERA: {
    HEIGHT: 8,
    DISTANCE: 18,
    LERP_SPEED: 0.08
  },

  // ── Levels ──────────────────────────────────────────────
  LEVELS: [
    { level: 1,  coins: 5,   timeSeconds: 90  },
    { level: 2,  coins: 8,   timeSeconds: 120 },
    { level: 3,  coins: 12,  timeSeconds: 150 },
    { level: 4,  coins: 16,  timeSeconds: 180 },
    { level: 5,  coins: 20,  timeSeconds: 210 },
    { level: 6,  coins: 25,  timeSeconds: 240 },
    { level: 7,  coins: 30,  timeSeconds: 270 },
    { level: 8,  coins: 36,  timeSeconds: 300 },
    { level: 9,  coins: 42,  timeSeconds: 330 },
    { level: 10, coins: 50,  timeSeconds: 360 },
  ],

  // ── Coins ──────────────────────────────────────────────
  COINS: {
    RADIUS: 1.2,
    HEIGHT: 0.3,
    HOVER_HEIGHT: 1.5,
    COLLECT_RADIUS: 5.0,
    SPIN_SPEED: 2.0,
    BOUNCE_SPEED: 1.5,
    BOUNCE_AMP: 0.3
  },

  // ── Police ─────────────────────────────────────────────
  POLICE: {
    CRUSH_THRESHOLD: 5,     // kills before police spawns (lowered so it's easier to trigger)
    SPEED: 1.4,             // top speed multiplier (fast)
    ACCELERATION: 1.3,      // acceleration multiplier
    HANDLING: 0.35,          // very poor turning
    CATCH_RADIUS: 4.5,      // distance to catch the player
    SPAWN_DISTANCE: 20,     // spawn this far from player (lowered so it spawns closer)
    COLOR: 0x1144cc,         // dark blue body
    TRIM_COLOR: 0xffffff,   // white trim
    SIREN_INTERVAL: 0.4     // siren tone alternation (seconds)
  },

  // ── Weapons ────────────────────────────────────────────
  WEAPONS: {
    UNLOCK_LEVELS: {
      saw: 2,
      machinegun: 4,
      oil: 6,
      flamethrower: 8
    },

    SAW: {
      DAMAGE: 15,
      RANGE: 20,
      SPEED: 0.8,
      MAX_AMMO: 3,
      RECHARGE_TIME: 8,
      LIFETIME: 2.5,
      SIZE: 0.8
    },

    MACHINEGUN: {
      DAMAGE: 3,
      RANGE: 40,
      SPEED: 2.0,
      MAX_AMMO: 60,
      RELOAD_TIME: 2.5,
      FIRE_RATE: 0.08,
      SPREAD: 0.06
    },

    OIL: {
      MAX_CHARGES: 2,
      RECHARGE_TIME: 15,
      PERSIST_TIME: 10,
      SPIN_DURATION: 4,
      RADIUS: 5
    },

    FLAMETHROWER: {
      DAMAGE_PER_SEC: 12,
      RANGE: 22,
      CONE_ANGLE: 0.8,
      MAX_FUEL: 5,
      RECHARGE_TIME: 6,
      RECHARGE_RATE: 0.83
    }
  },


  // ── Car Definitions ────────────────────────────────────
  CARS: [
    {
      id: 'street_racer',
      name: 'Street Racer',
      color: 0xe74c3c,
      bodyColor: 0xe74c3c,
      trimColor: 0x222222,
      maxSpeed: 1.3,
      acceleration: 1.2,
      handling: 0.7,
      description: 'Built for speed — not for corners.',
      emoji: '🏎️'
    },
    {
      id: 'city_cruiser',
      name: 'City Cruiser',
      color: 0x3498db,
      bodyColor: 0x3498db,
      trimColor: 0xcccccc,
      maxSpeed: 1.0,
      acceleration: 1.0,
      handling: 1.0,
      description: 'A well-balanced daily driver.',
      emoji: '🚗'
    },
    {
      id: 'off_roader',
      name: 'Off-Roader',
      color: 0x27ae60,
      bodyColor: 0x27ae60,
      trimColor: 0x333333,
      maxSpeed: 0.8,
      acceleration: 0.85,
      handling: 1.4,
      description: 'Slow but sticks to the road like glue.',
      emoji: '🚙'
    },
    {
      id: 'sports_coupe',
      name: 'Sports Coupé',
      color: 0xf1c40f,
      bodyColor: 0xf1c40f,
      trimColor: 0x111111,
      maxSpeed: 1.5,
      acceleration: 1.35,
      handling: 0.65,
      description: 'Pure adrenaline. Handle with care.',
      emoji: '⚡'
    },
    {
      id: 'muscle_car',
      name: 'Muscle Car',
      color: 0xe67e22,
      bodyColor: 0xe67e22,
      trimColor: 0x1a1a1a,
      maxSpeed: 1.25,
      acceleration: 1.3,
      handling: 0.6,
      description: 'Raw power, questionable turning.',
      emoji: '🔥'
    },
    {
      id: 'compact',
      name: 'Compact',
      color: 0xecf0f1,
      bodyColor: 0xecf0f1,
      trimColor: 0x555555,
      maxSpeed: 0.75,
      acceleration: 0.8,
      handling: 1.5,
      description: 'Nimble and easy to park anywhere.',
      emoji: '🚘'
    }
  ]
};
