import Phaser from 'phaser';
import { audio } from '../audio/AudioManager';
import { saveManager } from '../save/SaveManager';
import { SceneKeys, TextureKeys, Colors, FONT } from '../core/config';
import { VEHICLES, getVehicle } from '../vehicles/VehicleRoster';
import { VehicleSpec } from '../vehicles/VehicleSpec';
import { getProfile } from '../economy/currentProfile';
import { addMoney, buyUpgrade, buyVehicle, effectiveSpec, fullRepairCost, nextUpgradeCost, owns, repair, selectVehicle } from '../economy/Profile';
import { MAX_UPGRADE_LEVEL, UPGRADES, UPGRADE_KEYS, UpgradeKey } from '../economy/UpgradeData';
import { STAT_MAX, applyUpgrades } from '../economy/VehicleTuning';
import { kphToMph } from '../systems/units';
import { startDrive } from './startDrive';

type Mode = 'showroom' | 'workshop';

const PANEL = { x: 600, y: 56, w: 344, h: 440 };
const SHIFT_X = -180; // scenes are shifted left so the car sits on the left 60% and the panel covers the rest

const STATS: { label: string; get: (s: VehicleSpec) => number; max: number; fmt: (v: number) => string }[] = [
  { label: 'SPEED', get: (s) => s.topSpeedKph, max: STAT_MAX.topSpeedKph, fmt: (v) => `${Math.round(kphToMph(v))} MPH` },
  { label: 'ACCEL', get: (s) => s.acceleration, max: STAT_MAX.acceleration, fmt: (v) => v.toFixed(0) },
  { label: 'HANDLING', get: (s) => s.handling, max: STAT_MAX.handling, fmt: (v) => v.toFixed(2) },
  { label: 'BRAKING', get: (s) => s.braking, max: STAT_MAX.braking, fmt: (v) => v.toFixed(0) },
  { label: 'FUEL', get: (s) => s.fuelCapacity, max: STAT_MAX.fuelCapacity, fmt: (v) => `${Math.round(v)} L` },
  { label: 'TOUGH', get: (s) => s.damageResistance, max: STAT_MAX.damageResistance, fmt: (v) => v.toFixed(2) },
];

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/**
 * The garage: a showroom to look at and buy cars, and a workshop to upgrade and repair them.
 * Keyboard: Up/Down select, Left/Right change car (workshop), Tab switches tab, Enter acts, D drives, Esc backs out.
 * Mouse/touch: tap a row to select it, tap the big button to act.
 */
export class GarageScene extends Phaser.Scene {
  private mode: Mode = 'showroom';
  private cursor = 0; // showroom: vehicle index; workshop: 0..6 upgrades, 7 repair
  private view!: Phaser.GameObjects.Container;
  private bgShowroom!: Phaser.GameObjects.Image;
  private bgWorkshop!: Phaser.GameObjects.Image;
  /** Mirrored copies that continue the art over the strip on the right that the left shift would otherwise leave empty. */
  private bgShowroomMirror!: Phaser.GameObjects.Image;
  private bgWorkshopMirror!: Phaser.GameObjects.Image;
  private messageTime = 0;
  private msgText!: Phaser.GameObjects.Text;
  private driving = false;

  constructor() {
    super(SceneKeys.Garage);
  }

