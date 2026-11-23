// Vice Heat — drawing only: the world state and the current screen in, pixels out. The camera
// shows a 1280x720 logical window of Neon Bay, scaled to fit the screen and centred. Everything
// is flat canvas shapes in a dusk neon palette (magenta / cyan on deep blue): no images, no
// fonts to load, nothing fetched.
import { AVENUES_X, AVENUES_Y, PALETTE, PLACES, ROAD, VIEW, WORLD, FONT } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const TAU = Math.PI * 2;

/** The start screen's buttons, in logical coordinates; main hit-tests clicks against these. */
export function titleButtons(hasSave) {
  const buttons = [];
  let y = 396;
  if (hasSave) {
    buttons.push({ id: 'continue', x: VIEW.width / 2 - 130, y, w: 260, h: 46, label: 'CONTINUE' });
    y += 60;
  }
  buttons.push({ id: 'new', x: VIEW.width / 2 - 130, y, w: 260, h: 46, label: 'NEW GAME' });
  return buttons;
}

function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, dpr: 1 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    view.dpr = ratio;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    view.scale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
    view.x = (canvas.width - VIEW.width * view.scale) / 2;
    view.y = (canvas.height - VIEW.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align = 'left', weight = '') {
    const key = `${size}${weight}`;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function toLogical(clientX, clientY) {
    return {
      x: (clientX * view.dpr - view.x) / view.scale,
      y: (clientY * view.dpr - view.y) / view.scale,
    };
  }

  function toWorld(clientX, clientY, state) {
    const logical = toLogical(clientX, clientY);
    return {
      x: state.camera.x + (logical.x - VIEW.width / 2),
      y: state.camera.y + (logical.y - VIEW.height / 2),
    };
  }

  // ---- world ------------------------------------------------------------
  function drawGround(state, left, top) {
    context.fillStyle = PALETTE.blockGround;
    context.fillRect(left, top, VIEW.width, VIEW.height);
    // Sand and sea along the east edge.
    context.fillStyle = PALETTE.sand;
    context.fillRect(WORLD.shoreX - 92, top, 92, VIEW.height);
    context.fillStyle = PALETTE.water;
    context.fillRect(WORLD.shoreX, top, VIEW.width, VIEW.height);
    context.strokeStyle = PALETTE.waterLine;
    context.lineWidth = 2;
    for (let y = Math.floor(top / 90) * 90; y < top + VIEW.height; y += 90) {
      context.beginPath();
      context.moveTo(WORLD.shoreX + 16, y + 20);
      context.lineTo(WORLD.shoreX + 120, y + 20);
      context.moveTo(WORLD.shoreX + 60, y + 58);
      context.lineTo(WORLD.shoreX + 190, y + 58);
      context.stroke();
    }
    // Roads: sidewalk slab, asphalt, neon edge lines, dashed centre line.
    for (const ax of AVENUES_X) {
      context.fillStyle = PALETTE.sidewalk;
      context.fillRect(ax - ROAD.width / 2 - 13, top, ROAD.width + 26, VIEW.height);
    }
    for (const ay of AVENUES_Y) {
      context.fillStyle = PALETTE.sidewalk;
      context.fillRect(left, ay - ROAD.width / 2 - 13, VIEW.width, ROAD.width + 26);
    }
    context.fillStyle = PALETTE.road;
    for (const ax of AVENUES_X) context.fillRect(ax - ROAD.width / 2, top, ROAD.width, VIEW.height);
    for (const ay of AVENUES_Y) context.fillRect(left, ay - ROAD.width / 2, VIEW.width, ROAD.width);
    context.fillStyle = PALETTE.roadEdge;
    for (const ax of AVENUES_X) {
      context.fillRect(ax - ROAD.width / 2, top, 2, VIEW.height);
      context.fillRect(ax + ROAD.width / 2 - 2, top, 2, VIEW.height);
    }
    for (const ay of AVENUES_Y) {
      context.fillRect(left, ay - ROAD.width / 2, VIEW.width, 2);
      context.fillRect(left, ay + ROAD.width / 2 - 2, VIEW.width, 2);
    }
    context.fillStyle = PALETTE.lane;
    for (const ax of AVENUES_X) {
      for (let y = Math.floor(top / 64) * 64; y < top + VIEW.height; y += 64) context.fillRect(ax - 2, y, 4, 30);
    }
    for (const ay of AVENUES_Y) {
      for (let x = Math.floor(left / 64) * 64; x < left + VIEW.width; x += 64) context.fillRect(x, ay - 2, 30, 4);
    }
    // Named places: Rosa's garage and the safehouse get painted pads.
    context.fillStyle = 'rgba(255, 46, 136, 0.16)';
    context.fillRect(PLACES.garage.x - 70, PLACES.garage.y - 70, 140, 140);
    context.strokeStyle = PALETTE.magenta;
    context.lineWidth = 2;
    context.strokeRect(PLACES.garage.x - 70, PLACES.garage.y - 70, 140, 140);
    context.fillStyle = 'rgba(45, 226, 230, 0.13)';
    context.fillRect(PLACES.safehouse.x - 76, PLACES.safehouse.y - 76, 152, 152);
    context.strokeStyle = PALETTE.cyan;
    context.strokeRect(PLACES.safehouse.x - 76, PLACES.safehouse.y - 76, 152, 152);
  }

  function drawBuilding(b) {
    const roof = b.district === 'industrial' ? PALETTE.warehouse : b.district === 'downtown' ? PALETTE.tower : b.district === 'beach' ? '#2a2350' : PALETTE.buildingRoof;
    context.fillStyle = 'rgba(0,0,0,0.4)';
    context.fillRect(b.x + 7, b.y + 9, b.w, b.h);
    context.fillStyle = roof;
    context.fillRect(b.x, b.y, b.w, b.h);
    context.strokeStyle = b.district === 'beach' ? PALETTE.magenta : PALETTE.buildingEdge;
    context.lineWidth = 2;
    context.strokeRect(b.x, b.y, b.w, b.h);
    // Windows: a deterministic lit pattern per building.
    const cols = Math.max(2, Math.floor(b.w / 26));
    const rows = Math.max(2, Math.floor(b.h / 26));
    for (let cx = 0; cx < cols; cx += 1) {
      for (let cy = 0; cy < rows; cy += 1) {
        const h = hash(b.x * 3 + cx * 17 + cy * 31 + b.y);
        if (h < 0.42) continue;
        context.fillStyle = h > 0.93 ? PALETTE.windowNeon : PALETTE.windowLit;
        context.globalAlpha = 0.5 + h * 0.5;
        context.fillRect(b.x + 8 + cx * 26, b.y + 8 + cy * 26, 11, 8);
      }
    }
    context.globalAlpha = 1;
    if (b.district === 'downtown') {
      context.fillStyle = PALETTE.magenta;
      context.fillRect(b.x, b.y, b.w, 4);
    }
  }

  function drawProp(p) {
    if (p.kind === 'palm') {
      context.strokeStyle = '#0e5c46';
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(p.x, p.y);
      context.lineTo(p.x + 4, p.y - 16);
      context.stroke();
      context.strokeStyle = '#19b37b';
      context.lineWidth = 3;
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * TAU + 0.5;
        context.beginPath();
        context.moveTo(p.x + 4, p.y - 16);
        context.lineTo(p.x + 4 + Math.cos(a) * 17, p.y - 16 + Math.sin(a) * 10 - 4);
        context.stroke();
      }
    } else {
      context.fillStyle = '#39477f';
      context.fillRect(p.x - 2, p.y - 12, 4, 12);
      context.fillStyle = PALETTE.gold;
      context.beginPath();
      context.arc(p.x, p.y - 15, 4.5, 0, TAU);
      context.fill();
      context.fillStyle = 'rgba(255, 209, 102, 0.13)';
      context.beginPath();
      context.arc(p.x, p.y - 15, 17, 0, TAU);
      context.fill();
    }
  }

  function drawCar(car, state) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    // Headlight cone (dusk: every driven car throws one).
    if (car.driver) {
      const grad = context.createLinearGradient(20, 0, 150, 0);
      grad.addColorStop(0, 'rgba(255, 240, 190, 0.20)');
      grad.addColorStop(1, 'rgba(255, 240, 190, 0)');
      context.fillStyle = grad;
      context.beginPath();
      context.moveTo(20, -7);
      context.lineTo(150, -34);
      context.lineTo(150, 34);
      context.lineTo(20, 7);
      context.closePath();
      context.fill();
    }
    const w = car.width;
    const h = car.height;
    context.fillStyle = 'rgba(0,0,0,0.35)';
    context.fillRect(-w / 2 + 3, -h / 2 + 4, w, h);
    context.fillStyle = car.wreck ? '#3a3f55' : car.color;
    context.beginPath();
    context.roundRect(-w / 2, -h / 2, w, h, 7);
    context.fill();
    // Cabin and glass.
    context.fillStyle = '#10182e';
    context.beginPath();
    context.roundRect(-w * 0.18, -h / 2 + 3, w * 0.34, h - 6, 4);
    context.fill();
    context.fillStyle = 'rgba(45, 226, 230, 0.5)';
    context.fillRect(w * 0.13, -h / 2 + 4, 4, h - 8);
    if (car.kind === 'sports') {
      context.fillStyle = '#0d0d1f';
      context.fillRect(-w / 2 + 1, -h / 2 - 2, 6, h + 4);
      context.fillStyle = PALETTE.magenta;
      context.fillRect(-2, -h / 2, 3, h);
    }
    if (car.kind === 'taxi') {
      context.fillStyle = '#111';
      context.fillRect(-6, -6, 12, 12);
      context.fillStyle = PALETTE.gold;
      context.fillRect(-4, -4, 8, 8);
    }
    if (car.kind === 'police') {
      context.fillStyle = '#1b2a6b';
      context.fillRect(-w / 2 + 6, -h / 2, 10, h);
      context.fillRect(w / 2 - 16, -h / 2, 10, h);
      const flash = Math.floor(state.time * 3) % 2 === 0;
      context.fillStyle = flash ? '#ff4757' : '#3742fa';
      context.fillRect(-4, -h / 2 + 2, 8, 7);
      context.fillStyle = flash ? '#3742fa' : '#ff4757';
      context.fillRect(-4, h / 2 - 9, 8, 7);
    }
    // Headlights and tail lights.
    context.fillStyle = '#fff6c9';
    context.fillRect(w / 2 - 3, -h / 2 + 3, 3, 5);
    context.fillRect(w / 2 - 3, h / 2 - 8, 3, 5);
    context.fillStyle = '#ff4757';
    context.fillRect(-w / 2, -h / 2 + 3, 3, 5);
    context.fillRect(-w / 2, h / 2 - 8, 3, 5);
    context.restore();
  }

  function drawPed(ped) {
    if (ped.dead) {
      context.save();
      context.translate(ped.x, ped.y);
      context.rotate(ped.angle);
      context.fillStyle = '#57606f';
      context.fillRect(-10, -5, 20, 10);
      context.restore();
      return;
    }
    const bob = Math.sin(ped.walk) * 1.6;
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.beginPath();
    context.arc(ped.x, ped.y + 3, 9, 0, TAU);
    context.fill();
    context.fillStyle = ped.state === 'wait' ? PALETTE.gold : ped.color;
    context.beginPath();
    context.arc(ped.x, ped.y + bob * 0.3, 8, 0, TAU);
    context.fill();
    context.fillStyle = '#f1c27d';
    context.beginPath();
    context.arc(ped.x + Math.cos(ped.angle) * 3, ped.y + Math.sin(ped.angle) * 3, 4.5, 0, TAU);
    context.fill();
  }

  function drawPlayer(state) {
    const p = state.player;
    if (p.inCar) return;
    context.fillStyle = 'rgba(0,0,0,0.35)';
    context.beginPath();
    context.arc(p.x, p.y + 4, 11, 0, TAU);
    context.fill();
    context.save();
    context.translate(p.x, p.y);
    context.rotate(p.angle);
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(0, 0, 10, 0, TAU);
    context.fill();
    context.fillStyle = '#0b2a52';
    context.fillRect(4, -3, 12, 6); // arm / gun direction
    if (state.weapon === 'pistol') {
      context.fillStyle = '#dfe6e9';
      context.fillRect(12, -2, 9, 4);
    }
    context.restore();
    context.fillStyle = '#ffe9c9';
    context.beginPath();
    context.arc(p.x, p.y, 5.5, 0, TAU);
    context.fill();
  }

  function drawMarker(state) {
    const m = state.marker;
    if (!m) return;
    const pulse = 26 + Math.sin(state.time * 4) * 6;
    context.strokeStyle = m.color;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(m.x, m.y, pulse, 0, TAU);
    context.stroke();
    context.fillStyle = m.color;
    context.globalAlpha = 0.14;
    context.beginPath();
    context.moveTo(m.x - 10, m.y - 120);
    context.lineTo(m.x + 10, m.y - 120);
    context.lineTo(m.x, m.y);
    context.closePath();
    context.fill();
    context.globalAlpha = 1;
    context.save();
    context.translate(m.x, m.y - 44 - Math.sin(state.time * 3) * 5);
    context.rotate(Math.PI / 4);
    context.fillStyle = m.color;
    context.fillRect(-9, -9, 18, 18);
    context.restore();
    context.textBaseline = 'middle';
    text(m.label, m.x, m.y - 74, 15, m.color, 'center', 'bold');
  }

  function drawWorld(state) {
    const cam = state.camera;
    const shakeX = state.shake ? (hash(state.time * 91) - 0.5) * state.shake : 0;
    const shakeY = state.shake ? (hash(state.time * 57 + 9) - 0.5) * state.shake : 0;
    const left = cam.x - VIEW.width / 2 + shakeX;
    const top = cam.y - VIEW.height / 2 + shakeY;
    context.save();
    context.translate(-left, -top);
    drawGround(state, left, top);
    const right = left + VIEW.width;
    const bottom = top + VIEW.height;
    for (const s of state.skids) {
      if (s.x < left || s.x > right || s.y < top || s.y > bottom) continue;
      context.save();
      context.translate(s.x, s.y);
      context.rotate(s.a);
      context.fillStyle = `rgba(5, 5, 12, ${Math.min(0.7, s.life * 0.25)})`;
      context.fillRect(-9, -3.5, 18, 7);
      context.restore();
    }
    for (const b of state.buildings) {
      if (b.x + b.w < left || b.x > right || b.y + b.h < top || b.y > bottom) continue;
      drawBuilding(b);
    }
    for (const p of state.props) {
      if (p.x < left - 30 || p.x > right + 30 || p.y < top - 30 || p.y > bottom + 30) continue;
      drawProp(p);
    }
    for (const pickup of state.pickups) {
      if (pickup.taken) continue;
      const bob = Math.sin(state.time * 3 + pickup.x) * 3;
      context.fillStyle = PALETTE.gold;
      context.save();
      context.translate(pickup.x, pickup.y + bob);
      context.rotate(Math.PI / 4);
      context.fillRect(-8, -8, 16, 16);
      context.restore();
      context.textBaseline = 'middle';
      text('PISTOL', pickup.x, pickup.y - 26 + bob, 12, PALETTE.gold, 'center', 'bold');
    }
    drawMarker(state);
    for (const ped of state.peds) {
      if (ped.x < left - 20 || ped.x > right + 20 || ped.y < top - 20 || ped.y > bottom + 20) continue;
      drawPed(ped);
    }
    for (const car of state.cars) {
      if (car.x < left - 90 || car.x > right + 90 || car.y < top - 90 || car.y > bottom + 90) continue;
      drawCar(car, state);
    }
    drawPlayer(state);
    // Bullets as tracers.
    context.strokeStyle = '#ffeaa7';
    context.lineWidth = 2;
    for (const b of state.bullets) {
      context.beginPath();
      context.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
    for (const p of state.particles) {
      context.globalAlpha = Math.max(0, p.life / p.max);
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, TAU);
      context.fill();
    }
    context.globalAlpha = 1;
    context.restore();
  }

  // ---- HUD ---------------------------------------------------------------
  function drawMinimap(state) {
    const w = 196;
    const h = 152;
    const x = 16;
    const y = VIEW.height - h - 16;
    const sx = w / WORLD.width;
    const sy = h / WORLD.height;
    context.fillStyle = 'rgba(8, 10, 28, 0.82)';
    context.fillRect(x, y, w, h);
    context.strokeStyle = PALETTE.cyan;
    context.lineWidth = 1.5;
    context.strokeRect(x, y, w, h);
    context.fillStyle = PALETTE.water;
    context.fillRect(x + WORLD.shoreX * sx, y, w - WORLD.shoreX * sx, h);
    context.strokeStyle = '#3d4a7a';
    context.lineWidth = 2;
    for (const ax of AVENUES_X) {
      context.beginPath();
      context.moveTo(x + ax * sx, y);
      context.lineTo(x + ax * sx, y + h);
      context.stroke();
    }
    for (const ay of AVENUES_Y) {
      context.beginPath();
      context.moveTo(x, y + ay * sy);
      context.lineTo(x + w, y + ay * sy);
      context.stroke();
    }
    if (state.marker) {
      context.fillStyle = state.marker.color;
      context.beginPath();
      context.arc(x + state.marker.x * sx, y + state.marker.y * sy, 4, 0, TAU);
      context.fill();
    }
    for (const car of state.cars) {
      if (car.driver !== 'police' || car.wreck) continue;
      context.fillStyle = Math.floor(state.time * 3) % 2 ? '#ff4757' : '#3742fa';
      context.fillRect(x + car.x * sx - 2.5, y + car.y * sy - 2.5, 5, 5);
    }
    // Player arrow.
    const px = x + state.player.x * sx;
    const py = y + state.player.y * sy;
    context.save();
    context.translate(px, py);
    context.rotate(state.player.inCar ? state.player.inCar.angle : state.player.angle);
    context.fillStyle = '#fff';
    context.beginPath();
    context.moveTo(7, 0);
    context.lineTo(-5, -4.5);
    context.lineTo(-5, 4.5);
    context.closePath();
    context.fill();
    context.restore();
  }

  function drawHud(state) {
    context.textBaseline = 'alphabetic';
    // Cash and health, top left.
    text(`$${state.cash}`, 22, 42, 30, PALETTE.gold, 'left', 'bold');
    context.fillStyle = 'rgba(0,0,0,0.45)';
    context.fillRect(22, 54, 170, 13);
    context.fillStyle = state.player.health > 30 ? '#2ed573' : PALETTE.danger;
    context.fillRect(22, 54, 170 * Math.max(0, state.player.health / 100), 13);
    if (state.player.inCar) {
      context.fillStyle = 'rgba(0,0,0,0.45)';
      context.fillRect(22, 72, 170, 9);
      context.fillStyle = '#a29bfe';
      context.fillRect(22, 72, 170 * Math.max(0, state.player.inCar.health / 100), 9);
      text(`${state.speedKmh} km/h`, VIEW.width - 22, VIEW.height - 24, 30, PALETTE.text, 'right', 'bold');
    }
    // Wanted stars, top right.
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < state.stars ? '★' : '☆';
    text(stars, VIEW.width - 22, 44, 30, state.stars ? PALETTE.danger : PALETTE.muted, 'right', 'bold');
    text(state.weapon === 'pistol' ? `PISTOL · ${state.ammo}` : 'FISTS', VIEW.width - 22, 74, 16, PALETTE.muted, 'right', 'bold');
    // Objective, top centre.
    if (state.objective) {
      context.fillStyle = 'rgba(8, 10, 28, 0.66)';
      const w = Math.min(620, 30 + state.objective.length * 9.5);
      context.fillRect(VIEW.width / 2 - w / 2, 14, w, state.missionTimer !== null ? 62 : 40);
      text(state.objective, VIEW.width / 2, 42, 18, PALETTE.text, 'center', 'bold');
      if (state.missionTimer !== null) {
        const t = Math.max(0, Math.ceil(state.missionTimer));
        text(`${t}s`, VIEW.width / 2, 68, 17, t < 15 ? PALETTE.danger : PALETTE.gold, 'center', 'bold');
      }
    }
    // BUSTED meter.
    if (state.busted > 0.02) {
      const w = 300;
      context.fillStyle = 'rgba(0,0,0,0.55)';
      context.fillRect(VIEW.width / 2 - w / 2, VIEW.height - 120, w, 18);
      context.fillStyle = PALETTE.danger;
      context.fillRect(VIEW.width / 2 - w / 2, VIEW.height - 120, w * Math.min(1, state.busted), 18);
      text('BUSTED?', VIEW.width / 2, VIEW.height - 128, 16, PALETTE.danger, 'center', 'bold');
    }
    // Interact prompt.
    if (!state.player.inCar) {
      for (const car of state.cars) {
        if (car.wreck) continue;
        const dx = car.x - state.player.x;
        const dy = car.y - state.player.y;
        if (dx * dx + dy * dy < 68 * 68) {
          text('F / E — ENTER CAR', VIEW.width / 2, VIEW.height - 60, 19, PALETTE.cyan, 'center', 'bold');
          break;
        }
      }
    } else {
      text('F / E — EXIT · SPACE — HANDBRAKE', VIEW.width / 2, VIEW.height - 24, 14, PALETTE.muted, 'center');
    }
    // Phone message.
    if (state.phone) {
      const w = 560;
      const h = 74;
      const x = VIEW.width / 2 - w / 2;
      const y = VIEW.height - h - (state.player.inCar ? 44 : 76);
      context.fillStyle = 'rgba(6, 8, 24, 0.92)';
      context.beginPath();
      context.roundRect(x, y, w, h, 10);
      context.fill();
      context.strokeStyle = PALETTE.magenta;
      context.lineWidth = 1.5;
      context.stroke();
      text(`📱 ${state.phone.from}`, x + 16, y + 24, 14, PALETTE.magenta, 'left', 'bold');
      // Wrap the message on word boundaries, two lines at most.
      const words = state.phone.text.split(' ');
      const lines = [''];
      for (const word of words) {
        const current = lines[lines.length - 1];
        if (current && current.length + 1 + word.length > 54) {
          if (lines.length === 2) break;
          lines.push(word);
        } else {
          lines[lines.length - 1] = current ? `${current} ${word}` : word;
        }
      }
      text(lines[0], x + 16, y + 46, 15, PALETTE.text, 'left');
      if (lines[1]) text(lines[1], x + 16, y + 65, 15, PALETTE.text, 'left');
    }
    // Mission banner.
    if (state.banner) {
      context.fillStyle = 'rgba(6, 8, 24, 0.78)';
      context.fillRect(0, 218, VIEW.width, 118);
      text(state.banner.title, VIEW.width / 2, 268, 44, PALETTE.gold, 'center', 'bold');
      text(state.banner.sub, VIEW.width / 2, 308, 26, PALETTE.cyan, 'center', 'bold');
    }
    drawMinimap(state);
  }

  // ---- screens -------------------------------------------------------------
  const CONTROLS = [
    'WASD / Arrows — move & drive',
    'F or E — enter / exit car',
    'Space — handbrake · Shift — sprint',
    'Mouse — aim · Click — punch / shoot · J — punch',
    'Esc / P — pause · M — mute',
  ];

  function drawTitle(state, best, hasSave) {
    context.fillStyle = 'rgba(5, 6, 20, 0.62)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    text('VICE HEAT', VIEW.width / 2, 168, 92, PALETTE.magenta, 'center', 'bold');
    text('— NEON BAY —', VIEW.width / 2, 214, 30, PALETTE.cyan, 'center', 'bold');
    text('A top-down crime spree in an original neon city. Steal cars, run jobs for Mama Rosa, dodge the heat.', VIEW.width / 2, 258, 18, PALETTE.text, 'center');
    for (const b of titleButtons(hasSave)) {
      context.fillStyle = 'rgba(10, 12, 34, 0.9)';
      context.beginPath();
      context.roundRect(b.x, b.y, b.w, b.h, 8);
      context.fill();
      context.strokeStyle = PALETTE.cyan;
      context.lineWidth = 2;
      context.stroke();
      context.textBaseline = 'middle';
      text(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1, 21, PALETTE.text, 'center', 'bold');
      context.textBaseline = 'alphabetic';
    }
    const y0 = hasSave ? 540 : 492;
    CONTROLS.forEach((line, i) => text(line, VIEW.width / 2, y0 + i * 24, 16, PALETTE.muted, 'center'));
    if (best && best.missions > 0) {
      text(`Best: $${best.cash} banked · ${best.missions} story jobs done`, VIEW.width / 2, y0 + CONTROLS.length * 24 + 14, 15, PALETTE.gold, 'center');
    }
  }

  function drawOver(state, best) {
    context.fillStyle = state.gameOver === 'busted' ? 'rgba(10, 16, 60, 0.72)' : 'rgba(50, 4, 14, 0.72)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    const title = state.gameOver === 'busted' ? 'BUSTED' : 'WASTED';
    text(title, VIEW.width / 2, 300, 96, state.gameOver === 'busted' ? '#5f7cff' : PALETTE.danger, 'center', 'bold');
    text(`Cash banked: $${state.cash} · Earned this run: $${state.stats.earned}`, VIEW.width / 2, 356, 22, PALETTE.text, 'center');
    text(`Cars stolen: ${state.stats.stolen} · Top speed: ${state.stats.topSpeed} km/h · Jobs done: ${state.stats.missions}`, VIEW.width / 2, 390, 19, PALETTE.muted, 'center');
    if (best) text(`Best cash: $${best.cash}`, VIEW.width / 2, 424, 18, PALETTE.gold, 'center');
    text('Press ENTER to try again', VIEW.width / 2, 480, 22, PALETTE.cyan, 'center', 'bold');
  }

  function drawPaused() {
    context.fillStyle = 'rgba(5, 6, 20, 0.66)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    text('PAUSED', VIEW.width / 2, 300, 54, PALETTE.text, 'center', 'bold');
    CONTROLS.forEach((line, i) => text(line, VIEW.width / 2, 356 + i * 26, 17, PALETTE.muted, 'center'));
    text('Esc / P — resume', VIEW.width / 2, 356 + CONTROLS.length * 26 + 16, 18, PALETTE.cyan, 'center', 'bold');
  }

  /** Paint one frame. `opts` carries {best, hasSave} for the title / over screens. */
  function draw(state, screen, opts = {}) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawWorld(state);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, opts.best, opts.hasSave);
      return;
    }
    drawHud(state);
    if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_OVER) drawOver(state, opts.best);
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, toLogical, toWorld };
}
