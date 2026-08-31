// ─────────────────────────────────────────────────────────────────
//  GAME CONFIGURATION — single source of truth for all tunable values
// ─────────────────────────────────────────────────────────────────

export const GAME_CONFIG = {
  // Scoring
  scoring: {
    correct: 100,
    wrong: -10,
    miss: -10,
  },

  // Tank movement
  playerTank: {
    maxSpeed: 8,
    acceleration: 18,
    deceleration: 12,
    maxSlopeAngle: Math.PI / 3,
  },

  enemyTank: {
    minSpeed: 2.5,
    maxSpeed: 5.5,
    boundaryX: 45, // reverse when abs(x) > this
    changeDirectionInterval: [4000, 9000], // ms range
  },

  // Projectile / cannon
  projectile: {
    speed: 55,             // muzzle velocity m/s
    radius: 0.25,
    maxFlightTime: 6,      // seconds before auto-destroy
    trailLength: 20,       // trail segments
  },

  // Cannon aiming
  cannon: {
    minAngle: -0.1,        // radians (slightly below horizontal)
    maxAngle: Math.PI / 2.4,
    turretRotationSpeed: 3,
  },

  // Terrain
  terrain: {
    width: 160,
    depth: 40,
    widthSegments: 120,
    depthSegments: 12,
    maxHeight: 7,
  },

  // Camera
  camera: {
    offsetX: -12,
    offsetY: 10,
    offsetZ: 28,
    lerpFactor: 0.06,
    shakeDecay: 0.85,
    maxShake: 0.8,
  },

  // Question timing
  feedback: {
    displayTime: 1400,     // ms to show CORRECT/WRONG/MISS before next Q
    countdownDelay: 800,   // ms between countdown numbers (3,2,1,GO)
  },

  // Trajectory preview
  trajectory: {
    dots: 7,
    timeStep: 0.22,
  },
} as const;