  create(): void {
    audio.attach();
    audio.playMusic('menu');
    audio.duckMusic(1);
    this.mode = 'showroom';
    this.driving = false;
    const p = getProfile();
    this.cursor = Math.max(0, VEHICLES.findIndex((v) => v.id === p.selectedVehicle));
    this.bgShowroom = this.add.image(SHIFT_X, 0, 'garage_showroom_bg').setOrigin(0, 0);
    this.bgWorkshop = this.add.image(SHIFT_X, 0, 'garage_workshop_bg').setOrigin(0, 0);
    // A flipped copy starting where the art ends continues it seamlessly (the left edge of the copy equals the right edge of the art).
    this.bgShowroomMirror = this.add.image(960 + SHIFT_X, 0, 'garage_showroom_bg').setOrigin(0, 0).setFlipX(true);
    this.bgWorkshopMirror = this.add.image(960 + SHIFT_X, 0, 'garage_workshop_bg').setOrigin(0, 0).setFlipX(true);
    this.view = this.add.container(0, 0);
    this.msgText = this.add.text(300, 508, '', { fontFamily: FONT, resolution: 2, fontSize: '16px', fontStyle: 'bold', color: Colors.yellow, stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5, 0).setDepth(50);

    const kb = this.input.keyboard!;
    kb.on('keydown-UP', () => this.moveCursor(-1));
    kb.on('keydown-DOWN', () => this.moveCursor(1));
    kb.on('keydown-W', () => this.moveCursor(-1));
    kb.on('keydown-S', () => this.moveCursor(1));
    kb.on('keydown-LEFT', () => this.changeCar(-1));
    kb.on('keydown-RIGHT', () => this.changeCar(1));
    kb.on('keydown-A', () => this.changeCar(-1));
    kb.on('keydown-D', () => this.drive());
    kb.on('keydown-TAB', (e: KeyboardEvent) => {
      e.preventDefault();
      this.setMode(this.mode === 'showroom' ? 'workshop' : 'showroom');
    });
    kb.on('keydown-ENTER', () => this.act());
    kb.on('keydown-SPACE', () => this.act());
    kb.on('keydown-ESC', () => this.back());
    if (import.meta.env.DEV) kb.on('keydown-C', () => this.cheat()); // developer shortcut: not in release builds
    this.redraw();
  }

  // ------------------------------------------------------------------ actions

  private flashMessage(text: string): void {
    this.messageTime = 2.2;
    this.msgText.setText(text);
  }

  update(_t: number, deltaMs: number): void {
    if (this.messageTime > 0) {
      this.messageTime -= deltaMs / 1000;
      if (this.messageTime <= 0) this.msgText.setText('');
    }
  }

  private viewedVehicle(): VehicleSpec {
    const p = getProfile();
    return this.mode === 'showroom' ? VEHICLES[this.cursor] : getVehicle(p.selectedVehicle);
  }

  private setMode(m: Mode): void {
    this.mode = m;
    this.cursor = m === 'showroom' ? Math.max(0, VEHICLES.findIndex((v) => v.id === getProfile().selectedVehicle)) : 0;
    this.redraw();
  }

  private moveCursor(d: number): void {
    const n = this.mode === 'showroom' ? VEHICLES.length : UPGRADE_KEYS.length + 1;
    this.cursor = (this.cursor + d + n) % n;
    audio.sfx('uiMove');
    this.redraw();
  }

  /** Cycle the active car among the cars you own (workshop) or just move the cursor (showroom). */
  private changeCar(d: number): void {
    const p = getProfile();
    if (this.mode === 'showroom') return this.moveCursor(d);
    const owned = VEHICLES.filter((v) => owns(p, v.id));
    const i = owned.findIndex((v) => v.id === p.selectedVehicle);
    selectVehicle(p, owned[(i + d + owned.length) % owned.length].id);
    this.redraw();
  }

  private act(): void {
    saveManager.requestSave();
    const p = getProfile();
    if (this.mode === 'showroom') {
      const v = VEHICLES[this.cursor];
      if (!owns(p, v.id)) {
        const r = buyVehicle(p, v.id);
        if (r.ok) {
          selectVehicle(p, v.id);
          audio.sfx('cash');
          this.flashMessage(`BOUGHT ${v.name.toUpperCase()}!`);
        } else {
          audio.sfx('uiError');
          this.flashMessage(r.reason);
        }
      } else {
        selectVehicle(p, v.id);
        audio.sfx('uiSelect');
        this.flashMessage(`${v.name.toUpperCase()} SELECTED`);
      }
    } else {
      const id = p.selectedVehicle;
      if (this.cursor < UPGRADE_KEYS.length) {
        const key = UPGRADE_KEYS[this.cursor];
        const r = buyUpgrade(p, id, key);
        audio.sfx(r.ok ? 'cash' : 'uiError');
        this.flashMessage(r.ok ? `${UPGRADES[key].name} UPGRADED` : r.reason);
      } else {
        const before = p.money;
        const r = repair(p, id);
        audio.sfx(r.ok ? 'cash' : 'uiError');
        this.flashMessage(r.ok ? `REPAIRED (-${money(before - p.money)})` : r.reason);
      }
    }
    this.redraw();
  }

  /** Development helper: free money for testing the shop (clearly labelled on screen). */
  private cheat(): void {
    addMoney(getProfile(), 10000);
    this.flashMessage('DEV: +$10,000');
    this.redraw();
  }

  private back(): void {
    if (!this.driving) {
      audio.sfx('uiBack');
      this.scene.start(SceneKeys.MainMenu);
    }
  }

  private async drive(): Promise<void> {
    const p = getProfile();
    if (this.driving) return;
    if (!owns(p, p.selectedVehicle)) return this.flashMessage('SELECT A CAR YOU OWN');
    this.driving = true;
    this.flashMessage('LOADING...');
    await startDrive(this, p.selectedVehicle, true);
  }

  // ------------------------------------------------------------------ drawing

  private text(x: number, y: number, s: string, size = 14, color: string = Colors.white, bold = true): Phaser.GameObjects.Text {
    const t = this.add.text(x, y, s, { fontFamily: FONT, resolution: 2, fontSize: `${size}px`, fontStyle: bold ? 'bold' : 'normal', color, stroke: '#000000', strokeThickness: size > 16 ? 3 : 2 });
    this.view.add(t);
    return t;
  }

  private rect(x: number, y: number, w: number, h: number, color: number, alpha = 1, line?: number): Phaser.GameObjects.Rectangle {
    const r = this.add.rectangle(x, y, w, h, color, alpha).setOrigin(0, 0);
    if (line !== undefined) r.setStrokeStyle(2, line);
    this.view.add(r);
    return r;
  }

  private button(cx: number, cy: number, label: string, onClick: () => void, enabled = true, scale = 1, highlight = false): void {
    const img = this.add.image(cx, cy, highlight ? TextureKeys.ButtonSelected : enabled ? TextureKeys.ButtonNormal : 'ui_button_disabled').setScale(scale);
    img.setInteractive({ useHandCursor: enabled }).on('pointerdown', () => {
      if (!enabled) return;
      audio.sfx('uiSelect');
      onClick();
    });
    const t = this.add.text(cx, cy, label, { fontFamily: FONT, resolution: 2, fontSize: `${Math.round(18 * scale)}px`, fontStyle: 'bold', color: enabled ? Colors.white : Colors.grey, stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5);
    this.view.add([img, t]);
  }

  private redraw(): void {
    this.view.removeAll(true);
    const p = getProfile();
    this.bgShowroom.setVisible(this.mode === 'showroom');
    this.bgWorkshop.setVisible(this.mode === 'workshop');
    this.bgShowroomMirror.setVisible(this.mode === 'showroom');
    this.bgWorkshopMirror.setVisible(this.mode === 'workshop');
    const spec = this.viewedVehicle();
    const owned = owns(p, spec.id);
    const tuned = owned ? effectiveSpec(p, spec.id) : spec;

    // Header: money, reputation, tabs.
    const coin = this.add.image(30, 26, 'ui_coin');
    this.view.add(coin);
    this.text(52, 14, money(p.money), 22, Colors.yellow);
    this.text(24, 40, `REPUTATION ${p.reputation}`, 12, Colors.grey);
    this.tab(PANEL.x + 8, 'SHOWROOM', 'showroom');
    this.tab(PANEL.x + 176, 'WORKSHOP', 'workshop');

    // Car.
    const bottom = this.mode === 'showroom' ? 496 : 538;
    const car = this.add.image(300, bottom, spec.artwork).setOrigin(0.5, 1).setScale(2);
    if (!owned) car.setTint(0x9aa0b8); // unowned cars are shown slightly dimmed
    this.view.add(car);
    this.text(24, 66, spec.name.toUpperCase(), 28, Colors.white);
    this.text(24, 98, owned ? (p.selectedVehicle === spec.id ? 'OWNED - ACTIVE' : 'OWNED') : `FOR SALE  ${money(spec.price)}`, 14, owned ? '#60ff90' : Colors.cyan);
    this.drawStats(spec, tuned, owned);

    // Right panel.
    this.rect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 0x0c0a1a, 0.92, 0xffd23f);
    if (this.mode === 'showroom') this.drawShowroomPanel(p);
    else this.drawWorkshopPanel(p, spec, owned);

    // Footer buttons and hints.
    this.button(PANEL.x + 90, 468, 'DRIVE', () => void this.drive(), owns(p, p.selectedVehicle), 0.62);
    this.button(PANEL.x + 254, 468, 'BACK', () => this.back(), true, 0.62);
    this.text(16, 520, 'ARROWS select   TAB showroom/workshop   ENTER act   D drive   ESC back' + (import.meta.env.DEV ? '   C dev cash' : ''), 11, Colors.grey, false);
  }

  private tab(x: number, label: string, mode: Mode): void {
    const active = this.mode === mode;
    const r = this.rect(x, 22, 160, 26, active ? 0xffd23f : 0x1c1a2c, 1, 0xffd23f);
    r.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.setMode(mode));
    this.text(x + 80 - label.length * 5.2, 27, label, 14, active ? '#000000' : Colors.white);
  }

