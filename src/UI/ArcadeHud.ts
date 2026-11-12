import { setTextCached } from './textUtil';
import Phaser from 'phaser';
import { ArcadeSession } from '../arcade/ArcadeSession';
import { Colors, FONT, VIRTUAL_WIDTH } from '../core/config';
import { kphToMph } from '../systems/units';

const fmtTime = (s: number) => {
  const t = Math.max(0, s);
  const m = Math.floor(t / 60);
  return `${m}:${(t % 60).toFixed(1).padStart(4, '0')}`;
};

/** Arcade heads-up display: clock, score, the challenge's objective, speed meter, and the start countdown. */
export class ArcadeHud {
  private gfx: Phaser.GameObjects.Graphics;
  private time: Phaser.GameObjects.Text;
  private score: Phaser.GameObjects.Text;
  private goal: Phaser.GameObjects.Text;
  private big: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(31);
    const style = { fontFamily: FONT, resolution: 2, fontSize: '20px', fontStyle: 'bold', color: Colors.white, stroke: '#000000', strokeThickness: 3 };
    this.time = scene.add.text(392, 40, '', style).setDepth(32);
    this.score = scene.add.text(392, 64, '', { ...style, fontSize: '15px', color: Colors.yellow }).setDepth(32);
    this.goal = scene.add.text(392, 84, '', { ...style, fontSize: '13px', fontStyle: 'normal', color: Colors.cyan }).setDepth(32);
    this.big = scene.add.text(VIRTUAL_WIDTH / 2, 150, '', { ...style, fontSize: '64px', strokeThickness: 6 }).setOrigin(0.5).setDepth(35);
  }

  update(s: ArcadeSession, speedKph: number): void {
    const g = this.gfx;
    g.clear();
    g.fillStyle(0x000000, 0.62).fillRect(384, 36, 276, 76);
    const low = s.timeLeft < 10 && s.phase === 'running';
    setTextCached(this.time, `TIME ${fmtTime(s.timeLeft)}`, low && Math.floor(s.elapsed * 3) % 2 === 0 ? '#ff5a4a' : Colors.white);
    setTextCached(this.score, `SCORE ${Math.round(s.score).toLocaleString('en-US')}`);

    const d = s.def;
    let goal = '';
    if (d.kind === 'time_trial') goal = `FINISH ${(Math.max(0, d.targetM! - s.distanceM) / 1000).toFixed(2)} KM`;
    else if (d.kind === 'checkpoint') goal = `GATES ${s.checkpoints}   NEXT ${Math.max(0, Math.round(((s.nextGateM ?? 0) - s.distanceM) / 5) * 5)} M`;
    else if (d.kind === 'distance') goal = `DISTANCE ${(s.distanceM / 1000).toFixed(2)} KM`;
    else if (d.kind === 'survival') goal = `SURVIVE  ${(s.distanceM / 1000).toFixed(1)} KM`;
    else if (d.kind === 'high_speed') goal = `KEEP ABOVE ${Math.round(kphToMph(d.speed!.minKph))} MPH`;
    else goal = 'LOSE THE POLICE';
    setTextCached(this.goal, goal);

    if (d.speed) {
      const frac = s.speedMeter / d.speed.meterS;
      const slow = speedKph < d.speed.minKph;
      g.fillStyle(0x2a2a34, 1).fillRect(392, 102, 244, 6);
      g.fillStyle(slow ? 0xff3030 : 0x40e070, 1).fillRect(392, 102, 244 * frac, 6);
    }

    if (s.phase === 'countdown') {
      const n = Math.ceil(s.countdown);
      setTextCached(this.big, n > 0 ? `${n}` : 'GO!', n > 1 ? Colors.white : Colors.yellow);
      this.big.setVisible(true);
    } else if (s.phase === 'running' && s.elapsed < 0.8) {
      setTextCached(this.big, 'GO!', '#60ff90');
      this.big.setVisible(true);
    }
    else this.big.setVisible(false);
  }

  destroy(): void {
    [this.gfx, this.time, this.score, this.goal, this.big].forEach((o) => o.destroy());
  }
}
