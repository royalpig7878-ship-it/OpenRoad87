import { InputSource, InputState, emptyInput } from './InputState';

const DEADZONE = 0.15;

/**
 * Standard-mapping gamepad: RT/A accelerate, LT/B/X brake, left stick or D-pad steer,
 * RB gear up, LB gear down, Start pause. Polled directly from the Gamepad API.
 */
export class GamepadInput implements InputSource {
  private prevUp = false;
  private prevDown = false;
  private prevPause = false;

  private pad(): Gamepad | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    for (const p of navigator.getGamepads()) if (p && p.connected) return p;
    return null;
  }

  poll(): InputState {
    const s = emptyInput();
    const p = this.pad();
    if (!p) return s;
    const btn = (i: number) => p.buttons[i]?.value ?? 0;
    s.throttle = Math.max(btn(7), btn(0));
    s.brake = Math.max(btn(6), btn(1), btn(2));
    let steer = p.axes[0] ?? 0;
    if (Math.abs(steer) < DEADZONE) steer = 0;
    else steer = Math.sign(steer) * ((Math.abs(steer) - DEADZONE) / (1 - DEADZONE));
    if (btn(14)) steer = -1;
    if (btn(15)) steer = 1;
    s.steer = steer;
    const up = btn(5) > 0.5;
    const down = btn(4) > 0.5;
    const pause = btn(9) > 0.5;
    s.gearUp = up && !this.prevUp;
    s.gearDown = down && !this.prevDown;
    s.pause = pause && !this.prevPause;
    this.prevUp = up;
    this.prevDown = down;
    this.prevPause = pause;
    return s;
  }

  destroy(): void {}
}