  /** Six stat bars (2 columns x 3 rows). `tuned` has upgrades; a green preview shows the next upgrade when one is selected. */
  private drawStats(base: VehicleSpec, tuned: VehicleSpec, owned: boolean): void {
    let preview: VehicleSpec | null = null;
    const p = getProfile();
    if (this.mode === 'workshop' && owned && this.cursor < UPGRADE_KEYS.length) {
      const key = UPGRADE_KEYS[this.cursor];
      const lv = { ...p.vehicles[base.id].upgrades };
      if (lv[key] < MAX_UPGRADE_LEVEL) {
        lv[key]++;
        preview = applyUpgrades(getVehicle(base.id), lv);
      }
    }
    STATS.forEach((st, i) => {
      const x = 24 + (i % 2) * 280;
      const y = 126 + Math.floor(i / 2) * 36;
      const cur = st.get(tuned) / st.max;
      this.text(x, y, st.label, 12, Colors.grey);
      this.text(x + 120, y, st.fmt(st.get(tuned)), 12, Colors.white);
      this.rect(x, y + 16, 250, 8, 0x000000, 0.7);
      this.rect(x, y + 16, 250 * Math.min(1, cur), 8, 0x4de1ff);
      if (preview) {
        const next = Math.min(1, st.get(preview) / st.max);
        if (next > cur + 0.001) {
          this.rect(x + 250 * Math.min(1, cur), y + 16, 250 * (next - Math.min(1, cur)), 8, 0x60ff90);
          this.text(x + 190, y, `+${st.fmt(st.get(preview) - st.get(tuned)).replace(/^-/, '')}`, 12, '#60ff90');
        }
      }
    });
  }

