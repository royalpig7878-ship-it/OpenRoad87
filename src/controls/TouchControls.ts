import Phaser from 'phaser';
import { InputSource, InputState } from './InputState';
import { TouchState } from './TouchState';
import { ControlId, Rect, SteerMode, TOUCH_RECTS, WHEEL } from './TouchLayout';
import { FONT } from '../core/config';

/** True if this looks like a touch device (so on-screen controls should appear by default). */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
}

const LABELS: Record<Exclude<ControlId, 'wheel'>, string> = {
  accel: 'GAS',
  brake: 'BRAKE',
  left: '<',
  right: '>',
  gearUp: 'SHIFT +',
  gearDown: 'SHIFT -',
  manual: 'AUTO',
  pause: 'II',
  steerMode: 'WHEEL',
};

/**
 * On-screen driving controls for phones and tablets: gas and brake pedals, steering (left/right buttons or a
 * draggable virtual wheel), gear buttons, an auto/manual switch and pause. Multitouch: every finger owns the
 * control it first touched. Implements InputSource so the driving code treats it like any other device.
 */
export class TouchControls implements InputSource {
  readonly state: TouchState;
  private gfx: Phaser.GameObjects.Graphics;
  private wheel: Phaser.GameObjects.Image;
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private visible = true;
  private opacity: number;
  private onPointerDown = (p: Phaser.Input.Pointer) => this.visible && this.state.down(p.id, p.x, p.y);
  private onPointerMove = (p: Phaser.Input.Pointer) => this.visible && this.state.move(p.id, p.x, p.y);
  private onPointerUp = (p: Phaser.Input.Pointer) => this.state.up(p.id);

  constructor(private scene: Phaser.Scene, mode: SteerMode, opacity: number, onModeChange?: (m: SteerMode) => void, private manualLabel = () => 'AUTO') {
    this.opacity = opacity;
    this.state = new TouchState(mode);
    this.state.onToggleMode = () => {
      const next: SteerMode = this.state.mode === 'buttons' ? 'wheel' : 'buttons';
      this.state.setMode(next);
      onModeChange?.(next);
    };
    this.gfx = scene.add.graphics().setDepth(100);
    this.wheel = scene.add.image(WHEEL.cx, WHEEL.cy, 'anim_steering_wheel', 2).setDepth(101).setScale((WHEEL.r * 2) / 256);
    for (const id of Object.keys(LABELS) as (keyof typeof LABELS)[]) {
      const r = TOUCH_RECTS[id];
      const big = id === 'accel' || id === 'brake' || id === 'left' || id === 'right';
      this.labels.set(id, scene.add.text(r.x + r.w / 2, r.y + r.h / 2, LABELS[id], { fontFamily: FONT, resolution: 2, fontSize: big ? '28px' : '14px', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(102));
    }
    const input = scene.input;
    input.on('pointerdown', this.onPointerDown);
    input.on('pointermove', this.onPointerMove);
    input.on('pointerup', this.onPointerUp);
    input.on('pointerupoutside', this.onPointerUp);
    input.on('gameout', () => this.state.releaseAll());
  }

  setVisible(v: boolean): void {
    this.visible = v;
    if (!v) this.state.releaseAll();
    this.gfx.setVisible(v);
    this.wheel.setVisible(v && this.state.mode === 'wheel');
    this.labels.forEach((t) => t.setVisible(v));
  }

  get isVisible(): boolean {
    return this.visible;
  }

  setOpacity(o: number): void {
    this.opacity = o;
  }

  /** Per-frame: advance the wheel spring and redraw the controls. */
  update(dt: number, manual: boolean): void {
    this.state.update(dt);
    if (!this.visible) return;
    const g = this.gfx;
    g.clear();
    const mode = this.state.mode;
    const box = (id: Exclude<ControlId, 'wheel'>, color: number) => {
      const r: Rect = TOUCH_RECTS[id];
      const held = this.state.isHeld(id);
      g.fillStyle(color, held ? Math.min(0.95, this.opacity + 0.35) : this.opacity * 0.4).fillRoundedRect(r.x, r.y, r.w, r.h, 12);
      g.lineStyle(3, 0xffffff, held ? 0.9 : Math.min(0.85, this.opacity + 0.15)).strokeRoundedRect(r.x, r.y, r.w, r.h, 12);
    };
    box('accel', 0x20a040);
    box('brake', 0xc02a2a);
    box('gearUp', 0x2a4a90);
    box('gearDown', 0x2a4a90);
    box('manual', manual ? 0xb07a10 : 0x3a3a50);
    box('pause', 0x3a3a50);
    box('steerMode', 0x3a3a50);

    const showButtons = mode === 'buttons';
    if (showButtons) {
      box('left', 0x3a3a50);
      box('right', 0x3a3a50);
    } else {
      // Wheel ring and a frame chosen from the wheel art by how far it is turned (-30..30 degrees).
      g.fillStyle(0x000000, this.opacity * 0.5).fillCircle(WHEEL.cx, WHEEL.cy, WHEEL.r);
      g.lineStyle(3, 0xffffff, 0.5).strokeCircle(WHEEL.cx, WHEEL.cy, WHEEL.r);
      const frame = Math.round(((this.state.wheelValue + 1) / 2) * 4);
      this.wheel.setFrame(Phaser.Math.Clamp(frame, 0, 4)).setAlpha(Math.min(1, this.opacity + 0.3));
    }
    this.wheel.setVisible(!showButtons);
    this.labels.get('left')!.setVisible(showButtons);
    this.labels.get('right')!.setVisible(showButtons);
    this.labels.get('steerMode')!.setText(showButtons ? 'WHEEL' : 'BUTTONS');
    this.labels.get('manual')!.setText(manual ? 'MANUAL' : this.manualLabel());
    for (const id of ['accel', 'brake', 'gearUp', 'gearDown', 'manual', 'pause', 'steerMode'] as const) this.labels.get(id)!.setAlpha(Math.min(1, this.opacity + 0.4));
    this.labels.get('left')!.setAlpha(Math.min(1, this.opacity + 0.4));
    this.labels.get('right')!.setAlpha(Math.min(1, this.opacity + 0.4));
  }

  poll(): InputState {
    return this.state.poll();
  }

  destroy(): void {
    const input = this.scene.input;
    input.off('pointerdown', this.onPointerDown);
    input.off('pointermove', this.onPointerMove);
    input.off('pointerup', this.onPointerUp);
    input.off('pointerupoutside', this.onPointerUp);
    this.gfx.destroy();
    this.wheel.destroy();
    this.labels.forEach((t) => t.destroy());
  }
}
