// Vice Heat — boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps, and the renderer paints what is there. Screens: title, play, paused, and the
// BUSTED / WASTED end screen. Progress (cash, story position, best stats) lives in localStorage.
//
// ?seed=N fixes the city layout. ?shot=start|play|chase|end (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld,
  EVENT_CASH,
  EVENT_CRASH,
  EVENT_ENTER,
  EVENT_FAIL,
  EVENT_HIT,
  EVENT_JINGLE,
  EVENT_OVER,
  EVENT_PHONE,
  EVENT_PICKUP,
  EVENT_PUNCH,
  EVENT_SHOT,
} from './world.js';
import { ACTION_CONFIRM, ACTION_INTERACT, ACTION_MUTE, ACTION_NEWGAME, ACTION_PAUSE, ACTION_PUNCH, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, titleButtons } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.cash !== 'number' || typeof parsed?.missionIndex !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, { best: scene.best, hasSave: scene.hasSave });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let save = readSave();
  let best = save?.best ?? null;
  let accumulator = 0;
  let last = performance.now();
  let skidSoundAt = 0;

  function announce(message) {
    status.textContent = message;
  }

  function persist() {
    const state = world.state;
    const candidate = {
      cash: Math.max(state.cash, best?.cash ?? 0),
      missions: Math.max(state.stats.missions, best?.missions ?? 0),
      topSpeed: Math.max(state.stats.topSpeed, best?.topSpeed ?? 0),
    };
    best = candidate;
    save = { cash: state.cash, missionIndex: state.missionIndex, best };
    writeSave(save);
  }

  function startRun(fromSave) {
    world.reset(fromSave ? save : null);
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce(fromSave ? 'Welcome back to Neon Bay.' : 'Vice Heat. Steal the pink sports car.');
  }

  function endRun() {
    screen = SCREEN_OVER;
    persist();
    if (world.state.gameOver === 'busted') audio.busted();
    else audio.fail();
    audio.engine(0, false);
    audio.siren(false);
    announce(world.state.gameOver === 'busted' ? 'Busted.' : 'Wasted.');
  }

  function handleEvents(events) {
    const state = world.state;
    if (events & EVENT_CRASH) audio.crash(state.crashStrength);
    else if (events & EVENT_HIT) audio.punch();
    if (events & EVENT_SHOT) {
      if (state.weapon === 'pistol' && state.ammo === 0 && !state.player.inCar) audio.dryFire();
      else audio.gunshot();
    }
    if (events & EVENT_PUNCH) audio.punch();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_PHONE) audio.phone();
    if (events & EVENT_JINGLE) {
      audio.jingle();
      persist();
    }
    if (events & EVENT_CASH) audio.cash();
    if (events & EVENT_FAIL) audio.fail();
    if (events & EVENT_ENTER) audio.unlock();
    if (events & EVENT_OVER) endRun();
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (actions) audio.unlock();
    const clicks = input.takeClicks();
    if (screen === SCREEN_TITLE) {
      for (const click of clicks) {
        const point = renderer.toLogical(click.x, click.y);
        for (const button of titleButtons(save !== null)) {
          if (point.x >= button.x && point.x <= button.x + button.w && point.y >= button.y && point.y <= button.y + button.h) {
            if (button.id === 'continue') startRun(true);
            else {
              clearSave();
              save = null;
              best = null;
              startRun(false);
            }
            return actions & ~(ACTION_INTERACT | ACTION_PUNCH);
          }
        }
      }
      if (actions & ACTION_NEWGAME) {
        clearSave();
        save = null;
        best = null;
        startRun(false);
      } else if (actions & ACTION_CONFIRM) {
        startRun(save !== null);
      }
      return 0; // menu clicks must not leak into the world as punches / interacts
    }
    if (screen === SCREEN_OVER) {
      if (actions & (ACTION_CONFIRM | ACTION_NEWGAME)) startRun(true);
      return 0;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        persist();
        audio.engine(0, false);
        audio.siren(false);
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return actions & ~(ACTION_INTERACT | ACTION_PUNCH);
    }
    if (screen === SCREEN_PAUSED) return 0;
    return actions;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const worldActions = handleActions();
    if (screen === SCREEN_PLAY) {
      const mouse = input.mouse();
      const state = world.state;
      const aimPoint = renderer.toWorld(mouse.x, mouse.y, state);
      const aimAngle = Math.atan2(aimPoint.y - state.player.y, aimPoint.x - state.player.x);
      const stepInput = { held: input.held, mouseDown: mouse.down };
      let guard = 0;
      let pendingActions = worldActions;
      while (accumulator >= STEP && screen === SCREEN_PLAY && guard < 8) {
        const events = world.step(STEP, stepInput, pendingActions, aimAngle);
        pendingActions = 0; // one-shot presses fire on the first step of the frame only
        handleEvents(events);
        accumulator -= STEP;
        guard += 1;
      }
      if (screen === SCREEN_PLAY) {
        audio.engine(state.engineRatio, state.player.inCar !== null);
        audio.siren(state.stars > 0 && state.seen);
        if (state.skidAmount > 0 && now - skidSoundAt > 90) {
          skidSoundAt = now;
          audio.skid(state.skidAmount);
        }
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, { best, hasSave: save !== null });
  }

  // Leaving the tab pauses a running game rather than letting Neon Bay run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Vice Heat. Press Enter or click New Game to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
