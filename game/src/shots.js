// The screenshot scenes behind ?shot=start|play|chase|end (with &seed=N). Each one resets the
// world with the seeded city and then places entities exactly — no simulation steps are run, so
// the frame is frozen and the same seed always gives the same picture. main.js paints it twice
// and sets window.__shotReady.
import { PLACES } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

function firstParked(state) {
  return state.cars.find((c) => c.driver === null && c.kind !== 'police') ?? state.cars[0];
}

function stageStart(world) {
  world.reset(null);
  const s = world.state;
  s.camera.x = 1540;
  s.camera.y = 1250;
  return { screen: SCREEN_TITLE, best: null, hasSave: false };
}

function stagePlay(world) {
  world.reset(null);
  const s = world.state;
  // The player stands downtown beside a parked sports car, pedestrians all around.
  const car = firstParked(s);
  car.kind = 'sports';
  car.color = '#ff2e88';
  car.x = s.player.x + 64;
  car.y = s.player.y + 6;
  car.angle = Math.PI / 2;
  car.vx = 0;
  car.vy = 0;
  const spots = [
    [-70, -50], [90, -70], [-110, 40], [130, 60], [-40, 90], [40, -110],
  ];
  s.peds.forEach((ped, i) => {
    const spot = spots[i % spots.length];
    ped.x = s.player.x + spot[0];
    ped.y = s.player.y + spot[1];
    ped.state = 'wander';
    ped.tx = ped.x;
    ped.ty = ped.y;
  });
  s.cash = 250;
  s.camera.x = s.player.x;
  s.camera.y = s.player.y;
  return { screen: SCREEN_PLAY, best: null, hasSave: false };
}

function stageChase(world) {
  world.reset(null);
  const s = world.state;
  // Player car at speed up the beachfront avenue, heading north, heat on its tail.
  const car = firstParked(s);
  car.kind = 'sports';
  car.color = '#2de2e6';
  car.x = 2890;
  car.y = 1560;
  car.angle = -Math.PI / 2;
  car.vx = 0;
  car.vy = -315;
  car.speed = 315;
  car.driver = 'player';
  s.player.inCar = car;
  s.player.x = car.x;
  s.player.y = car.y;
  s.speedKmh = 113;
  s.engineRatio = 0.73;
  s.heat = 3;
  s.stars = 3;
  s.seen = true;
  // Two police cars behind, closing in; other traffic is moved out of the frame.
  const cops = s.cars.filter((c) => c !== car && c.driver === 'ai').slice(0, 2);
  cops.forEach((cop, i) => {
    cop.kind = 'police';
    cop.driver = 'police';
    cop.color = '#dfe6e9';
    cop.x = 2890 + (i === 0 ? -36 : 32);
    cop.y = 1560 + 150 + i * 110;
    cop.angle = -Math.PI / 2;
    cop.vx = 0;
    cop.vy = -290;
    cop.speed = 290;
  });
  for (const other of s.cars) {
    if (other === car || cops.includes(other)) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    if (dx * dx + dy * dy < 560 * 560) {
      other.x = 400;
      other.y = 400;
    }
  }
  s.phone = null; // the chase frame is pure action: no phone panel over the police
  // A trail of skid marks from a drift onto the avenue.
  for (let i = 0; i < 12; i += 1) {
    s.skids.push({ x: 2876, y: 1620 + i * 26, a: -Math.PI / 2, life: 7 });
    s.skids.push({ x: 2904, y: 1620 + i * 26, a: -Math.PI / 2, life: 7 });
  }
  s.cash = 1450;
  s.objective = 'Lose the heat, then reach the safehouse';
  s.marker = { x: PLACES.safehouse.x, y: PLACES.safehouse.y, color: '#2de2e6', label: 'SAFEHOUSE' };
  s.camera.x = car.x;
  s.camera.y = car.y + 40;
  return { screen: SCREEN_PLAY, best: null, hasSave: false };
}

function stageEnd(world) {
  world.reset(null);
  const s = world.state;
  // Just delivered at Rosa's garage: the banner is up and the cash is counted.
  s.player.x = PLACES.garage.x - 40;
  s.player.y = PLACES.garage.y + 30;
  s.player.inCar = null;
  s.cash = 5200;
  s.missionIndex = 4;
  s.objective = 'Free roam — a fare is waiting (yellow marker)';
  s.banner = { title: 'MISSION COMPLETE', sub: '+$2,500', t: 999 };
  s.phone = null;
  s.stats.missions = 4;
  s.stats.earned = 5200;
  s.camera.x = PLACES.garage.x;
  s.camera.y = PLACES.garage.y;
  return { screen: SCREEN_PLAY, best: null, hasSave: false };
}

/**
 * Set `world` to the named scene (start, play, chase or end; any other name is start) and
 * return the screen to draw over it plus title-screen extras.
 */
export function stageShot(name, world) {
  if (name === 'play') return stagePlay(world);
  if (name === 'chase') return stageChase(world);
  if (name === 'end') return stageEnd(world);
  return stageStart(world);
}