  private drawShowroomPanel(p: ReturnType<typeof getProfile>): void {
    this.text(PANEL.x + 16, PANEL.y + 10, 'VEHICLES', 16, Colors.yellow);
    VEHICLES.forEach((v, i) => {
      const y = PANEL.y + 36 + i * 42;
      const sel = i === this.cursor;
      const row = this.rect(PANEL.x + 10, y, PANEL.w - 20, 38, sel ? 0x2a2550 : 0x14122a, 1, sel ? 0xffd23f : 0x2a2850);
      row.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        if (this.cursor === i) this.act();
        else {
          this.cursor = i;
          this.redraw();
        }
      });
      this.text(PANEL.x + 20, y + 4, v.name.toUpperCase(), 15, Colors.white);
      const o = owns(p, v.id);
      this.text(PANEL.x + 20, y + 21, o ? (p.selectedVehicle === v.id ? 'ACTIVE' : 'OWNED') : `${Math.round(kphToMph(v.topSpeedKph))} MPH TOP`, 11, o ? '#60ff90' : Colors.grey);
      this.text(PANEL.x + PANEL.w - 24 - (o ? 0 : 76), y + 10, o ? '' : money(v.price), 14, p.money >= v.price ? Colors.yellow : '#ff6050');
    });
    const v = VEHICLES[this.cursor];
    const o = owns(p, v.id);
    const label = o ? (p.selectedVehicle === v.id ? 'ACTIVE' : 'SELECT') : `BUY ${money(v.price)}`;
    this.button(PANEL.x + PANEL.w / 2, PANEL.y + 36 + 6 * 42 + 34, label, () => this.act(), o ? p.selectedVehicle !== v.id : p.money >= v.price, 0.95, true);
  }

  private drawWorkshopPanel(p: ReturnType<typeof getProfile>, spec: VehicleSpec, owned: boolean): void {
    this.text(PANEL.x + 16, PANEL.y + 10, `UPGRADES - ${spec.name.toUpperCase()}`, 16, Colors.yellow);
    if (!owned) {
      this.text(PANEL.x + 16, PANEL.y + 60, 'YOU DO NOT OWN THIS CAR.\nBUY IT IN THE SHOWROOM.', 14, '#ff6050');
      return;
    }
    const lv = p.vehicles[spec.id].upgrades;
    UPGRADE_KEYS.forEach((key: UpgradeKey, i) => {
      const y = PANEL.y + 34 + i * 38;
      const sel = i === this.cursor;
      const row = this.rect(PANEL.x + 10, y, PANEL.w - 20, 34, sel ? 0x2a2550 : 0x14122a, 1, sel ? 0xffd23f : 0x2a2850);
      row.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        if (this.cursor === i) this.act();
        else {
          this.cursor = i;
          this.redraw();
        }
      });
      this.view.add(this.add.image(PANEL.x + 30, y + 18, UPGRADES[key].icon).setScale(0.75));
      this.text(PANEL.x + 54, y + 3, UPGRADES[key].name, 14, Colors.white);
      this.text(PANEL.x + 54, y + 20, UPGRADES[key].effect, 10, Colors.grey, false);
      for (let l = 0; l < MAX_UPGRADE_LEVEL; l++) this.rect(PANEL.x + 214 + l * 16, y + 12, 12, 12, l < lv[key] ? 0x4de1ff : 0x000000, 1, 0x4de1ff);
      const cost = nextUpgradeCost(p, spec.id, key);
      this.text(PANEL.x + 270, y + 10, cost === null ? 'MAX' : money(cost), 13, cost === null ? '#60ff90' : p.money >= cost ? Colors.yellow : '#ff6050');
    });
    // Repair row.
    const i = UPGRADE_KEYS.length;
    const y = PANEL.y + 34 + i * 38;
    const sel = this.cursor === i;
    const dmg = p.vehicles[spec.id].damage;
    const row = this.rect(PANEL.x + 10, y, PANEL.w - 20, 34, sel ? 0x2a2550 : 0x14122a, 1, sel ? 0xffd23f : 0x2a2850);
    row.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      if (this.cursor === i) this.act();
      else {
        this.cursor = i;
        this.redraw();
      }
    });
    this.view.add(this.add.image(PANEL.x + 30, y + 18, 'ui_repair').setScale(0.75));
    this.text(PANEL.x + 54, y + 3, 'REPAIR', 14, Colors.white);
    this.rect(PANEL.x + 54, y + 22, 120, 8, 0x000000, 0.8);
    this.rect(PANEL.x + 54, y + 22, 120 * (dmg / 100), 8, dmg > 50 ? 0xe8344a : 0xffb020);
    this.text(PANEL.x + 180, y + 18, `${Math.round(dmg)}%`, 11, Colors.white);
    const cost = fullRepairCost(p, spec.id);
    this.text(PANEL.x + 270, y + 10, dmg > 0 ? money(cost) : 'OK', 13, dmg > 0 ? (p.money >= cost ? Colors.yellow : '#ff9a4a') : '#60ff90');

    const label = this.cursor < UPGRADE_KEYS.length ? 'UPGRADE' : dmg > 0 ? 'REPAIR' : 'NO DAMAGE';
    this.button(PANEL.x + PANEL.w / 2, PANEL.y + 34 + 8 * 38 + 24, label, () => this.act(), true, 0.95, true);
  }
}
