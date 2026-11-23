// Vice Heat — the world and its rules, with no drawing and no browser in it: Neon Bay's streets,
// buildings and props; the player on foot and in cars; traffic, pedestrians and police; the
// wanted system; combat; and Mama Rosa's mission chain plus repeatable taxi jobs. step()
// advances one fixed step and returns what happened as bit flags, so the caller (main) can play
// sounds and react without the world knowing about screens or audio.
import { AVENUES_X, AVENUES_Y, CAR, COUNTS, PLACES, PLAYER, ROAD, WANTED, WORLD } from './config.js';

export const EVENT_HIT = 1; // the player took damage
export const EVENT_CRASH = 2; // a car the player is in (or the player) crashed hard
export const EVENT_SHOT = 4;
export const EVENT_PUNCH = 8;
export const EVENT_PICKUP = 16;
export const EVENT_JINGLE = 32; // mission complete
export const EVENT_FAIL = 64; // mission failed
export const EVENT_PHONE = 128;
export const EVENT_OVER = 256; // busted or wasted
export const EVENT_CASH = 512;
export const EVENT_ENTER = 1024;

const LANE = 30;
const TAU = Math.PI * 2;

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
function angleLerp(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

const CAR_COLORS = ['#e84393', '#00cec9', '#fdcb6e', '#6c5ce7', '#dfe6e9', '#e17055', '#00b894', '#fab1a0'];
const PED_COLORS = ['#ffeaa7', '#81ecec', '#fab1a0', '#a29bfe', '#55efc4', '#ff7675', '#fdcb6e'];
const REWARDS = [600, 900, 1200, 2500];

export function createWorld(random) {
  // ---- the static city -------------------------------------------------
  const buildings = [];
  const props = [];
  for (let bx = 0; bx < AVENUES_X.length - 1; bx += 1) {
    for (let by = 0; by < AVENUES_Y.length - 1; by += 1) {
      const x0 = AVENUES_X[bx] + ROAD.width / 2 + 16;
      const y0 = AVENUES_Y[by] + ROAD.width / 2 + 16;
      const x1 = AVENUES_X[bx + 1] - ROAD.width / 2 - 16;
      const y1 = AVENUES_Y[by + 1] - ROAD.width / 2 - 16;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const district = cx > WORLD.shoreX - 620 ? 'beach' : cx < 760 && cy < 760 ? 'industrial' : Math.abs(cx - 1540) < 640 && Math.abs(cy - 1320) < 640 ? 'downtown' : 'midtown';
      if (district === 'industrial') {
        buildings.push({ x: x0 + 10, y: y0 + 10, w: x1 - x0 - 20, h: y1 - y0 - 20, district, shade: random() });
      } else {
        const hw = (x1 - x0) / 2;
        const hh = (y1 - y0) / 2;
        for (let qx = 0; qx < 2; qx += 1) {
          for (let qy = 0; qy < 2; qy += 1) {
            buildings.push({
              x: x0 + qx * hw + 8,
              y: y0 + qy * hh + 8,
              w: hw - 16,
              h: hh - 16,
              district,
              shade: random(),
            });
          }
        }
      }
    }
  }
  // Palms line the beach avenue and the strip; lamps stand at block corners.
  for (let y = 300; y < WORLD.height - 200; y += 170) {
    props.push({ x: WORLD.shoreX - 120, y: y + random() * 40, kind: 'palm' });
    if (random() < 0.7) props.push({ x: 2860 - 84, y: y + 80, kind: 'palm' });
  }
  for (let x = 340; x < WORLD.shoreX - 200; x += 190) props.push({ x: x + random() * 30, y: 1016, kind: 'palm' });
  for (const ax of AVENUES_X) {
    for (const ay of AVENUES_Y) {
      props.push({ x: ax + ROAD.width / 2 + 12, y: ay + ROAD.width / 2 + 12, kind: 'lamp' });
    }
  }

  // ---- dynamic state ---------------------------------------------------
  const player = { x: 1100, y: 1210, angle: -Math.PI / 2, health: PLAYER.health, inCar: null, punchCd: 0, fireCd: 0, walk: 0, hurtT: 0 };
  const state = {
    time: 0,
    player,
    cars: [],
    peds: [],
    bullets: [],
    particles: [],
    skids: [],
    pickups: [],
    buildings,
    props,
    camera: { x: player.x, y: player.y },
    shake: 0,
    cash: 0,
    heat: 0,
    stars: 0,
    busted: 0,
    hideTimer: 0,
    seen: false,
    weapon: 'fists',
    ammo: 0,
    objective: '',
    marker: null,
    missionIndex: 0,
    missionPhase: 0,
    missionTimer: null,
    phone: null,
    banner: null,
    gameOver: null,
    speedKmh: 0,
    skidAmount: 0,
    engineRatio: 0,
    crashStrength: 0,
    sidePhase: 0,
    sideTimer: 0,
    stats: { earned: 0, topSpeed: 0, stolen: 0, missions: 0 },
  };
  let missionCar = null;
  let sidePed = null;
  let trafficTimer = 0;
  let pedTimer = 0;

  function makeCar(x, y, angle, kind) {
    return {
      x, y, angle, vx: 0, vy: 0, speed: 0,
      width: kind === 'sports' ? 50 : CAR.width,
      height: CAR.height,
      color: kind === 'police' ? '#dfe6e9' : kind === 'taxi' ? '#fdcb6e' : CAR_COLORS[Math.floor(random() * CAR_COLORS.length)],
      kind,
      health: CAR.health,
      driver: null, // null | 'ai' | 'police' | 'player'
      axis: 'v', roadLine: 0, dir: 1, cruise: 190 + random() * 80, lastCross: '',
      wreck: false, smokeT: 0, wreckAge: 0, stuckT: 0,
    };
  }

  function spawnTraffic(initial) {
    const vertical = random() < 0.5;
    const line = vertical ? AVENUES_X[Math.floor(random() * AVENUES_X.length)] : AVENUES_Y[Math.floor(random() * AVENUES_Y.length)];
    const along = initial ? random() * (vertical ? WORLD.height : WORLD.width) : (random() < 0.5 ? 120 : (vertical ? WORLD.height : WORLD.width) - 120);
    const dir = random() < 0.5 ? 1 : -1;
    const car = makeCar(0, 0, 0, random() < 0.12 ? 'taxi' : 'traffic');
    car.axis = vertical ? 'v' : 'h';
    car.roadLine = line;
    car.dir = dir;
    car.driver = 'ai';
    if (vertical) {
      car.x = line + dir * LANE;
      car.y = clamp(along, 80, WORLD.height - 80);
      car.angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      car.x = clamp(along, 80, WORLD.shoreX - 60);
      car.y = line + dir * LANE;
      car.angle = dir > 0 ? 0 : Math.PI;
    }
    if (car.x > WORLD.shoreX - 40) car.x = WORLD.shoreX - 80;
    state.cars.push(car);
    return car;
  }

  function spawnParked() {
    const vertical = random() < 0.5;
    const line = vertical ? AVENUES_X[Math.floor(random() * AVENUES_X.length)] : AVENUES_Y[Math.floor(random() * AVENUES_Y.length)];
    const along = 200 + random() * 2000;
    const kind = random() < 0.22 ? 'sports' : 'traffic';
    const car = makeCar(0, 0, 0, kind);
    const side = random() < 0.5 ? -1 : 1;
    if (vertical) {
      car.x = line + side * (ROAD.width / 2 - 26);
      car.y = clamp(along, 100, WORLD.height - 100);
      car.angle = Math.PI / 2;
    } else {
      car.x = clamp(along, 100, WORLD.shoreX - 120);
      car.y = line + side * (ROAD.width / 2 - 26);
      car.angle = 0;
    }
    state.cars.push(car);
    return car;
  }

  function spawnPed(x, y) {
    const ped = {
      x: x ?? 300 + random() * 2400,
      y: y ?? 300 + random() * 2000,
      angle: random() * TAU,
      speed: 0,
      color: PED_COLORS[Math.floor(random() * PED_COLORS.length)],
      state: 'wander',
      tx: 0, ty: 0, fleeT: 0, health: 40, dead: false, deadT: 0, walk: random() * 6,
    };
    ped.tx = ped.x;
    ped.ty = ped.y;
    state.peds.push(ped);
    return ped;
  }

  function spawnPolice() {
    // Appear on a road a good way from the player, then hunt.
    const vertical = random() < 0.5;
    const car = makeCar(0, 0, 0, 'police');
    car.driver = 'police';
    car.cruise = 400;
    const off = 620 + random() * 200;
    const side = random() < 0.5 ? -1 : 1;
    if (vertical) {
      car.x = clamp(player.x + side * off, 90, WORLD.shoreX - 90);
      car.y = clamp(player.y + (random() - 0.5) * 300, 90, WORLD.height - 90);
      car.x = AVENUES_X.reduce((best, ax) => (Math.abs(ax - car.x) < Math.abs(best - car.x) ? ax : best), AVENUES_X[0]);
    } else {
      car.y = clamp(player.y + side * off, 90, WORLD.height - 90);
      car.x = clamp(player.x + (random() - 0.5) * 300, 90, WORLD.shoreX - 90);
      car.y = AVENUES_Y.reduce((best, ay) => (Math.abs(ay - car.y) < Math.abs(best - car.y) ? ay : best), AVENUES_Y[0]);
    }
    car.angle = Math.atan2(player.y - car.y, player.x - car.x);
    state.cars.push(car);
    return car;
  }

  function burst(x, y, n, color, speed, life, size) {
    for (let i = 0; i < n; i += 1) {
      if (state.particles.length >= COUNTS.particles) state.particles.shift();
      const a = random() * TAU;
      const s = speed * (0.3 + random() * 0.7);
      state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.5 + random() * 0.5), max: life, color, size: size * (0.6 + random() * 0.8) });
    }
  }

  function addHeat(amount) {
    state.heat = clamp(state.heat + amount, 0, 5.99);
  }

  function setPhone(text, from = 'MAMA ROSA') {
    state.phone = { from, text, t: 7 };
    return EVENT_PHONE;
  }

  function setBanner(title, sub) {
    state.banner = { title, sub, t: 4 };
  }

  function completeMission() {
    const reward = REWARDS[state.missionIndex] ?? 0;
    state.cash += reward;
    state.stats.earned += reward;
    state.stats.missions += 1;
    setBanner('MISSION COMPLETE', `+$${reward}`);
    state.missionIndex += 1;
    state.missionPhase = 0;
    state.missionTimer = null;
    missionCar = null;
    startMission();
    return EVENT_JINGLE | EVENT_CASH;
  }

  function failMission(text) {
    setPhone(text);
    state.missionPhase = 0;
    state.missionTimer = null;
    if (missionCar && missionCar.wreck) {
      state.cars = state.cars.filter((c) => c !== missionCar);
      missionCar = null;
    }
    startMission(true);
    return EVENT_FAIL;
  }

  /** Begin (or, with `retry`, quietly re-arm) the current story mission or the side-job loop. */
  function startMission(retry = false) {
    const i = state.missionIndex;
    if (i === 0) {
      if (!missionCar || missionCar.wreck) {
        missionCar = makeCar(2860, 1560, -Math.PI / 2, 'sports');
        missionCar.color = '#ff2e88';
        state.cars.push(missionCar);
      }
      state.objective = 'Steal the pink sports car on the strip';
      state.marker = { x: missionCar.x, y: missionCar.y, color: '#ff2e88', label: 'TARGET CAR' };
      if (!retry) setPhone('Baby, I need that pink sports car from the strip. Bring it to my garage. — R');
    } else if (i === 1) {
      state.objective = 'Pick up the package in the industrial corner';
      state.marker = { x: 300, y: 300, color: '#ffd166', label: 'PACKAGE' };
      if (!retry) setPhone('A package waits up in the industrial corner. Grab it, drop it downtown. Fast. — R');
    } else if (i === 2) {
      state.objective = 'Lose the heat, then reach the safehouse';
      state.marker = { x: PLACES.safehouse.x, y: PLACES.safehouse.y, color: '#2de2e6', label: 'SAFEHOUSE' };
      if (!retry) {
        state.heat = Math.max(state.heat, 3);
        setPhone('You are HOT, baby — 3 stars! Lose the cops and hide at the safehouse. — R');
      }
    } else if (i === 3) {
      state.objective = 'Pick up the last package on the strip';
      state.marker = { x: PLACES.strip.x, y: PLACES.strip.y, color: '#ffd166', label: 'PACKAGE' };
      if (!retry) setPhone('One last run, baby. Package on the strip, bring it to my garage. Everyone will chase you. — R');
    } else {
      state.objective = 'Free roam — a fare is waiting (yellow marker)';
      state.sidePhase = 0;
      state.sideTimer = 1;
      state.marker = null;
      if (!retry) setPhone('Story done, baby. Neon Bay is yours. Taxi fares pay cash. — R');
    }
  }

  function reset(save) {
    state.time = 0;
    state.cars = [];
    state.peds = [];
    state.bullets = [];
    state.particles = [];
    state.skids = [];
    state.pickups = [{ kind: 'pistol', x: 1160, y: 1040, taken: false, respawn: 0 }];
    player.x = 1100;
    player.y = 1210;
    player.angle = -Math.PI / 2;
    player.health = PLAYER.health;
    player.inCar = null;
    player.punchCd = 0;
    player.fireCd = 0;
    player.hurtT = 0;
    state.camera.x = player.x;
    state.camera.y = player.y;
    state.shake = 0;
    state.cash = save?.cash ?? 0;
    state.missionIndex = save?.missionIndex ?? 0;
    state.heat = 0;
    state.stars = 0;
    state.busted = 0;
    state.hideTimer = 0;
    state.seen = false;
    state.weapon = 'fists';
    state.ammo = 0;
    state.gameOver = null;
    state.phone = null;
    state.banner = null;
    state.missionPhase = 0;
    state.missionTimer = null;
    state.sidePhase = 0;
    state.sideTimer = 0;
    state.stats = { earned: 0, topSpeed: 0, stolen: 0, missions: state.missionIndex };
    missionCar = null;
    sidePed = null;
    for (let i = 0; i < COUNTS.traffic; i += 1) spawnTraffic(true);
    for (let i = 0; i < COUNTS.parked; i += 1) spawnParked();
    for (let i = 0; i < COUNTS.peds; i += 1) spawnPed();
    startMission();
  }

  // ---- collision helpers ----------------------------------------------
  function collideBuildings(e, radius) {
    for (const b of state.buildings) {
      if (e.x + radius < b.x || e.x - radius > b.x + b.w || e.y + radius < b.y || e.y - radius > b.y + b.h) continue;
      const nx = clamp(e.x, b.x, b.x + b.w);
      const ny = clamp(e.y, b.y, b.y + b.h);
      const dx = e.x - nx;
      const dy = e.y - ny;
      const d2 = dx * dx + dy * dy;
      if (d2 > radius * radius) continue;
      if (d2 > 0.001) {
        const d = Math.sqrt(d2);
        e.x = nx + (dx / d) * radius;
        e.y = ny + (dy / d) * radius;
      } else {
        e.y = b.y - radius;
      }
      return true;
    }
    return false;
  }

  function crime(amount, x, y) {
    addHeat(amount);
    for (const ped of state.peds) {
      if (!ped.dead && dist2(ped.x, ped.y, x, y) < 320 * 320) {
        ped.state = 'flee';
        ped.fleeT = 3;
        ped.tx = x;
        ped.ty = y;
      }
    }
  }

  // ---- per-entity updates ----------------------------------------------
  function updatePlayerCar(dt, input, aimAngle) {
    const car = player.inCar;
    let events = 0;
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    const handbrake = input.held.handbrake;
    const fwdBefore = car.vx * fx + car.vy * fy;
    if (input.held.up) {
      car.vx += fx * CAR.accel * dt;
      car.vy += fy * CAR.accel * dt;
    } else if (input.held.down) {
      if (fwdBefore > 12) {
        car.vx -= fx * CAR.brake * dt;
        car.vy -= fy * CAR.brake * dt;
      } else if (fwdBefore > -CAR.reverseMax) {
        car.vx -= fx * CAR.accel * 0.6 * dt;
        car.vy -= fy * CAR.accel * 0.6 * dt;
      }
    }
    // Decompose into forward / lateral: grip bleeds the lateral part away (less of it with the
    // handbrake pulled, which is what makes the car drift), drag bleeds the forward part.
    const fwdSpeed = car.vx * fx + car.vy * fy;
    const latX = car.vx - fx * fwdSpeed;
    const latY = car.vy - fy * fwdSpeed;
    const latSpeed = Math.hypot(latX, latY);
    const damp = Math.exp(-(handbrake ? 0.7 : CAR.grip) * dt);
    const dragF = Math.exp(-CAR.drag * dt * (handbrake ? 0.4 : 1));
    car.vx = fx * fwdSpeed * dragF + latX * damp;
    car.vy = fy * fwdSpeed * dragF + latY * damp;
    const steer = (input.held.right ? 1 : 0) - (input.held.left ? 1 : 0);
    if (Math.abs(fwdSpeed) > 4) {
      car.angle += steer * CAR.turnRate * dt * clamp(Math.abs(fwdSpeed) / 130, 0.25, 1) * Math.sign(fwdSpeed) * (handbrake ? 1.35 : 1);
    }
    const px = car.x;
    const py = car.y;
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    car.x = clamp(car.x, 30, WORLD.shoreX - 20);
    car.y = clamp(car.y, 30, WORLD.height - 30);
    const speed = Math.hypot(car.vx, car.vy);
    car.speed = speed;
    state.speedKmh = Math.round(speed * 0.36);
    state.engineRatio = clamp(speed / 430, 0, 1);
    if (speed > state.stats.topSpeed) state.stats.topSpeed = state.speedKmh;
    // Skid marks + sound amount while sliding or handbraking at speed.
    state.skidAmount = latSpeed > 55 || (handbrake && speed > 90) ? clamp(latSpeed / 120, 0.3, 1) : 0;
    if (state.skidAmount > 0 && state.skids.length < COUNTS.skids * 2) {
      state.skids.push({ x: car.x - fx * 16 - fy * 10, y: car.y - fy * 16 + fx * 10, a: car.angle, life: 7 });
      state.skids.push({ x: car.x - fx * 16 + fy * 10, y: car.y - fy * 16 - fx * 10, a: car.angle, life: 7 });
    }
    if (state.skids.length > COUNTS.skids * 2) state.skids.splice(0, state.skids.length - COUNTS.skids * 2);
    // Building collision: stop dead, take damage, shake.
    if (collideBuildings(car, 24)) {
      const impact = speed;
      if (impact > 90) {
        car.health -= impact * 0.09;
        player.health -= impact * 0.03;
        state.crashStrength = clamp(impact / 320, 0.2, 1);
        state.shake = Math.min(14, impact * 0.05);
        burst(car.x + fx * 24, car.y + fy * 24, 10, '#ffd166', 190, 0.5, 3);
        events |= EVENT_CRASH | EVENT_HIT;
        crime(0.3, car.x, car.y);
      }
      car.vx *= -0.25;
      car.vy *= -0.25;
      car.x = clamp(car.x, 30, WORLD.shoreX - 20);
      if (car.x === px && car.y === py) {
        car.x = px;
        car.y = py;
      }
    }
    // Car vs car.
    for (const other of state.cars) {
      if (other === car) continue;
      const d2 = dist2(car.x, car.y, other.x, other.y);
      if (d2 > 52 * 52) continue;
      const d = Math.sqrt(d2) || 1;
      const nx = (other.x - car.x) / d;
      const ny = (other.y - car.y) / d;
      const rel = Math.abs((car.vx - other.vx) * nx + (car.vy - other.vy) * ny);
      other.x += nx * (52 - d) * 0.6;
      other.y += ny * (52 - d) * 0.6;
      other.vx += nx * rel * 0.7;
      other.vy += ny * rel * 0.7;
      car.vx -= nx * rel * 0.4;
      car.vy -= ny * rel * 0.4;
      if (rel > 70) {
        other.health -= rel * 0.12;
        car.health -= rel * 0.08;
        state.crashStrength = clamp(rel / 300, 0.2, 1);
        state.shake = Math.min(12, rel * 0.045);
        burst((car.x + other.x) / 2, (car.y + other.y) / 2, 8, '#ffd166', 170, 0.45, 3);
        events |= EVENT_CRASH;
        crime(other.kind === 'police' ? 1.2 : 0.5, car.x, car.y);
      }
    }
    // Running over pedestrians is very bad.
    for (const ped of state.peds) {
      if (ped.dead) continue;
      if (dist2(car.x, car.y, ped.x, ped.y) < 30 * 30 && speed > 55) {
        ped.dead = true;
        ped.deadT = 6;
        burst(ped.x, ped.y, 10, '#ff4757', 150, 0.6, 3);
        crime(2, ped.x, ped.y);
        car.health -= 2;
      }
    }
    if (car.health <= 0 && !car.wreck) {
      car.wreck = true;
      burst(car.x, car.y, 22, '#ff7f50', 220, 0.8, 4);
    }
    if (car.wreck) {
      car.smokeT -= dt;
      if (car.smokeT <= 0) {
        car.smokeT = 0.12;
        burst(car.x, car.y, 1, '#555f7a', 40, 1.1, 6);
      }
      car.vx *= Math.exp(-3 * dt);
      car.vy *= Math.exp(-3 * dt);
    } else if (car.health < 45) {
      car.smokeT -= dt;
      if (car.smokeT <= 0) {
        car.smokeT = 0.2;
        burst(car.x, car.y, 1, '#39415e', 30, 0.9, 5);
      }
    }
    player.x = car.x;
    player.y = car.y;
    player.angle = aimAngle;
    return events;
  }

  function updateTrafficCar(dt, car) {
    // Only AI-driven cars move themselves; parked cars (driver null) stay parked.
    if (car.driver !== 'ai' && car.driver !== 'police') return;
    if (car.wreck) return;
    const isPolice = car.driver === 'police';
    let targetX;
    let targetY;
    let topSpeed = car.cruise;
    if (isPolice) {
      targetX = player.x;
      targetY = player.y;
      topSpeed = 395;
      // Slow the final approach so ramming reads as pressure, not teleporting.
      const d = Math.hypot(player.x - car.x, player.y - car.y);
      if (d < 60) topSpeed = 150;
    } else {
      // Follow the road: aim at a point ahead on the car's lane; turn at intersections.
      const ahead = 190;
      if (car.axis === 'v') {
        targetX = car.roadLine + car.dir * LANE;
        targetY = car.y + car.dir * ahead;
        for (const ay of AVENUES_Y) {
          if (Math.abs(car.y - ay) < 26 && car.lastCross !== `v${ay}`) {
            car.lastCross = `v${ay}`;
            if (random() < 0.4) {
              car.axis = 'h';
              car.roadLine = ay;
              car.dir = random() < 0.5 ? 1 : -1;
            }
          }
        }
      } else {
        targetX = car.x + car.dir * ahead;
        targetY = car.roadLine + car.dir * LANE;
        for (const ax of AVENUES_X) {
          if (Math.abs(car.x - ax) < 26 && car.lastCross !== `h${ax}`) {
            car.lastCross = `h${ax}`;
            if (random() < 0.4) {
              car.axis = 'v';
              car.roadLine = ax;
              car.dir = random() < 0.5 ? 1 : -1;
            }
          }
        }
      }
      // Keep a gap behind the car in front.
      for (const other of state.cars) {
        if (other === car) continue;
        const fx = Math.cos(car.angle);
        const fy = Math.sin(car.angle);
        const rx = other.x - car.x;
        const ry = other.y - car.y;
        const aheadDist = rx * fx + ry * fy;
        if (aheadDist > 0 && aheadDist < 78 && Math.abs(rx * fy - ry * fx) < 26) topSpeed = Math.min(topSpeed, other.speed * 0.8);
      }
    }
    const want = Math.atan2(targetY - car.y, targetX - car.x);
    car.angle = angleLerp(car.angle, want, clamp(dt * (isPolice ? 3.4 : 2.4), 0, 1));
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    const fwd = car.vx * fx + car.vy * fy;
    if (fwd < topSpeed) {
      car.vx += fx * 300 * dt;
      car.vy += fy * 300 * dt;
    } else {
      car.vx -= fx * 200 * dt;
      car.vy -= fy * 200 * dt;
    }
    // Strong lateral grip for AI cars: kill sideways slide.
    const nf = car.vx * fx + car.vy * fy;
    car.vx = fx * nf;
    car.vy = fy * nf;
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    car.speed = Math.hypot(car.vx, car.vy);
    if (car.x < 40 || car.x > WORLD.shoreX - 10 || car.y < 40 || car.y > WORLD.height - 40) {
      car.x = clamp(car.x, 40, WORLD.shoreX - 10);
      car.y = clamp(car.y, 40, WORLD.height - 40);
      car.angle += Math.PI;
      car.dir = -car.dir;
    }
    if (collideBuildings(car, 22)) {
      car.vx *= -0.3;
      car.vy *= -0.3;
      if (isPolice) car.angle = Math.atan2(player.y - car.y, player.x - car.x);
    }
    // A police car wedged against a building for a while gives up and comes down a side
    // street instead: reappear on the avenue nearest the player, a few hundred pixels out.
    if (isPolice) {
      const dPlayer = Math.hypot(player.x - car.x, player.y - car.y);
      if (car.speed < 25 && dPlayer > 140) {
        car.stuckT += dt;
        if (car.stuckT > 2.5) {
          car.stuckT = 0;
          if (random() < 0.5) {
            car.x = AVENUES_X.reduce((best, ax) => (Math.abs(ax - player.x) < Math.abs(best - player.x) ? ax : best), AVENUES_X[0]);
            car.y = clamp(player.y + (random() < 0.5 ? -460 : 460), 80, WORLD.height - 80);
          } else {
            car.y = AVENUES_Y.reduce((best, ay) => (Math.abs(ay - player.y) < Math.abs(best - player.y) ? ay : best), AVENUES_Y[0]);
            car.x = clamp(player.x + (random() < 0.5 ? -460 : 460), 80, WORLD.shoreX - 80);
          }
          car.vx = 0;
          car.vy = 0;
          car.angle = Math.atan2(player.y - car.y, player.x - car.x);
        }
      } else {
        car.stuckT = 0;
      }
    }
    // Police ramming the player's car / body.
    if (isPolice) {
      const target = player.inCar ?? player;
      const radius = player.inCar ? 46 : 26;
      if (dist2(car.x, car.y, target.x, target.y) < radius * radius && car.speed > 60) {
        if (player.inCar) {
          player.inCar.health -= car.speed * 0.05;
          player.inCar.vx += car.vx * 0.35;
          player.inCar.vy += car.vy * 0.35;
        } else {
          player.health -= 5;
          state.shake = 6;
        }
        car.vx *= 0.4;
        car.vy *= 0.4;
      }
    }
    if (car.health <= 0 && !car.wreck) {
      car.wreck = true;
      burst(car.x, car.y, 18, '#ff7f50', 200, 0.7, 4);
      if (isPolice) crime(1, car.x, car.y);
    }
  }

  function updatePed(dt, ped) {
    if (ped.dead) {
      ped.deadT -= dt;
      return;
    }
    if (ped.state === 'wait') return; // a taxi fare stands at the kerb until picked up or scared off
    let speed = 62;
    if (ped.state === 'flee') {
      ped.fleeT -= dt;
      const dx = ped.x - ped.tx;
      const dy = ped.y - ped.ty;
      const d = Math.hypot(dx, dy) || 1;
      ped.tx = ped.x + (dx / d) * 200;
      ped.ty = ped.y + (dy / d) * 200;
      speed = 215;
      if (ped.fleeT <= 0) ped.state = 'wander';
    } else if (Math.hypot(ped.tx - ped.x, ped.ty - ped.y) < 14 || ped.tx === ped.x) {
      // New wander target near a road edge (sidewalks), kept in the city.
      const vertical = random() < 0.5;
      const line = vertical ? AVENUES_X[Math.floor(random() * AVENUES_X.length)] : AVENUES_Y[Math.floor(random() * AVENUES_Y.length)];
      const off = (ROAD.width / 2 + 18) * (random() < 0.5 ? -1 : 1);
      if (vertical) {
        ped.tx = line + off;
        ped.ty = clamp(ped.y + (random() - 0.5) * 700, 60, WORLD.height - 60);
      } else {
        ped.tx = clamp(ped.x + (random() - 0.5) * 700, 60, WORLD.shoreX - 60);
        ped.ty = line + off;
      }
    }
    const want = Math.atan2(ped.ty - ped.y, ped.tx - ped.x);
    ped.angle = angleLerp(ped.angle, want, clamp(dt * 6, 0, 1));
    ped.x += Math.cos(ped.angle) * speed * dt;
    ped.y += Math.sin(ped.angle) * speed * dt;
    ped.x = clamp(ped.x, 24, WORLD.shoreX - 10);
    ped.y = clamp(ped.y, 24, WORLD.height - 24);
    ped.walk += dt * (speed / 16);
    collideBuildings(ped, 11);
  }

  function fireBullet(aimAngle) {
    if (state.bullets.length >= COUNTS.bullets) state.bullets.shift();
    state.bullets.push({
      x: player.x + Math.cos(aimAngle) * 20,
      y: player.y + Math.sin(aimAngle) * 20,
      vx: Math.cos(aimAngle) * 980,
      vy: Math.sin(aimAngle) * 980,
      life: 0.55,
    });
    burst(player.x + Math.cos(aimAngle) * 24, player.y + Math.sin(aimAngle) * 24, 3, '#ffd166', 90, 0.12, 3);
  }

  function updateBullets(dt) {
    let events = 0;
    for (const b of state.bullets) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      for (const ped of state.peds) {
        if (ped.dead || b.life <= 0) continue;
        if (dist2(b.x, b.y, ped.x, ped.y) < 15 * 15) {
          ped.health -= 50;
          b.life = 0;
          burst(ped.x, ped.y, 6, '#ff4757', 130, 0.5, 3);
          if (ped.health <= 0) {
            ped.dead = true;
            ped.deadT = 6;
            crime(2, ped.x, ped.y);
          } else {
            ped.state = 'flee';
            ped.fleeT = 3;
            ped.tx = player.x;
            ped.ty = player.y;
            crime(1, ped.x, ped.y);
          }
        }
      }
      for (const car of state.cars) {
        if (b.life <= 0) break;
        if (car === player.inCar) continue;
        if (dist2(b.x, b.y, car.x, car.y) < 26 * 26) {
          car.health -= 9;
          b.life = 0;
          burst(b.x, b.y, 4, '#ffd166', 160, 0.3, 2);
          if (car.kind === 'police') crime(1, car.x, car.y);
        }
      }
      if (b.life > 0) {
        for (const bd of state.buildings) {
          if (b.x > bd.x && b.x < bd.x + bd.w && b.y > bd.y && b.y < bd.y + bd.h) {
            b.life = 0;
            burst(b.x, b.y, 3, '#a29bfe', 110, 0.3, 2);
            break;
          }
        }
      }
    }
    state.bullets = state.bullets.filter((b) => b.life > 0);
    return events;
  }

  function doPunch() {
    let events = EVENT_PUNCH;
    const range = PLAYER.punchRange;
    const tx = player.x + Math.cos(player.angle) * range * 0.7;
    const ty = player.y + Math.sin(player.angle) * range * 0.7;
    for (const ped of state.peds) {
      if (ped.dead) continue;
      if (dist2(tx, ty, ped.x, ped.y) < range * range) {
        ped.health -= PLAYER.punchDamage;
        ped.x += Math.cos(player.angle) * 16;
        ped.y += Math.sin(player.angle) * 16;
        burst(ped.x, ped.y, 5, '#ffeaa7', 120, 0.35, 3);
        if (ped.health <= 0) {
          ped.dead = true;
          ped.deadT = 6;
          crime(2, ped.x, ped.y);
        } else {
          ped.state = 'flee';
          ped.fleeT = 3;
          ped.tx = player.x;
          ped.ty = player.y;
          crime(1, ped.x, ped.y);
        }
      }
    }
    for (const car of state.cars) {
      if (dist2(tx, ty, car.x, car.y) < 34 * 34) {
        car.health -= 4;
        burst(tx, ty, 3, '#ffd166', 120, 0.25, 2);
      }
    }
    return events;
  }

  function tryInteract() {
    let events = 0;
    if (player.inCar) {
      const car = player.inCar;
      car.driver = null;
      player.inCar = null;
      player.x = car.x - Math.sin(car.angle) * 34;
      player.y = car.y + Math.cos(car.angle) * 34;
      collideBuildings(player, PLAYER.radius);
      events |= EVENT_ENTER;
      return events;
    }
    let best = null;
    let bestD = 68 * 68;
    for (const car of state.cars) {
      if (car.wreck) continue;
      const d = dist2(player.x, player.y, car.x, car.y);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    if (best) {
      const wasAi = best.driver === 'ai';
      best.driver = 'player';
      best.vx *= 0.2;
      best.vy *= 0.2;
      player.inCar = best;
      player.x = best.x;
      player.y = best.y;
      state.stats.stolen += 1;
      events |= EVENT_ENTER;
      if (wasAi || best.kind !== 'taxi') crime(1, best.x, best.y);
      if (best === missionCar && state.missionIndex === 0 && state.missionPhase === 0) {
        state.missionPhase = 1;
        state.objective = 'Deliver the car to Rosa’s Garage';
        state.marker = { x: PLACES.garage.x, y: PLACES.garage.y, color: '#ff2e88', label: 'GARAGE' };
        events |= setPhone('That’s my car, baby! Bring it to the garage, south-east. — R');
      }
    }
    return events;
  }

  // ---- missions ---------------------------------------------------------
  function updateMissions(dt) {
    let events = 0;
    const i = state.missionIndex;
    const inCar = player.inCar !== null;
    if (state.missionTimer !== null && i < 4) {
      state.missionTimer -= dt;
      if (state.missionTimer <= 0) {
        state.missionTimer = null;
        return events | failMission('Too slow, baby. We try again. — R');
      }
    }
    if (i === 0) {
      if (state.missionPhase === 0 && (!missionCar || missionCar.wreck || !state.cars.includes(missionCar))) {
        // The target car was wrecked or towed before the player reached it: Rosa finds another.
        if (missionCar) state.cars = state.cars.filter((c) => c !== missionCar);
        missionCar = null;
        startMission(true);
      }
      if (state.missionPhase === 0 && missionCar) state.marker = { x: missionCar.x, y: missionCar.y, color: '#ff2e88', label: 'TARGET CAR' };
      if (state.missionPhase === 1) {
        if (missionCar && missionCar.wreck) return events | failMission('You wrecked my car?! I’ll find another. — R');
        if (player.inCar === missionCar && dist2(player.x, player.y, PLACES.garage.x, PLACES.garage.y) < 84 * 84) {
          // Hand the car over: it stays at the garage, freshly "sold".
          missionCar.driver = null;
          player.inCar = null;
          player.x = PLACES.garage.x - 60;
          player.y = PLACES.garage.y + 40;
          events |= completeMission();
        } else if (player.inCar !== missionCar) {
          state.objective = 'Get in the pink sports car';
          state.marker = { x: missionCar.x, y: missionCar.y, color: '#ff2e88', label: 'TARGET CAR' };
        } else {
          state.objective = 'Deliver the car to Rosa’s Garage';
          state.marker = { x: PLACES.garage.x, y: PLACES.garage.y, color: '#ff2e88', label: 'GARAGE' };
        }
      }
    } else if (i === 1) {
      if (state.missionPhase === 0 && dist2(player.x, player.y, 300, 300) < 56 * 56) {
        state.missionPhase = 1;
        state.missionTimer = 100;
        state.objective = 'Drop the package downtown — hurry!';
        state.marker = { x: 1540, y: 1540, color: '#ffd166', label: 'DROP-OFF' };
        events |= EVENT_PICKUP | setPhone('Got it? Downtown drop, 100 seconds. Go go go! — R');
      } else if (state.missionPhase === 1 && dist2(player.x, player.y, 1540, 1540) < 70 * 70) {
        events |= completeMission();
      }
    } else if (i === 2) {
      if (state.stars === 0 && dist2(player.x, player.y, PLACES.safehouse.x, PLACES.safehouse.y) < 96 * 96) {
        events |= completeMission();
      }
    } else if (i === 3) {
      if (state.missionPhase === 0 && dist2(player.x, player.y, PLACES.strip.x, PLACES.strip.y) < 56 * 56) {
        state.missionPhase = 1;
        state.missionTimer = 110;
        state.heat = Math.max(state.heat, 4);
        state.objective = 'Final run: deliver to Rosa’s Garage!';
        state.marker = { x: PLACES.garage.x, y: PLACES.garage.y, color: '#ffd166', label: 'GARAGE' };
        events |= EVENT_PICKUP | setPhone('They’re all coming for you, baby. DRIVE! — R');
      } else if (state.missionPhase === 1 && dist2(player.x, player.y, PLACES.garage.x, PLACES.garage.y) < 84 * 84) {
        events |= completeMission();
      }
    } else {
      // Side jobs: taxi fares, forever.
      if (state.sidePhase === 0 && !sidePed) {
        state.sideTimer -= dt;
        if (state.sideTimer <= 0) {
          const px = AVENUES_X[1 + Math.floor(random() * (AVENUES_X.length - 1))];
          sidePed = spawnPed(px + ROAD.width / 2 + 20, 300 + random() * 2000);
          sidePed.state = 'wait';
          state.marker = { x: sidePed.x, y: sidePed.y, color: '#fdcb6e', label: 'FARE PICKUP' };
          state.objective = 'Taxi: pick up the fare';
        }
      } else if (state.sidePhase === 0 && sidePed) {
        state.marker = { x: sidePed.x, y: sidePed.y, color: '#fdcb6e', label: 'FARE PICKUP' };
        if (inCar && dist2(player.x, player.y, sidePed.x, sidePed.y) < 62 * 62 && state.speedKmh < 12) {
          state.peds = state.peds.filter((p) => p !== sidePed);
          sidePed = null;
          state.sidePhase = 1;
          const dx = AVENUES_X[Math.floor(random() * AVENUES_X.length)];
          const dy = AVENUES_Y[Math.floor(random() * AVENUES_Y.length)];
          state.marker = { x: dx, y: dy, color: '#fdcb6e', label: 'FARE DROP-OFF' };
          state.objective = 'Taxi: drop the fare off';
          events |= EVENT_PICKUP;
        }
      } else if (state.sidePhase === 1 && state.marker) {
        if (inCar && dist2(player.x, player.y, state.marker.x, state.marker.y) < 72 * 72 && state.speedKmh < 12) {
          const pay = 180 + Math.floor(random() * 160);
          state.cash += pay;
          state.stats.earned += pay;
          setBanner('FARE PAID', `+$${pay}`);
          state.sidePhase = 0;
          state.sideTimer = 6;
          state.marker = null;
          state.objective = 'Free roam — next fare soon';
          events |= EVENT_CASH;
        }
      }
    }
    return events;
  }

  // ---- the step -----------------------------------------------------------
  /**
   * One fixed step. `input` is the held-key snapshot plus the aim angle (world radians) and the
   * one-shot action flags main passes through; `actions` uses the same bits as input.js.
   */
  function step(dt, input, actions, aimAngle) {
    let events = 0;
    state.time += dt;
    state.skidAmount = 0;
    state.crashStrength = 0;
    if (state.gameOver) return events;

    if (actions & 1) events |= tryInteract(); // ACTION_INTERACT

    if (player.inCar) {
      events |= updatePlayerCar(dt, input, aimAngle);
    } else {
      state.speedKmh = 0;
      state.engineRatio = 0;
      const mx = (input.held.right ? 1 : 0) - (input.held.left ? 1 : 0);
      const my = (input.held.down ? 1 : 0) - (input.held.up ? 1 : 0);
      const speed = input.held.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
      if (mx !== 0 || my !== 0) {
        const d = Math.hypot(mx, my);
        player.x += (mx / d) * speed * dt;
        player.y += (my / d) * speed * dt;
        player.walk += dt * 9;
      }
      player.x = clamp(player.x, 16, WORLD.shoreX - 8);
      player.y = clamp(player.y, 16, WORLD.height - 16);
      collideBuildings(player, PLAYER.radius);
      player.angle = aimAngle;
      if (player.punchCd > 0) player.punchCd -= dt;
      if (player.fireCd > 0) player.fireCd -= dt;
      const wantPunch = (actions & 16) || (input.mouseDown && state.weapon === 'fists');
      const wantFire = input.mouseDown && state.weapon === 'pistol';
      if (wantPunch && player.punchCd <= 0) {
        player.punchCd = PLAYER.punchCooldown;
        events |= doPunch();
      } else if (wantFire && player.fireCd <= 0) {
        player.fireCd = 0.16;
        if (state.ammo > 0) {
          state.ammo -= 1;
          fireBullet(aimAngle);
          crime(0.6, player.x, player.y);
          events |= EVENT_SHOT;
        } else {
          events |= EVENT_SHOT; // dry click: main plays the click via the same flag path
        }
      }
      // Pickups.
      for (const pickup of state.pickups) {
        if (pickup.taken) {
          pickup.respawn -= dt;
          if (pickup.respawn <= 0) pickup.taken = false;
          continue;
        }
        if (pickup.kind === 'pistol' && dist2(player.x, player.y, pickup.x, pickup.y) < 30 * 30) {
          pickup.taken = true;
          pickup.respawn = 25;
          state.weapon = 'pistol';
          state.ammo += 24;
          events |= EVENT_PICKUP | setPhone('Found a pistol. Mouse aims, click fires. J still punches.', 'VICE HEAT');
        }
      }
    }
    if (player.punchCd > 0 && player.inCar) player.punchCd -= dt;
    if (player.fireCd > 0 && player.inCar) player.fireCd -= dt;

    // Traffic & police.
    for (const car of state.cars) updateTrafficCar(dt, car);
    // Police presence follows the wanted level. Wrecked units still count toward the cap
    // (they are towed away below), so a wreck never triggers an endless stream of replacements.
    state.stars = state.heat <= 0 ? 0 : Math.min(5, Math.ceil(state.heat));
    const policeNow = state.cars.filter((c) => c.driver === 'police' && !c.wreck);
    const policeTotal = state.cars.filter((c) => c.driver === 'police').length;
    const policeWanted = state.stars === 0 ? 0 : Math.min(COUNTS.policeMax, state.stars + 1);
    if (policeTotal < policeWanted) spawnPolice();
    // Tow wrecks away so the streets (and the entity count) stay sane.
    for (const car of state.cars) {
      if (car.wreck && car !== player.inCar) car.wreckAge += dt;
    }
    state.cars = state.cars.filter((car) => !car.wreck || car === player.inCar || car.wreckAge < (car.driver === 'police' ? 5 : 25));
    if (policeNow.length > policeWanted) {
      // Extras peel off and despawn far away.
      for (const car of policeNow) {
        if (dist2(car.x, car.y, player.x, player.y) > 700 * 700) {
          state.cars = state.cars.filter((c) => c !== car);
          break;
        }
      }
    }
    // Line of sight: any live police car within 520 sees the player.
    state.seen = policeNow.some((c) => dist2(c.x, c.y, player.x, player.y) < 520 * 520);
    if (state.seen) {
      state.hideTimer = 0;
    } else if (state.stars > 0) {
      state.hideTimer += dt;
      if (state.hideTimer >= WANTED.coolTime) {
        state.hideTimer = 0;
        state.heat = Math.max(0, state.heat - 1);
      }
    }
    // BUSTED meter: police close while the player is slow.
    const playerSpeed = player.inCar ? player.inCar.speed : 0;
    const nearPolice = policeNow.some((c) => dist2(c.x, c.y, player.x, player.y) < WANTED.bustedRange * WANTED.bustedRange);
    if (state.stars > 0 && nearPolice && playerSpeed < 42) {
      state.busted += dt * 0.85;
    } else {
      state.busted = Math.max(0, state.busted - dt * 0.8);
    }
    if (state.busted >= 1) {
      state.gameOver = 'busted';
      events |= EVENT_OVER;
    }

    // Pedestrians, bullets, particles, skids.
    for (const ped of state.peds) updatePed(dt, ped);
    state.peds = state.peds.filter((p) => !p.dead || p.deadT > 0);
    events |= updateBullets(dt);
    for (const p of state.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-2.4 * dt);
      p.vy *= Math.exp(-2.4 * dt);
    }
    state.particles = state.particles.filter((p) => p.life > 0);
    for (const s of state.skids) s.life -= dt;
    state.skids = state.skids.filter((s) => s.life > 0);

    // Keep the city populated near the player.
    trafficTimer -= dt;
    if (trafficTimer <= 0) {
      trafficTimer = 2.5;
      const trafficCount = state.cars.filter((c) => c.driver === 'ai').length;
      if (trafficCount < COUNTS.traffic) spawnTraffic(false);
      if (state.peds.length < COUNTS.peds) spawnPed(clamp(player.x + (random() - 0.5) * 900, 60, WORLD.shoreX - 60), clamp(player.y + (random() - 0.5) * 900, 60, WORLD.height - 60));
    }

    events |= updateMissions(dt);

    // Health: slow recovery when calm; death is WASTED.
    if (player.hurtT > 0) player.hurtT -= dt;
    if (player.health < PLAYER.health && state.stars === 0 && !player.inCar) {
      player.health = Math.min(PLAYER.health, player.health + dt * 2.2);
    }
    if (player.health <= 0 && !state.gameOver) {
      player.health = 0;
      state.gameOver = 'wasted';
      events |= EVENT_OVER;
    }

    // Timers on overlays.
    if (state.phone) {
      state.phone.t -= dt;
      if (state.phone.t <= 0) state.phone = null;
    }
    if (state.banner) {
      state.banner.t -= dt;
      if (state.banner.t <= 0) state.banner = null;
    }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 26);

    // Camera leads the velocity a little and stays inside the city.
    const focus = player.inCar ?? player;
    const lead = player.inCar ? 0.34 : 0.12;
    const tx = clamp(focus.x + (focus.vx ?? 0) * lead, 640, WORLD.width - 640);
    const ty = clamp(focus.y + (focus.vy ?? 0) * lead, 360, WORLD.height - 360);
    state.camera.x += (tx - state.camera.x) * clamp(dt * 5, 0, 1);
    state.camera.y += (ty - state.camera.y) * clamp(dt * 5, 0, 1);
    return events;
  }

  reset(null);
  return { state, reset, step, startMission };
}
