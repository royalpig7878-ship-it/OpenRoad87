import Phaser from 'phaser';
import { audio } from '../audio/AudioManager';
import { SceneKeys, TextureKeys, Colors, FONT } from '../core/config';
import { CHALLENGES, ChallengeDef } from '../arcade/Challenges';
import { ENVIRONMENTS, getEnvironment } from '../road/environments/Environments';
import { getProfile } from '../economy/currentProfile';
import { bestScore } from '../economy/Profile';
import { getVehicle } from '../vehicles/VehicleRoster';
import { startDrive } from './startDrive';
import { kphToMph } from '../systems/units';

const PANEL = { x: 330, y: 70, w: 600, h: 410 };
const medalColor = (def: ChallengeDef, score: number) =>
  score >= def.medals.gold ? '#ffd23f' : score >= def.medals.silver ? '#d0d8e8' : score >= def.medals.bronze ? '#d08850' : '#555566';

/**
 * Arcade challenge selection: pick a challenge and an environment, see your best scores and medal targets, then start.
 * Keyboard: Up/Down challenge, Left/Right environment, Enter start, Esc back. Mouse/touch: tap rows and buttons.
 */
export class ArcadeMenuScene extends Phaser.Scene {
  private cursor = 0;
  private envIndex: number[] = CHALLENGES.map((c) => Math.max(0, ENVIRONMENTS.findIndex((e) => e.id === c.env)));
  private view!: Phaser.GameObjects.Container;
  private starting = false;

  constructor() {
    super(SceneKeys.ArcadeMenu);
  }

  create(): void {
    audio.attach();
    audio.playMusic('menu');
    audio.duckMusic(1);
    this.starting = false;
    this.add.image(480, 270, 'arcade_bg');
    this.add.rectangle(480, 270, 960, 540, 0x08061a, 0.55);
    this.view = this.add.container(0, 0);
    const kb = this.input.keyboard!;
    kb.on('keydown-UP', () => this.move(-1));
    kb.on('keydown-DOWN', () => this.move(1));
    kb.on('keydown-W', () => this.move(-1));
    kb.on('keydown-S', () => this.move(1));
    kb.on('keydown-LEFT', () => this.env(-1));
    kb.on('keydown-RIGHT', () => this.env(1));
    kb.on('keydown-A', () => this.env(-1));
    kb.on('keydown-D', () => this.env(1));
    kb.on('keydown-ENTER', () => {
      audio.sfx('uiSelect');
      void this.start();
    });
    kb.on('keydown-SPACE', () => this.start());
    kb.on('keydown-ESC', () => this.back());
    this.redraw();
  }

  private move(d: number): void {
    this.cursor = (this.cursor + d + CHALLENGES.length) % CHALLENGES.length;
    audio.sfx('uiMove');
    this.redraw();
  }

  private env(d: number): void {
    this.envIndex[this.cursor] = (this.envIndex[this.cursor] + d + ENVIRONMENTS.length) % ENVIRONMENTS.length;
    audio.sfx('uiMove');
    this.redraw();
  }

  private back(): void {
    if (!this.starting) {
      audio.sfx('uiBack');
      this.scene.start(SceneKeys.MainMenu);
    }
  }

  private async start(): Promise<void> {
    if (this.starting) return;
    this.starting = true;
    const def = CHALLENGES[this.cursor];
    const p = getProfile();
    await startDrive(this, p.selectedVehicle, false, { challengeId: def.id, envId: ENVIRONMENTS[this.envIndex[this.cursor]].id });
  }

  private text(x: number, y: number, s: string, size = 14, color: string = Colors.white, bold = true): Phaser.GameObjects.Text {
    const t = this.add.text(x, y, s, { fontFamily: FONT, resolution: 2, fontSize: `${size}px`, fontStyle: bold ? 'bold' : 'normal', color, stroke: '#000000', strokeThickness: size > 16 ? 3 : 2, wordWrap: { width: 540 } });
    this.view.add(t);
    return t;
  }

  private rect(x: number, y: number, w: number, h: number, color: number, alpha = 1, line?: number): Phaser.GameObjects.Rectangle {
    const r = this.add.rectangle(x, y, w, h, color, alpha).setOrigin(0, 0);
    if (line !== undefined) r.setStrokeStyle(2, line);
    this.view.add(r);
    return r;
  }

