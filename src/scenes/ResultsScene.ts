import Phaser from 'phaser';
import { audio } from '../audio/AudioManager';
import { SceneKeys, TextureKeys, Colors, FONT } from '../core/config';
import { ArcadeResult, Outcome } from '../arcade/ArcadeSession';
import { getChallenge } from '../arcade/Challenges';
import { getProfile } from '../economy/currentProfile';
import { startDrive } from './startDrive';
import { CareerOutcome } from '../career/Career';
import { getJob } from '../career/Jobs';
import { getEnvironment } from '../road/environments/Environments';

export interface ResultsData {
  result: ArcadeResult;
  envId: string;
  rank: number | null;
  newBest: boolean;
  /** Set when the run was a career job. */
  jobId?: string;
  career?: CareerOutcome;
}

const HEADLINE: Record<Outcome, [string, string]> = {
  complete: ['FINISHED!', '#60ff90'],
  time_up: ['TIME UP', '#ffd23f'],
  wrecked: ['WRECKED', '#ff5a4a'],
  out_of_fuel: ['OUT OF FUEL', '#ff5a4a'],
  busted: ['BUSTED', '#ff5a4a'],
  speed_lost: ['SPEED LOST', '#ffd23f'],
  escaped: ['ESCAPED!', '#60ff90'],
};
const MEDAL_COLOR = { none: '#777788', bronze: '#d08850', silver: '#d0d8e8', gold: '#ffd23f' } as const;

/** Arcade results: outcome, score breakdown, medal, high-score rank, and what to do next. */
export class ResultsScene extends Phaser.Scene {
  private data0!: ResultsData;
  private leaving = false;

  constructor() {
    super(SceneKeys.Results);
  }

  init(data: ResultsData): void {
    this.data0 = data;
    this.leaving = false;
  }

  create(): void {
    audio.attach();
    audio.playMusic('menu');
    audio.duckMusic(1);
    const { result: r, rank, newBest } = this.data0;
    const job = this.data0.jobId ? getJob(this.data0.jobId) : undefined;
    const career = this.data0.career;
    const def = getChallenge(r.challengeId);
    this.add.image(480, 270, 'results_bg');
    this.add.rectangle(480, 270, 960, 540, 0x000000, 0.35);
    this.add.rectangle(480, 240, 520, 410, 0x0c0a1a, 0.9).setStrokeStyle(3, 0xffd23f);

    const style = (size: number, color: string = Colors.white, bold = true) => ({ fontFamily: FONT, resolution: 2, fontSize: `${size}px`, fontStyle: bold ? 'bold' : 'normal', color, stroke: '#000000', strokeThickness: size > 16 ? 4 : 2 });
    this.add.text(480, 56, (job ? `JOB: ${job.name}` : def.name).toUpperCase(), style(16, Colors.cyan)).setOrigin(0.5);
    const [head, headColor] = HEADLINE[r.outcome];
    this.add.text(480, 92, head, style(40, headColor)).setOrigin(0.5);
    this.add.text(480, 140, `SCORE  ${r.score.toLocaleString('en-US')}`, style(30, Colors.yellow)).setOrigin(0.5);
    if (newBest) this.add.text(480, 174, 'NEW HIGH SCORE!', style(18, '#60ff90')).setOrigin(0.5);
    else if (rank) this.add.text(480, 174, `HIGH SCORE RANK ${rank}`, style(16, Colors.white)).setOrigin(0.5);

    // Breakdown.
    let y = 204;
    for (const line of r.lines) {
      this.add.text(260, y, line.label, style(14, Colors.grey, false));
      this.add.text(700, y, `${line.value < 0 ? '-' : ''}${Math.abs(line.value).toLocaleString('en-US')}`, style(14, line.value < 0 ? '#ff6050' : Colors.white)).setOrigin(1, 0);
      y += 22;
    }
    this.add.text(260, y + 6, `TIME ${r.timeS.toFixed(1)} S   DISTANCE ${(r.distanceM / 1000).toFixed(2)} KM`, style(12, Colors.grey, false));

    if (career) {
      let cy = y + 34;
      const line = (text: string, color: string = Colors.white) => {
        this.add.text(480, cy, text, style(15, color)).setOrigin(0.5, 0);
        cy += 22;
      };
      if (career.success) {
        line(`PAID  $${career.cash.toLocaleString('en-US')}${career.firstClear ? '  (FIRST CLEAR BONUS)' : '  (REPLAY RATE)'}`, '#60ff90');
        line(`REPUTATION  +${career.rep}`, Colors.cyan);
      } else {
        line(career.fine > 0 ? `FINED  $${career.fine.toLocaleString('en-US')}` : 'JOB FAILED - NO PAY', '#ff6050');
      }
      if (career.rankedUp) line(`RANK UP!  ${career.rankBefore} -> ${career.rankAfter}`, '#ffd23f');
      for (const id of career.unlockedEnvs) line(`NEW ROAD UNLOCKED: ${getEnvironment(id).name.toUpperCase()}`, '#ffd23f');
      if (career.unlockedJobs.length) line(`${career.unlockedJobs.length} NEW JOB${career.unlockedJobs.length > 1 ? 'S' : ''} AVAILABLE`, '#ffd23f');
    }

    // Medal.
    const medal = this.add.image(640, 100, 'career_medal').setScale(0.9);
    medal.setTint(r.success && r.medal !== 'none' ? parseInt(MEDAL_COLOR[r.medal].slice(1), 16) : 0x444455);
    this.add.text(640, 150, r.medal === 'none' ? (r.success ? 'NO MEDAL' : 'FAILED') : r.medal.toUpperCase(), style(14, MEDAL_COLOR[r.medal])).setOrigin(0.5);

    const menuKey = job ? SceneKeys.Career : SceneKeys.ArcadeMenu;
    this.button(340, 470, 'RETRY', () => void this.retry());
    this.button(620, 470, job ? 'JOB BOARD' : 'ARCADE MENU', () => this.go(menuKey));
    const kb = this.input.keyboard!;
    kb.on('keydown-ENTER', () => void this.retry());
    kb.on('keydown-ESC', () => this.go(menuKey));
    kb.on('keydown-M', () => this.go(SceneKeys.MainMenu));
  }

  private button(cx: number, cy: number, label: string, onClick: () => void): void {
    this.add.image(cx, cy, TextureKeys.ButtonSelected).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      audio.sfx('uiSelect');
      onClick();
    });
    this.add.text(cx, cy, label, { fontFamily: FONT, resolution: 2, fontSize: '18px', fontStyle: 'bold', color: Colors.white, stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5);
  }

  private go(key: string): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.start(key);
  }

  private async retry(): Promise<void> {
    if (this.leaving) return;
    this.leaving = true;
    await startDrive(this, getProfile().selectedVehicle, false, this.data0.jobId ? { jobId: this.data0.jobId, envId: this.data0.envId } : { challengeId: this.data0.result.challengeId, envId: this.data0.envId });
  }
}
