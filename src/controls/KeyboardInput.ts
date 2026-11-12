import { Bindings, DEFAULT_BINDINGS } from './Bindings';
import { InputSource, InputState, emptyInput } from './InputState';

/** Keyboard driving input using configurable KeyboardEvent.code bindings. */
export class KeyboardInput implements InputSource {
  private down = new Set<string>();
  private gearUpPressed = false;
  private gearDownPressed = false;
  private pausePressed = false;

  constructor(private bindings: Bindings = DEFAULT_BINDINGS) {
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }

  setBindings(b: Bindings): void {
    this.bindings = b;
  }

  private isBound(code: string): boolean {
    return Object.values(this.bindings).some((codes) => codes.includes(code));
  }

  private onDown = (e: KeyboardEvent): void => {
    if (!this.isBound(e.code)) return;
    e.preventDefault();
    if (e.repeat) return;
    this.down.add(e.code);
    if (this.bindings.gearUp.includes(e.code)) this.gearUpPressed = true;
    if (this.bindings.gearDown.includes(e.code)) this.gearDownPressed = true;
    if (this.bindings.pause.includes(e.code)) this.pausePressed = true;
  };

  private onUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };

  /** Releases all keys when the window loses focus so the car doesn't keep accelerating. */
  private onBlur = (): void => {
    this.down.clear();
  };

  private held(codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  poll(): InputState {
    const s = emptyInput();
    s.throttle = this.held(this.bindings.accelerate) ? 1 : 0;
    s.brake = this.held(this.bindings.brake) ? 1 : 0;
    s.steer = (this.held(this.bindings.right) ? 1 : 0) - (this.held(this.bindings.left) ? 1 : 0);
    s.gearUp = this.gearUpPressed;
    s.gearDown = this.gearDownPressed;
    s.pause = this.pausePressed;
    this.gearUpPressed = this.gearDownPressed = this.pausePressed = false;
    return s;
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }
}