  private button(cx: number, cy: number, label: string, onClick: () => void, scale = 1): void {
    const img = this.add.image(cx, cy, TextureKeys.ButtonSelected).setScale(scale).setInteractive({ useHandCursor: true });
    img.on('pointerdown', () => {
      audio.sfx('uiSelect');
      onClick();
    });
    const t = this.add.text(cx, cy, label, { fontFamily: FONT, resolution: 2, fontSize: `${Math.round(18 * scale)}px`, fontStyle: 'bold', color: Colors.white, stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5);
    this.view.add([img, t]);
  }

  private redraw(): void {
    this.view.removeAll(true);
    const p = getProfile();
    this.text(24, 18, 'ARCADE', 36, Colors.yellow);
    this.text(24, 62, `DRIVING: ${getVehicle(p.selectedVehicle).name.toUpperCase()}`, 12, Colors.cyan);

    // Challenge list.
    CHALLENGES.forEach((c, i) => {
      const y = 90 + i * 62;
      const sel = i === this.cursor;
      const row = this.rect(16, y, 300, 56, sel ? 0x2a2550 : 0x14122a, 0.95, sel ? 0xffd23f : 0x2a2850);
      row.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        if (this.cursor === i) void this.start();
        else {
          this.cursor = i;
          this.redraw();
        }
      });
      this.text(28, y + 8, c.name.toUpperCase(), 17, Colors.white);
      const best = bestScore(p, c.id);
      this.text(28, y + 31, best ? `BEST ${best.toLocaleString('en-US')}` : 'NO SCORE YET', 12, best ? Colors.yellow : Colors.grey);
      this.rect(288, y + 10, 16, 16, best >= c.medals.bronze ? parseInt(medalColor(c, best).slice(1), 16) : 0x1c1a2c, 1, 0x555566);
    });

    // Details.
    const def = CHALLENGES[this.cursor];
    const env = ENVIRONMENTS[this.envIndex[this.cursor]];
    this.rect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 0x0c0a1a, 0.92, 0xffd23f);
    this.text(PANEL.x + 18, PANEL.y + 12, def.name.toUpperCase(), 26, Colors.yellow);
    this.text(PANEL.x + 18, PANEL.y + 50, def.blurb, 14, Colors.white, false);
    const rules: string[] = [`TIME  ${def.timeLimit} S${def.kind === 'checkpoint' ? ` (+${def.checkpoint!.bonusS} S PER GATE)` : ''}`];
    if (def.targetM) rules.push(`DISTANCE  ${(def.targetM / 1000).toFixed(1)} KM`);
    if (def.speed) rules.push(`MINIMUM SPEED  ${Math.round(kphToMph(def.speed.minKph))} MPH`);
    if (def.police) rules.push(`POLICE LEVEL ${def.police.level}${def.police.startPursuit ? ' - ALREADY CHASING YOU' : ''}`);
    rules.push(`TRAFFIC  ${def.trafficLevel.toUpperCase()}`);
    this.text(PANEL.x + 18, PANEL.y + 112, rules.join('\n'), 13, Colors.cyan);

    this.text(PANEL.x + 18, PANEL.y + 196, 'ROAD', 13, Colors.grey);
    this.text(PANEL.x + 70, PANEL.y + 192, `<  ${env.name.toUpperCase()}  >`, 18, Colors.white);
    this.text(PANEL.x + 360, PANEL.y + 196, `LIMIT ${getEnvironment(env.id).speedLimitMph} MPH`, 12, Colors.grey);
    const left = this.rect(PANEL.x + 62, PANEL.y + 186, 26, 30, 0x000000, 0.01);
    left.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.env(-1));
    const right = this.rect(PANEL.x + 330, PANEL.y + 186, 26, 30, 0x000000, 0.01);
    right.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.env(1));

    // Medals and high scores.
    this.text(PANEL.x + 18, PANEL.y + 236, 'MEDALS', 13, Colors.grey);
    const medals: [string, number, string][] = [['BRONZE', def.medals.bronze, '#d08850'], ['SILVER', def.medals.silver, '#d0d8e8'], ['GOLD', def.medals.gold, '#ffd23f']];
    medals.forEach(([n, v, c], i) => this.text(PANEL.x + 18 + i * 130, PANEL.y + 256, `${n} ${v.toLocaleString('en-US')}`, 13, c));
    this.text(PANEL.x + 18, PANEL.y + 288, 'HIGH SCORES', 13, Colors.grey);
    const table = p.highScores[def.id] ?? [];
    if (table.length === 0) this.text(PANEL.x + 18, PANEL.y + 308, 'NONE YET - BE THE FIRST!', 13, Colors.white, false);
    table.forEach((e, i) => this.text(PANEL.x + 18, PANEL.y + 308 + i * 18, `${i + 1}.  ${e.score.toLocaleString('en-US').padStart(8)}   ${getVehicle(e.vehicle).name.toUpperCase()}`, 13, i === 0 ? Colors.yellow : Colors.white, false));

    this.button(PANEL.x + 130, PANEL.y + PANEL.h - 28, 'START', () => void this.start(), 0.8);
    this.button(PANEL.x + 330, PANEL.y + PANEL.h - 28, 'BACK', () => this.back(), 0.8);
    this.text(16, 520, 'UP/DOWN challenge   LEFT/RIGHT road   ENTER start   ESC back', 11, Colors.grey, false);
  }
}
