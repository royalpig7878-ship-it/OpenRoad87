import { Bindings, DEFAULT_BINDINGS, cloneBindings, parseBindings } from '../controls/Bindings';

/** The player's keyboard bindings for this session (loaded from / stored by the save system). */
let current: Bindings = cloneBindings(DEFAULT_BINDINGS);
const listeners: Array<() => void> = [];

export const getBindings = (): Bindings => current;

export function setBindings(b: unknown): void {
  current = parseBindings(b);
  for (const l of listeners) l();
}

export const onBindingsChange = (fn: () => void): void => {
  listeners.push(fn);
};
