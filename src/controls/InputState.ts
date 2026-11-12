/** Device-independent driving input. Every input source (keyboard, gamepad, touch) produces this. */
export interface InputState {
  /** 0..1 */
  throttle: number;
  /** 0..1 */
  brake: number;
  /** -1 (left) .. +1 (right) */
  steer: number;
  /** True for the single frame a gear-up was requested. */
  gearUp: boolean;
  /** True for the single frame a gear-down was requested. */
  gearDown: boolean;
  /** True for the single frame pause was requested. */
  pause: boolean;
  /** True for the single frame a switch between automatic and manual transmission was requested (touch button). */
  toggleTransmission: boolean;
}

export const emptyInput = (): InputState => ({ throttle: 0, brake: 0, steer: 0, gearUp: false, gearDown: false, pause: false, toggleTransmission: false });

/** Anything that can supply input. Touch controls (Milestone 12) implement this too. */
export interface InputSource {
  poll(): InputState;
  destroy(): void;
}
