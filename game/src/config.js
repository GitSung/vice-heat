// Vice Heat — every tuning number and colour in one place. The view is a fixed 1280x720 logical
// window into a much larger world; the renderer scales it to the screen, so no rule below
// depends on the display size.

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Neon Bay: the whole city, in world pixels. Water fills everything east of the shoreline. */
export const WORLD = { width: 3400, height: 2640, shoreX: 3060 };

/** Road grid: avenues run on these centre lines, ROAD.width wide, blocks sit between them. */
export const ROAD = { width: 124 };
export const AVENUES_X = [220, 660, 1100, 1540, 1980, 2420, 2860];
export const AVENUES_Y = [220, 660, 1100, 1540, 1980, 2420];

export const PLAYER = {
  radius: 13,
  walkSpeed: 168,
  sprintSpeed: 268,
  health: 100,
  punchRange: 46,
  punchCooldown: 0.34,
  punchDamage: 34,
};

export const CAR = {
  width: 46,
  height: 24,
  accel: 340,
  brake: 520,
  reverseMax: 130,
  drag: 0.55,
  grip: 3.4,
  turnRate: 2.5,
  health: 100,
};

/** How many of each thing may exist at once; pools are sized once at boot. */
export const COUNTS = { traffic: 14, parked: 16, peds: 26, policeMax: 6, particles: 260, bullets: 48, skids: 220 };

export const WANTED = {
  /** Seconds without a police car seeing the player before one star cools off. */
  coolTime: 9,
  bustedFill: 1.15,
  bustedDecay: 1.6,
  bustedRange: 105,
};

export const SAVE_KEY = 'vice-heat.save.v1';

export const PALETTE = {
  backdrop: '#070a1c',
  water: '#0b2a52',
  waterLine: '#155e8a',
  sand: '#c9a86a',
  grass: '#123a2e',
  blockGround: '#141b38',
  sidewalk: '#232c52',
  road: '#1a2142',
  roadEdge: '#2de2e6',
  lane: '#8f7fb8',
  buildingRoof: '#1d2650',
  buildingEdge: '#39477f',
  warehouse: '#2c2440',
  tower: '#171f45',
  windowLit: '#ffd166',
  windowNeon: '#ff2e88',
  player: '#2de2e6',
  text: '#f4f0ff',
  muted: '#9d94c7',
  magenta: '#ff2e88',
  cyan: '#2de2e6',
  gold: '#ffd166',
  danger: '#ff4757',
  panel: 'rgba(10, 12, 34, 0.88)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Mama Rosa's garage and safehouse: fixed story locations (world coordinates). */
export const PLACES = {
  garage: { x: 2420, y: 1980, label: 'Rosa’s Garage' },
  safehouse: { x: 660, y: 220, label: 'Safehouse' },
  strip: { x: 2860, y: 1100, label: 'Neon Strip' },
};
