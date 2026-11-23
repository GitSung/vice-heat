// Keyboard and pointer input. Held keys are read as a state snapshot each step; one-shot
// presses (interact, pause, mute, confirm, menu picks) are queued as bit flags and taken once
// by the loop, so a press between two frames is never lost and never counted twice. The mouse
// position is kept in client pixels; the renderer turns it into logical / world coordinates.

export const ACTION_INTERACT = 1;
export const ACTION_PAUSE = 2;
export const ACTION_CONFIRM = 4;
export const ACTION_MUTE = 8;
export const ACTION_PUNCH = 16;
export const ACTION_NEWGAME = 32;

const HELD = {
  up: new Set(['ArrowUp', 'KeyW']),
  down: new Set(['ArrowDown', 'KeyS']),
  left: new Set(['ArrowLeft', 'KeyA']),
  right: new Set(['ArrowRight', 'KeyD']),
  handbrake: new Set(['Space']),
  sprint: new Set(['ShiftLeft', 'ShiftRight']),
  punchKey: new Set(['KeyJ']),
};
const ALL_HELD = new Set([...HELD.up, ...HELD.down, ...HELD.left, ...HELD.right, ...HELD.handbrake]);

export function createInput(target) {
  const held = { up: false, down: false, left: false, right: false, handbrake: false, sprint: false, punchKey: false };
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let clicks = [];

  function setHeld(code, value) {
    for (const name of Object.keys(HELD)) if (HELD[name].has(code)) held[name] = value;
  }

  window.addEventListener('keydown', (event) => {
    setHeld(event.code, true);
    if (!event.repeat) {
      if (event.code === 'KeyF' || event.code === 'KeyE') actions |= ACTION_INTERACT;
      else if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
      else if (event.code === 'Enter') actions |= ACTION_CONFIRM;
      else if (event.code === 'KeyM') actions |= ACTION_MUTE;
      else if (event.code === 'KeyJ') actions |= ACTION_PUNCH;
      else if (event.code === 'KeyN') actions |= ACTION_NEWGAME;
    }
    if (ALL_HELD.has(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => setHeld(event.code, false));
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    for (const name of Object.keys(held)) held[name] = false;
    mouseDown = false;
  });
  window.addEventListener('mousemove', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
  });
  target.addEventListener('pointerdown', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
    mouseDown = true;
    clicks.push({ x: event.clientX, y: event.clientY });
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    mouseDown = false;
  });

  return {
    held,
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Mouse state: client-pixel position and whether the button is held (aim / fire). */
    mouse() {
      return { x: mouseX, y: mouseY, down: mouseDown };
    },
    /** Clicks (client pixels) since the last call, for menus. */
    takeClicks() {
      const taken = clicks;
      clicks = [];
      return taken;
    },
  };
}
