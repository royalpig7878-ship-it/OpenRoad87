import Phaser from 'phaser';
import { audio } from '../audio/AudioManager';
import { SceneKeys, TextureKeys, Colors, FONT } from '../core/config';
import { JOBS, MEDAL_PAY_MULT, FIRST_CLEAR_BONUS } from '../career/Jobs';
import { ENV_UNLOCK_REP, checkRequirements, isEnvUnlocked, jobStatus, payFor, rankFor, repFor } from '../career/Career';
import { getEnvironment } from '../road/environments/Environments';
import { getProfile } from '../economy/currentProfile';
import { effectiveSpec } from '../economy/Profile';
import { getVehicle } from '../vehicles/VehicleRoster';
import { startDrive } from './startDrive';
import { kphToMph } from '../systems/units';

const ROWS = 8;
const ROW_H = 46;
const MEDAL_COLOR = { none: 0x1c1a2c, bronze: 0xd08850, silver: 0xd0d8e8, gold: 0xffd23f } as const;
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/**
 * The career job board: take jobs for cash and reputation, see what each job needs from your car,
 * and watch roads and jobs unlock as your reputation grows.
 * Keyboard: Up/Down select, Enter start, G garage, Esc back. Mouse/touch: tap a job, then the buttons.
 */
export class CareerScene extends Phaser.Scene {
  private cursor = 0;
  private top = 0;
  private view!: Phaser.GameObjects.Container;
  private starting = false;
  private notice = '';

  constructor() {
    super(SceneKeys.Career);
  }

  init(data?: { jobId?: string }): void {
    this.starting = false;
    this.notice = '';
    const i = data?.jobId ? JOBS.findIndex((j) => j.id === data.jobId) : -1;
    if (i >= 0) this.cursor = i;
  }

  create(): void {
    audio.attach();
    audio.playMusic('menu');
    audio.duckMusic(1);
    this.add.image(480, 270, 'career_bg');
    this.add.rectangle(480, 270, 960, 540, 0x05060f, 0.6);
    this.view = this.add.container(0, 0);
    const kb = this.input.keyboard!;
    kb.on('keydown-UP', () => this.move(-1));
    kb.on('keydown-DOWN', () => this.move(1));
    kb.on('keydown-W', () => this.move(-1));
    kb.on('keydown-S', () => this.move(1));
    kb.on('keydown-ENTER', () => {
      audio.sfx('uiSelect');
      void this.start();
    });
    kb.on('keydown-SPACE', () => void this.start());
    kb.on('keydown-G', () => this.scene.start(SceneKeys.Garage));
    kb.on('keydown-ESC', () => this.back());
    this.scrollIntoView();
    this.redraw();
  }

  private move(d: number): void {
    this.cursor = (this.cursor + d + JOBS.length) % JOBS.length;
    audio.sfx('uiMove');
    this.notice = '';
    this.scrollIntoView();
    this.redraw();
  }

  private scrollIntoView(): void {
    if (this.cursor < this.top) this.top = this.cursor;
    if (this.cursor >= this.top + ROWS) this.top = this.cursor - ROWS + 1;
    this.top = Math.max(0, Math.min(JOBS.length - ROWS, this.top));
  }

  private back(): void {
    if (!this.starting) {
      audio.sfx('uiBack');
      this.scene.start(SceneKeys.MainMenu);
    }
  }

  private async start(): Promise<void> {
    if (this.starting) return;
    const p = getProfile();
    const job = JOBS[this.cursor];
    const spec = effectiveSpec(p, p.selectedVehicle);
    const status = jobStatus(job, p.reputation, spec, p.vehicles[p.selectedVehicle]?.damage ?? 0);
    if (status.state !== 'available') {
      this.notice = status.reason;
      this.redraw();
      return;
    }
    this.starting = true;
    await startDrive(this, p.selectedVehicle, false, { jobId: job.id, envId: job.challenge.env });
  }

