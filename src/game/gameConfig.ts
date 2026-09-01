// ─────────────────────────────────────────────────────────────────
//  GAME CONFIGURATION — 4 Ridges in Front & Centered Player Tank
// ─────────────────────────────────────────────────────────────────

export const GAME_CONFIG = {
  // Tank movement
  playerTank: {
    maxSpeed: 8.0,
    acceleration: 20,
    deceleration: 15,
    boundaryX: 16, // player drives along X between -16 and +16 in horizontal center
    posZ: 8.5,     // foreground combat road
  },

  enemyTank: {
    // Enemy tanks are stationary atop their 4 front ridges
    isStationary: true,
  },

  // Projectile / cannon
  projectile: {
    speed: 40,             // 3D muzzle velocity m/s
    radius: 0.35,
    maxFlightTime: 5.5,    // seconds before auto-destroy
    trailLength: 28,       // trail segments
  },

  // Cannon aiming
  cannon: {
    minElevation: 0.06,     // radians (~3.5 deg above horizontal)
    maxElevation: 1.30,     // radians (~75 deg up)
    minYaw: -1.45,          // radians (~-83 deg left)
    maxYaw: 1.45,           // radians (~+83 deg right)
    yawSpeed: 4.5,
    elevationSpeed: 3.5,
  },

  // Terrain 3D dimensions
  terrain: {
    width: 150,
    depth: 105,
    widthSegments: 130,
    depthSegments: 95,
    maxHeight: 14,
  },

  // Centered Third-Person Camera (Framing player in center and 4 ridges in front)
  camera: {
    offsetX: 0.0,
    offsetY: 6.8,
    offsetZ: 13.5,
    lookOffsetX: 0.0,
    lookOffsetY: 4.2,
    lookOffsetZ: -28.0,
  },

  // Question timing
  timing: {
    questionDuration: 10,   // seconds per question
    countdownDuration: 3,  // 3-2-1-GO duration
    autoAdvanceDelay: 1800, // ms to show result before advancing
  },

  // Scoring
  scoring: {
    correct: 100,
    wrong: -10,
    miss: -10,
    streakMultiplier: 0.1,  // +10% per streak point
    maxStreakMultiplier: 3.0,
  },

  // Trajectory preview
  trajectory: {
    steps: 24,
    timeStep: 0.06,
  },

  // Feedback display time (ms)
  feedback: {
    displayTime: 1800,
    countdownDelay: 800,
  },
} as const;
