import { InputState, emptyInput } from './InputState';
import { ControlId, SteerMode, TOUCH_RECTS, WHEEL_LOCK_DEGREES, angleDelta, angleOf, hitControl, pedalValue } from './TouchLayout';

/** How fast the wheel springs back to centre after release (per second). */
const WHEEL_RETURN_RATE = 7;

/**
 * Multitouch state machine for the on-screen controls. Pure TypeScript: it is fed pointer events
 * (id + position in game coordinates) and produces an InputState, so it can be tested without a browser.
 * Each finger "owns" the control it first touched until it lifts, so you can steer and accelerate at once.
 */
export class TouchState {
  mode: SteerMode;
  /** Called when the steering-mode toggle is tapped. */
  onToggleMode?: () => void;

  private owners = new Map<number, ControlId>();
  private throttle = 0;
  private brake = 0;
  private wheelSteer = 0;
  private wheelOwner: { id: number; startAngle: number; startSteer: number } | null = null;
  private pulses = { gearUp: false, gearDown: false, pause: false, manual: false };

  constructor(mode: SteerMode = 'buttons') {
    this.mode = mode;
  }

  setMode(mode: SteerMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.releaseAll();
  }

  /** Fingers currently holding a control. */
  get active(): number {
    return this.owners.size;
  }

  isHeld(id: ControlId): boolean {
    for (const c of this.owners.values()) if (c === id) return true;
    return false;
  }

  /** The wheel's current deflection -1..1 (for drawing it). */
  get wheelValue(): number {
    return this.wheelSteer;
  }

  down(id: number, x: number, y: number): ControlId | null {
    const c = hitControl(x, y, this.mode);
    if (!c) return null;
    if (c === 'gearUp') this.pulses.gearUp = true;
    else if (c === 'gearDown') this.pulses.gearDown = true;
    else if (c === 'pause') this.pulses.pause = true;
    else if (c === 'manual') this.pulses.manual = true;
    else if (c === 'steerMode') {
      this.onToggleMode?.();
      return c;
    }
    this.owners.set(id, c);
    if (c === 'accel') this.throttle = pedalValue(TOUCH_RECTS.accel, y);
    if (c === 'brake') this.brake = pedalValue(TOUCH_RECTS.brake, y);
    if (c === 'wheel') this.wheelOwner = { id, startAngle: angleOf(x, y), startSteer: this.wheelSteer };
    return c;
  }

  move(id: number, x: number, y: number): void {
    const c = this.owners.get(id);
    if (c === 'accel') this.throttle = pedalValue(TOUCH_RECTS.accel, y);
    else if (c === 'brake') this.brake = pedalValue(TOUCH_RECTS.brake, y);
    else if (c === 'wheel' && this.wheelOwner?.id === id) {
      const turned = angleDelta(this.wheelOwner.startAngle, angleOf(x, y));
      this.wheelSteer = Math.max(-1, Math.min(1, this.wheelOwner.startSteer + turned / WHEEL_LOCK_DEGREES));
    }
  }

  up(id: number): void {
    const c = this.owners.get(id);
    if (!c) return;
    this.owners.delete(id);
    if (c === 'accel') this.throttle = 0;
    if (c === 'brake') this.brake = 0;
    if (c === 'wheel') this.wheelOwner = null;
  }

  releaseAll(): void {
    this.owners.clear();
    this.throttle = this.brake = 0;
    this.wheelOwner = null;
    this.wheelSteer = 0;
  }

  /** Per-frame update: the wheel springs back to centre when no finger holds it. */
  update(dt: number): void {
    if (!this.wheelOwner && this.wheelSteer !== 0) {
      this.wheelSteer -= this.wheelSteer * Math.min(1, dt * WHEEL_RETURN_RATE);
      if (Math.abs(this.wheelSteer) < 0.01) this.wheelSteer = 0;
    }
  }

  /** Current input. One-shot buttons (gears, pause, auto/manual) report once per press. */
  poll(): InputState {
    const s = emptyInput();
    s.throttle = this.throttle;
    s.brake = this.brake;
    s.steer = this.mode === 'wheel' ? this.wheelSteer : (this.isHeld('right') ? 1 : 0) - (this.isHeld('left') ? 1 : 0);
    s.gearUp = this.pulses.gearUp;
    s.gearDown = this.pulses.gearDown;
    s.pause = this.pulses.pause;
    s.toggleTransmission = this.pulses.manual;
    this.pulses = { gearUp: false, gearDown: false, pause: false, manual: false };
    return s;
  }
}