  private text(x: number, y: number, s: string, size = 14, color: string = Colors.white, bold = true, wrap = 0): Phaser.GameObjects.Text {
    const t = this.add.text(x, y, s, { fontFamily: FONT, resolution: 2, fontSize: `${size}px`, fontStyle: bold ? 'bold' : 'normal', color, stroke: '#000000', strokeThickness: size > 16 ? 3 : 2, wordWrap: wrap ? { width: wrap } : undefined });
    this.view.add(t);
    return t;
  }

  private rect(x: number, y: number, w: number, h: number, color: number, alpha = 1, line?: number): Phaser.GameObjects.Rectangle {
    const r = this.add.rectangle(x, y, w, h, color, alpha).setOrigin(0, 0);
    if (line !== undefined) r.setStrokeStyle(2, line);
    this.view.add(r);
    return r;
  }

  private button(cx: number, cy: number, label: string, onClick: () => void, enabled = true, scale = 0.7): void {
    const img = this.add.image(cx, cy, enabled ? TextureKeys.ButtonSelected : 'ui_button_disabled').setScale(scale).setInteractive({ useHandCursor: enabled });
    img.on('pointerdown', () => {
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
    const car = getVehicle(p.selectedVehicle);
    const spec = effectiveSpec(p, car.id);
    const damage = p.vehicles[car.id]?.damage ?? 0;
    const rank = rankFor(p.reputation);

    // Header.
    this.text(24, 14, 'CAREER', 34, Colors.yellow);
    this.text(24, 54, `${rank.name}   REP ${p.reputation}`, 14, Colors.cyan);
    if (rank.next) {
      this.rect(190, 58, 130, 8, 0x000000, 0.8);
      const prev = [0, 50, 150, 300, 600][rank.index];
      this.rect(190, 58, 130 * Math.min(1, (p.reputation - prev) / (rank.next.rep - prev)), 8, 0x4de1ff);
    }
    this.view.add(this.add.image(580, 24, 'ui_coin'));
    this.text(600, 12, money(p.money), 22, Colors.yellow);
    this.text(740, 18, `${car.name.toUpperCase()}  DMG ${Math.round(damage)}%`, 13, damage >= 50 ? '#ff6050' : Colors.white);

    // Job list.
    for (let r = 0; r < ROWS; r++) {
      const i = this.top + r;
      const job = JOBS[i];
      const y = 78 + r * ROW_H;
      const sel = i === this.cursor;
      const st = jobStatus(job, p.reputation, spec, damage);
      const rec = p.completedJobs[job.id];
      const row = this.rect(16, y, 316, ROW_H - 4, sel ? 0x2a2550 : 0x14122a, 0.95, sel ? 0xffd23f : 0x2a2850);
      row.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        if (this.cursor === i) void this.start();
        else {
          this.cursor = i;
          this.notice = '';
          this.redraw();
        }
      });
      const dim = st.state === 'locked';
      this.text(26, y + 4, job.name.toUpperCase(), 14, dim ? Colors.grey : Colors.white);
      this.text(26, y + 22, st.state === 'locked' ? st.reason : st.state === 'blocked' ? st.reason : rec ? `CLEARED - ${rec.medal.toUpperCase()}` : 'AVAILABLE', 10, st.state === 'available' ? (rec ? '#60ff90' : Colors.cyan) : st.state === 'blocked' ? '#ff9a4a' : Colors.grey, false);
      this.text(262, y + 6, `T${job.tier}`, 12, Colors.grey);
      this.text(262, y + 22, money(job.pay), 11, dim ? Colors.grey : Colors.yellow, false);
      this.rect(306, y + 8, 14, 14, rec ? MEDAL_COLOR[rec.medal] : 0x1c1a2c, 1, 0x555566);
    }
    this.text(24, 452, `${this.top + 1}-${Math.min(JOBS.length, this.top + ROWS)} OF ${JOBS.length}  (UP/DOWN FOR MORE)`, 10, Colors.grey, false);

    // Details.
    const job = JOBS[this.cursor];
    const st = jobStatus(job, p.reputation, spec, damage);
    const rec = p.completedJobs[job.id];
    const env = getEnvironment(job.challenge.env);
    const X = 346;
    this.rect(X, 74, 598, 414, 0x0c0a1a, 0.92, 0xffd23f);
    this.text(X + 16, 82, job.name.toUpperCase(), 24, Colors.yellow);
    this.text(X + 16, 112, `CLIENT: ${job.client}`, 12, Colors.cyan);
    this.text(X + 16, 134, job.blurb, 13, Colors.white, false, 560);

    const c = job.challenge;
    const rules = [`TIME ${c.timeLimit} S`, c.targetM ? `${(c.targetM / 1000).toFixed(1)} KM` : '', c.speed ? `KEEP ABOVE ${Math.round(kphToMph(c.speed.minKph))} MPH` : '', c.police ? `POLICE LEVEL ${c.police.level}` : '', `TRAFFIC ${c.trafficLevel.toUpperCase()}`].filter(Boolean).join('   ');
    this.text(X + 16, 184, rules, 12, Colors.white);
    const unlocked = isEnvUnlocked(p.reputation, env.id);
    this.text(X + 16, 206, `ROAD: ${env.name.toUpperCase()}${unlocked ? '' : `  (LOCKED - REP ${ENV_UNLOCK_REP[env.id]})`}`, 12, unlocked ? Colors.white : '#ff9a4a');

    // Requirements vs the current car.
    this.text(X + 16, 236, 'YOUR CAR MUST HAVE', 12, Colors.grey);
    const checks = checkRequirements(spec, job.requirements);
    if (checks.length === 0) this.text(X + 16, 256, 'NOTHING SPECIAL - ANY CAR WILL DO', 12, '#60ff90', false);
    checks.forEach((ch, i) => this.text(X + 16, 256 + i * 34, `${ch.ok ? 'OK' : 'NO'}  ${ch.label}\n    NEED ${ch.need}   HAVE ${ch.have}`, 12, ch.ok ? '#60ff90' : '#ff6050'));

    // Pay.
    this.text(X + 330, 236, 'PAY (FIRST CLEAR)', 12, Colors.grey);
    (['bronze', 'silver', 'gold'] as const).forEach((m, i) => {
      this.rect(X + 330, 258 + i * 22, 12, 12, MEDAL_COLOR[m], 1, 0x555566);
      this.text(X + 350, 255 + i * 22, `${m.toUpperCase()} ${c.medals[m].toLocaleString('en-US')} PTS = ${money(payFor(job, m, true))}  +${repFor(job, m, true)} REP`, 11, Colors.white, false);
    });
    this.text(X + 330, 326, `REPLAYS PAY ${Math.round((MEDAL_PAY_MULT.bronze * 0.6 / FIRST_CLEAR_BONUS) * 100)}% OF THAT`, 10, Colors.grey, false);

    if (rec) this.text(X + 16, 350, `BEST: ${rec.medal.toUpperCase()}  ${rec.score.toLocaleString('en-US')} PTS  (CLEARED ${rec.count}X)`, 13, '#60ff90');
    const msg = this.notice || (st.state === 'available' ? 'READY' : st.reason);
    this.text(X + 16, 384, msg, 14, st.state === 'available' && !this.notice ? '#60ff90' : '#ff9a4a');

    this.button(X + 110, 456, 'START JOB', () => void this.start(), st.state === 'available', 0.75);
    this.button(X + 300, 456, 'GARAGE', () => this.scene.start(SceneKeys.Garage), true, 0.75);
    this.button(X + 490, 456, 'BACK', () => this.back(), true, 0.75);
    this.text(16, 520, 'UP/DOWN job   ENTER start   G garage   ESC back', 11, Colors.grey, false);
  }
}
