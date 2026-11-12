import Phaser from 'phaser';
import { audio } from '../audio/AudioManager';
import { SceneKeys, Colors, FONT } from '../core/config';
import { BINDING_ACTIONS, BindingAction, DEFAULT_BINDINGS, RESERVED_KEYS, bindKey, cloneBindings, keyLabel } from '../controls/Bindings';
import { getBindings, setBindings } from '../save/ControlPrefs';
import { saveManager } from '../save/SaveManager';
import { GameSettings, getSettings, updateSettings } from '../save/Settings';

interface Row {
  label: string;
  /** Text shown on the right; null for plain action rows. */
  value: (() => string) | null;
  /** Called with -1 / +1 for adjustable rows (arrow keys, < > taps). */
  adjust?: (dir: -1 | 1) => void;
  /** Called by Enter / tapping an action row. */
  act?: () => void;
  danger?: boolean;
}

const ROW_H = 28;
const TOP = 72;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const cycle = <T,>(list: readonly T[], cur: T, dir: -1 | 1): T => list[(list.indexOf(cur) + dir + list.length) % list.length];
const stepVol = (v: number, dir: -1 | 1) => Math.min(1, Math.max(0, Math.round((v + dir * 0.1) * 10) / 10));

/**
 * Settings: sound, touch controls, graphics, key bindings and save management (export / import / reset).
 * Keyboard: Up/Down select, Left/Right change, Enter act, Esc back. Mouse/touch: tap a row, tap < > to change.
 */
export class SettingsScene extends Phaser.Scene {
  private mode: 'main' | 'keys' = 'main';
  private cursor = 0;
  private view!: Phaser.GameObjects.Container;
  private capturing: BindingAction | null = null;
  private toast = '';
  private toastTime = 0;
  private confirmReset = 0;

  constructor() {
    super(SceneKeys.Settings);
  }

  create(): void {
    audio.attach();
    audio.playMusic('menu');
    audio.duckMusic(1);
    this.mode = 'main';
    this.cursor = 0;
    this.capturing = null;
    this.toast = '';
    this.toastTime = 0;
    this.confirmReset = 0;
    this.add.image(480, 270, 'career_bg');
    this.add.rectangle(480, 270, 960, 540, 0x05060f, 0.82);
    this.view = this.add.container(0, 0);
    const kb = this.input.keyboard!;
    kb.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    this.redraw();
  }

  update(_t: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    if (this.confirmReset > 0) {
      this.confirmReset -= dt;
      if (this.confirmReset <= 0) this.redraw();
    }
    if (this.toastTime > 0) {
      this.toastTime -= dt;
      if (this.toastTime <= 0) this.redraw();
    }
  }

  // ------------------------------------------------------------------ rows

  private set(patch: Partial<GameSettings>, sound: 'uiMove' | 'uiSelect' | null = 'uiMove'): void {
    updateSettings(patch);
    audio.applySettings();
    if (sound) audio.sfx(sound);
  }

  private mainRows(): Row[] {
    const s = () => getSettings();
    const vol = (label: string, key: 'masterVolume' | 'musicVolume' | 'sfxVolume'): Row => ({
      label,
      value: () => pct(s()[key]),
      adjust: (d) => this.set({ [key]: stepVol(s()[key], d) } as Partial<GameSettings>, 'uiSelect'),
    });
    return [
      vol('MASTER VOLUME', 'masterVolume'),
      vol('MUSIC VOLUME', 'musicVolume'),
      vol('EFFECTS VOLUME', 'sfxVolume'),
      { label: 'SOUND', value: () => (s().muted ? 'OFF' : 'ON'), adjust: () => this.set({ muted: !s().muted }, null) },
      { label: 'TOUCH CONTROLS', value: () => s().touchControls.toUpperCase(), adjust: (d) => this.set({ touchControls: cycle(['auto', 'on', 'off'] as const, s().touchControls, d) }) },
      { label: 'TOUCH STEERING', value: () => s().steerMode.toUpperCase(), adjust: (d) => this.set({ steerMode: cycle(['buttons', 'wheel'] as const, s().steerMode, d) }) },
      { label: 'TOUCH OPACITY', value: () => pct(s().touchOpacity), adjust: (d) => this.set({ touchOpacity: Math.min(0.9, Math.max(0.2, Math.round((s().touchOpacity + d * 0.1) * 10) / 10)) }) },
      { label: 'GRAPHICS QUALITY', value: () => s().quality.toUpperCase(), adjust: (d) => this.set({ quality: cycle(['auto', 'high', 'medium', 'low'] as const, s().quality, d) }) },
      { label: 'PIXEL SCALING', value: () => (s().pixelScaling === 'even' ? 'EVEN' : 'ORIGINAL'), adjust: () => this.set({ pixelScaling: s().pixelScaling === 'even' ? 'original' : 'even' }) },
      {
        label: 'FULLSCREEN',
        // iPhone Safari cannot do fullscreen, so say so instead of offering a button that does nothing.
        value: () => (!this.scale.fullscreen.available ? 'N/A' : this.scale.isFullscreen ? 'ON' : 'OFF'),
        adjust: () => {
          if (this.scale.fullscreen.available) this.scale.toggleFullscreen();
          audio.sfx('uiSelect');
        },
      },
      { label: 'KEY BINDINGS', value: () => '>', act: () => this.openKeys() },
      { label: 'EXPORT SAVE (COPY)', value: null, act: () => this.exportSave() },
      { label: 'IMPORT SAVE (PASTE)', value: null, act: () => this.importSave() },
      { label: this.confirmReset > 0 ? 'TAP AGAIN TO ERASE PROGRESS' : 'RESET PROGRESS', value: null, danger: true, act: () => this.resetProgress() },
    ];
  }

