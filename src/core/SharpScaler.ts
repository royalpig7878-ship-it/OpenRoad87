import Phaser from 'phaser';
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from './config';
import { deviceScale, planSharpScale } from './sharpPlan';

/**
 * Shows the game with even pixels at fractional screen scales ("sharp bilinear" scaling). See `sharpPlan.ts` for why.
 *
 * Every frame, after Phaser has rendered:
 *   1. the game canvas (960x540) is copied into a larger buffer by a whole factor, with crisp nearest-neighbour pixels;
 *   2. that buffer is shrunk with smooth filtering into a canvas of exactly the screen's device-pixel size, shown on top.
 *
 * The original Phaser canvas stays in place underneath and keeps receiving all mouse and touch input (the overlay ignores
 * the pointer), so input coordinates are unaffected. When the scale is a whole number, or the option is off, the overlay is hidden
 * and nothing is copied.
 */
export class SharpScaler {
  private readonly view: HTMLCanvasElement;
  private readonly viewCtx: CanvasRenderingContext2D | null;
  private readonly mid: HTMLCanvasElement;
  private readonly midCtx: CanvasRenderingContext2D | null;
  private enabled = true;
  private active = false;
  private factor = 1;
  private frames = 0;
  private lastKey = '';
  private readonly canvas: HTMLCanvasElement;
  private readonly coarse: boolean;
  /** Frames drawn by the scaler (for tests and diagnostics). */
  drawn = 0;

  constructor(private game: Phaser.Game, parent: HTMLElement) {
    this.canvas = game.canvas;
    this.view = document.createElement('canvas');
    this.view.setAttribute('aria-hidden', 'true');
    this.view.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;display:none;z-index:1;image-rendering:auto;';
    parent.appendChild(this.view);
    this.viewCtx = this.view.getContext('2d', { alpha: false });
    this.mid = document.createElement('canvas');
    this.midCtx = this.mid.getContext('2d', { alpha: false });
    this.coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

    game.events.on(Phaser.Core.Events.POST_RENDER, this.onPostRender, this);
    game.scale.on('resize', this.layout, this);
    window.addEventListener('resize', this.layout);
    window.visualViewport?.addEventListener('resize', this.layout);
    document.addEventListener('fullscreenchange', this.layout);
    this.layout();
  }

  /** Turns the even-pixel scaler on or off (the "pixel scaling" setting). */
  setEnabled(on: boolean): void {
    this.enabled = on;
    this.layout();
  }

  get isActive(): boolean {
    return this.active;
  }

  /** The integer enlargement currently used (1 when inactive). */
  get enlargement(): number {
    return this.active ? this.factor : 1;
  }

  /** The overlay canvas (for tests). */
  get overlay(): HTMLCanvasElement {
    return this.view;
  }

  /** Works out whether the scaler is needed for the canvas's current size, and sizes the overlay to match. */
  readonly layout = (): void => {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const scale = deviceScale(rect.width, dpr, VIRTUAL_WIDTH);
    const plan = this.enabled && this.viewCtx && this.midCtx ? planSharpScale(scale, this.coarse) : { active: false, factor: 1 };
    this.active = plan.active;
    this.factor = plan.factor;
    if (!plan.active) {
      this.view.style.display = 'none';
      this.lastKey = '';
      return;
    }
    // Sizes in whole device pixels, aligned to the device pixel grid.
    const dw = Math.max(1, Math.round(rect.width * dpr));
    const dh = Math.max(1, Math.round(rect.height * dpr));
    const left = Math.round(rect.left * dpr) / dpr;
    const top = Math.round(rect.top * dpr) / dpr;
    const key = `${dw}x${dh}@${left},${top}/${plan.factor}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const mw = VIRTUAL_WIDTH * plan.factor;
    const mh = VIRTUAL_HEIGHT * plan.factor;
    if (this.mid.width !== mw || this.mid.height !== mh) {
      this.mid.width = mw;
      this.mid.height = mh;
    }
    this.view.width = dw;
    this.view.height = dh;
    this.view.style.width = `${dw / dpr}px`;
    this.view.style.height = `${dh / dpr}px`;
    this.view.style.left = `${left}px`;
    this.view.style.top = `${top}px`;
    this.view.style.display = 'block';
  };

  private onPostRender(): void {
    if (!this.active || !this.viewCtx || !this.midCtx) return;
    // The canvas can move or resize without an event (browser chrome, zoom); re-check now and then.
    if (++this.frames % 30 === 0) this.layout();
    if (!this.active) return;
    const mid = this.midCtx;
    mid.imageSmoothingEnabled = false; // crisp whole-number enlargement
    mid.drawImage(this.canvas, 0, 0, this.mid.width, this.mid.height);
    const view = this.viewCtx;
    view.imageSmoothingEnabled = true; // smooth shrink to the exact screen size
    view.imageSmoothingQuality = 'high';
    view.drawImage(this.mid, 0, 0, this.view.width, this.view.height);
    this.drawn++;
  }

  destroy(): void {
    this.game.events.off(Phaser.Core.Events.POST_RENDER, this.onPostRender, this);
    this.game.scale.off('resize', this.layout, this);
    window.removeEventListener('resize', this.layout);
    window.visualViewport?.removeEventListener('resize', this.layout);
    document.removeEventListener('fullscreenchange', this.layout);
    this.view.remove();
  }
}
