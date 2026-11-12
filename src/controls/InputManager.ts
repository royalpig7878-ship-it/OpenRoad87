import { InputSource, InputState, emptyInput } from './InputState';
import { KeyboardInput } from './KeyboardInput';
import { GamepadInput } from './GamepadInput';
import { Bindings } from './Bindings';
import { getBindings } from '../save/ControlPrefs';

/** Merges all input sources into one InputState per poll. Gameplay only ever sees this. */
export class InputManager {
  readonly keyboard: KeyboardInput;
  private sources: InputSource[];

  constructor(bindings?: Bindings) {
    this.keyboard = new KeyboardInput(bindings ?? getBindings());
    this.sources = [this.keyboard, new GamepadInput()];
  }

  /** Register an extra source (e.g. touch controls in Milestone 12). */
  addSource(s: InputSource): void {
    this.sources.push(s);
  }

  poll(): InputState {
    const out = emptyInput();
    for (const src of this.sources) {
      const s = src.poll();
      out.throttle = Math.max(out.throttle, s.throttle);
      out.brake = Math.max(out.brake, s.brake);
      out.steer += s.steer;
      out.gearUp ||= s.gearUp;
      out.gearDown ||= s.gearDown;
      out.pause ||= s.pause;
      out.toggleTransmission ||= s.toggleTransmission;
    }
    out.steer = Math.max(-1, Math.min(1, out.steer));
    return out;
  }

  destroy(): void {
    this.sources.forEach((s) => s.destroy());
  }
}