  private keyRows(): Row[] {
    const rows: Row[] = BINDING_ACTIONS.map(({ action, label }) => ({
      label,
      value: () => (this.capturing === action ? 'PRESS A KEY...' : getBindings()[action].map(keyLabel).join(' / ')),
      act: () => {
        this.capturing = action;
        this.redraw();
      },
    }));
    rows.push({
      label: 'RESET KEYS TO DEFAULT',
      value: null,
      act: () => {
        setBindings(cloneBindings(DEFAULT_BINDINGS));
        this.say('KEYS RESET');
      },
    });
    rows.push({ label: 'BACK', value: null, act: () => this.closeKeys() });
    return rows;
  }

  private rows(): Row[] {
    return this.mode === 'main' ? this.mainRows() : this.keyRows();
  }

  // ------------------------------------------------------------------ actions

  private openKeys(): void {
    this.mode = 'keys';
    this.cursor = 0;
    audio.sfx('uiSelect');
    this.redraw();
  }

  private closeKeys(): void {
    this.mode = 'main';
    this.cursor = Math.max(0, this.mainRows().findIndex((r) => r.label === 'KEY BINDINGS'));
    this.capturing = null;
    audio.sfx('uiBack');
    this.redraw();
  }

  private say(msg: string): void {
    this.toast = msg;
    this.toastTime = 3;
    this.redraw();
  }

  private exportSave(): void {
    const text = saveManager.exportText();
    audio.sfx('uiSelect');
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (nav?.clipboard?.writeText) {
      nav.clipboard.writeText(text).then(
        () => this.say('SAVE COPIED TO CLIPBOARD'),
        () => this.promptCopy(text),
      );
    } else this.promptCopy(text);
  }

  private promptCopy(text: string): void {
    window.prompt('Copy this save text (Ctrl+C), then keep it somewhere safe:', text);
    this.say('SAVE TEXT SHOWN');
  }

  private importSave(): void {
    audio.sfx('uiSelect');
    const text = window.prompt('Paste your save text here:');
    if (text === null) return;
    const r = saveManager.importText(text.trim());
    audio.sfx(r.ok ? 'cash' : 'uiError');
    audio.applySettings();
    this.say(r.message);
  }

  private resetProgress(): void {
    if (this.confirmReset <= 0) {
      this.confirmReset = 4;
      audio.sfx('uiError');
      this.redraw();
      return;
    }
    this.confirmReset = 0;
    saveManager.resetProgress();
    audio.sfx('uiBack');
    this.say('PROGRESS RESET');
  }

  private back(): void {
    if (this.mode === 'keys') {
      this.closeKeys();
      return;
    }
    saveManager.save();
    audio.sfx('uiBack');
    this.scene.start(SceneKeys.MainMenu);
  }

  // ------------------------------------------------------------------ input

  private onKey(e: KeyboardEvent): void {
    if (this.capturing) {
      if (e.code === 'Escape') {
        this.capturing = null;
        this.redraw();
        return;
      }
      if (RESERVED_KEYS.includes(e.code)) {
        this.say(`${keyLabel(e.code)} IS RESERVED`);
        audio.sfx('uiError');
        return;
      }
      setBindings(bindKey(getBindings(), this.capturing, e.code));
      this.capturing = null;
      audio.sfx('uiSelect');
      this.redraw();
      return;
    }
    const rows = this.rows();
    switch (e.code) {
      case 'ArrowUp':
      case 'KeyW':
        return this.move(-1, rows.length);
      case 'ArrowDown':
      case 'KeyS':
        return this.move(1, rows.length);
      case 'ArrowLeft':
      case 'KeyA':
        return this.change(-1);
      case 'ArrowRight':
      case 'KeyD':
        return this.change(1);
      case 'Enter':
      case 'Space':
        return this.activate();
      case 'Escape':
        return this.back();
    }
  }

