/** Keyboard bindings as KeyboardEvent.code values. Configurable; persisted by the save system (Milestone 14). */
export interface Bindings {
  accelerate: string[];
  brake: string[];
  left: string[];
  right: string[];
  gearUp: string[];
  gearDown: string[];
  pause: string[];
}

export const DEFAULT_BINDINGS: Bindings = {
  accelerate: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  gearUp: ['ShiftLeft', 'ShiftRight'],
  gearDown: ['KeyZ'],
  pause: ['Escape'],
};

export type BindingAction = keyof Bindings;

/** Actions in the order the settings screen lists them, with their on-screen names. */
export const BINDING_ACTIONS: { action: BindingAction; label: string }[] = [
  { action: 'accelerate', label: 'ACCELERATE' },
  { action: 'brake', label: 'BRAKE' },
  { action: 'left', label: 'STEER LEFT' },
  { action: 'right', label: 'STEER RIGHT' },
  { action: 'gearUp', label: 'GEAR UP' },
  { action: 'gearDown', label: 'GEAR DOWN' },
  { action: 'pause', label: 'PAUSE' },
];

export const cloneBindings = (b: Bindings): Bindings => ({
  accelerate: [...b.accelerate], brake: [...b.brake], left: [...b.left], right: [...b.right],
  gearUp: [...b.gearUp], gearDown: [...b.gearDown], pause: [...b.pause],
});

/** Keys that must stay free for other features (mute) or the browser. */
export const RESERVED_KEYS = ['KeyX', 'F5', 'F11', 'F12', 'Tab'];

/** Reads saved bindings defensively: each action needs 1-4 plausible key codes, otherwise it keeps its default. */
export function parseBindings(raw: unknown): Bindings {
  const out = cloneBindings(DEFAULT_BINDINGS);
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;
  for (const { action } of BINDING_ACTIONS) {
    const list = r[action];
    if (!Array.isArray(list)) continue;
    const codes = list.filter((c): c is string => typeof c === 'string' && /^[A-Za-z0-9]{1,24}$/.test(c) && !RESERVED_KEYS.includes(c));
    const unique = [...new Set(codes)].slice(0, 4);
    if (unique.length > 0) out[action] = unique;
  }
  return out;
}

/** Makes `code` the main key for `action` (the old main key is kept as an alternative) and frees it from other actions. */
export function bindKey(b: Bindings, action: BindingAction, code: string): Bindings {
  const out = cloneBindings(b);
  for (const { action: other } of BINDING_ACTIONS) {
    if (other === action) continue;
    out[other] = out[other].filter((c) => c !== code);
    // Never leave an action without any key: restore its default if we just took its last one.
    if (out[other].length === 0) out[other] = DEFAULT_BINDINGS[other].filter((c) => c !== code).slice(0, 1);
    if (out[other].length === 0) out[other] = [DEFAULT_BINDINGS[other][0]];
  }
  const rest = out[action].filter((c) => c !== code);
  out[action] = [code, ...rest].slice(0, 2);
  return out;
}

/** Friendly name for a KeyboardEvent.code. */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return code.slice(5).toUpperCase();
  const names: Record<string, string> = { ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL', AltLeft: 'L-ALT', AltRight: 'R-ALT', Escape: 'ESC', Space: 'SPACE', Enter: 'ENTER', Backspace: 'BKSP' };
  return names[code] ?? code.toUpperCase();
}