  private move(d: number, n: number): void {
    this.cursor = (this.cursor + d + n) % n;
    audio.sfx('uiMove');
    this.redraw();
  }

  private change(dir: -1 | 1): void {
    this.rows()[this.cursor]?.adjust?.(dir);
    this.redraw();
  }

  private activate(): void {
    const row = this.rows()[this.cursor];
    if (!row) return;
    if (row.act) row.act();
    else if (row.adjust) row.adjust(1);
    this.redraw();
  }

  // ------------------------------------------------------------------ drawing

  private text(x: number, y: number, s: string, size = 16, color: string = Colors.white, bold = true): Phaser.GameObjects.Text {
    const t = this.add.text(x, y, s, { fontFamily: FONT, resolution: 2, fontSize: `${size}px`, fontStyle: bold ? 'bold' : 'normal', color, stroke: '#000000', strokeThickness: size > 20 ? 3 : 2 });
    this.view.add(t);
    return t;
  }

  private redraw(): void {
    this.view.removeAll(true);
    this.text(480, 16, this.mode === 'main' ? 'SETTINGS' : 'KEY BINDINGS', 26, Colors.yellow).setOrigin(0.5, 0);

    const rows = this.rows();
    this.cursor = Math.min(this.cursor, rows.length - 1);
    rows.forEach((row, i) => {
      const y = TOP + i * ROW_H;
      const sel = i === this.cursor;
      const bg = this.add.rectangle(180, y, 600, ROW_H - 3, sel ? 0x2a2550 : 0x14122a, 0.92).setOrigin(0, 0);
      bg.setStrokeStyle(2, sel ? 0xffd23f : 0x2a2850);
      bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        if (this.capturing) return;
        if (this.cursor !== i) {
          this.cursor = i;
          audio.sfx('uiMove');
          this.redraw();
        } else this.activate();
      });
      this.view.add(bg);
      const color = row.danger ? '#ff7a6a' : sel ? Colors.yellow : Colors.white;
      this.text(196, y + 6, row.label, 16, color);
      if (row.value) {
        const v = row.value();
        const adjustable = !!row.adjust;
        this.text(760, y + 6, adjustable ? `<  ${v}  >` : v, 16, sel ? Colors.cyan : Colors.grey).setOrigin(1, 0);
        if (adjustable) {
          for (const dir of [-1, 1] as const) {
            const hit = this.add.rectangle(dir < 0 ? 560 : 700, y, 80, ROW_H - 3, 0x000000, 0.01).setOrigin(0, 0);
            hit.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
              this.cursor = i;
              row.adjust!(dir);
              this.redraw();
            });
            this.view.add(hit);
          }
        }
      }
    });

    // Status line: when it was last saved and where.
    const sm = saveManager;
    let status = sm.lastError ? `SAVE FAILED: ${sm.lastError.toUpperCase()}` : sm.lastSavedAt ? `SAVED ${new Date(sm.lastSavedAt).toLocaleTimeString('en-GB')}  (${sm.backendName})` : `AUTOSAVE ON  (${sm.backendName})`;
    if (sm.backendName === 'memory') status = 'BROWSER STORAGE IS BLOCKED: PROGRESS LASTS ONLY WHILE THIS PAGE IS OPEN';
    this.text(480, 468, status, 12, sm.lastError || sm.backendName === 'memory' ? '#ff7a6a' : Colors.grey, false).setOrigin(0.5, 0);
    if (this.toastTime > 0 && this.toast) this.text(480, 486, this.toast, 18, '#60ff90').setOrigin(0.5, 0);
    const hint = this.capturing ? 'PRESS THE NEW KEY  -  ESC CANCELS' : 'UP/DOWN SELECT   LEFT/RIGHT CHANGE   ENTER ACT   ESC BACK   |   TAP ROWS AND < >';
    this.text(480, 512, hint, 12, Colors.grey, false).setOrigin(0.5, 0);
    const back = this.text(24, 20, '< BACK', 18, Colors.yellow).setOrigin(0, 0.5);
    back.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.back());
  }
}
