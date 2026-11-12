import Phaser from 'phaser';
import { PoliceManager } from '../police/PoliceManager';
import { Colors, FONT, VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../core/config';
import { setTextCached } from './textUtil';
import { kphToMph } from '../systems/units';

/**
 * Police HUD: a heat meter while a cop can see you, a flashing pursuit banner with arrest/escape progress during a
 * chase, a result card when it ends, and a red/blue siren glow on the windshield when cruisers are close.
 */
export class PursuitHud {
  private gfx: Phaser.GameObjects.Graphics;
  private glow: Phaser.GameObjects.Rectangle;
  private icon: Phaser.GameObjects.Image;
  private title: Phaser.GameObjects.Text;
  private sub: Phaser.GameObjects.Text;
  private limit: Phaser.GameObjects.Text;
  private card: Phaser.GameObjects.Text;
  private clock = 0;

  constructor(scene: Phaser.Scene) {
    // The glow sits just under the cockpit (depth 20) so it tints the view through the glass.
    this.glow = scene.add.rectangle(VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, 0xff0000).setDepth(17.5).setAlpha(0);
    this.gfx = scene.add.graphics().setDepth(31);
    this.icon = scene.add.image(60, 70, 'ui_police_alert').setDepth(32).setVisible(false);
    const style = { fontFamily: FONT, resolution: 2, fontSize: '16px', fontStyle: 'bold', color: Colors.white, stroke: '#000000', strokeThickness: 3 };
    this.title = scene.add.text(86, 52, '', { ...style, fontSize: '20px' }).setDepth(32);
    this.sub = scene.add.text(86, 76, '', { ...style, fontSize: '13px', fontStyle: 'normal' }).setDepth(32);
    this.limit = scene.add.text(46, 48, '', { fontFamily: FONT, resolution: 2, fontSize: '14px', fontStyle: 'bold', color: '#000000' }).setDepth(32).setOrigin(0.5);
    this.card = scene.add
      .text(VIRTUAL_WIDTH / 2, 210, '', { ...style, fontSize: '22px', align: 'center', backgroundColor: '#000000cc', padding: { x: 18, y: 12 } })
      .setOrigin(0.5)
      .setDepth(33)
      .setVisible(false);
  }

  update(dt: number, police: PoliceManager, playerSpeedKph: number, nearestBehind: number): void {
    this.clock += dt;
    const g = this.gfx;
    g.clear();
    // Work out what should be on screen this frame, then apply it once at the end. (Re-setting text every frame
    // forces Phaser to redraw it on a canvas and re-upload it, which was the most expensive thing in the frame.)
    let iconOn = false;
    let title = '', titleX = 84, titleY = 46, titleSize = 14, titleColor: string = Colors.white;
    let sub = '', limit = '', cardText = '', cardColor: string = Colors.white;
    let glow = 0;
    let glowColor = 0xff0000;
    const flash = Math.floor(this.clock * 5) % 2 === 0;

    if (police.enabled) {
      if (police.state === 'idle') {
        // Only shown when a cop can see you (or still remembers you): no cop around, no meter.
        const speeding = playerSpeedKph > police.speedLimitKph;
        if (police.watched || police.heat > 2) {
          // Speed-limit sign.
          g.fillStyle(0xffffff, 1).fillRoundedRect(24, 38, 44, 44, 6).lineStyle(3, 0xd02020, 1).strokeRoundedRect(24, 38, 44, 44, 6);
          limit = `${Math.round(kphToMph(police.speedLimitKph))}`;
          // Heat meter.
          const frac = police.heat / 100;
          g.fillStyle(0x000000, 0.75).fillRect(78, 46, 154, 36);
          g.fillStyle(0x2a2a34, 1).fillRect(84, 66, 142, 10);
          g.fillStyle(frac > 0.7 ? 0xff3030 : 0xffb020, 1).fillRect(84, 66, 142 * frac, 10);
          title = police.watched && speeding ? `COP SEES YOU  ${Math.round(kphToMph(playerSpeedKph))} MPH` : police.watched ? 'COP NEARBY' : 'HEAT';
          titleColor = police.watched && speeding ? (flash ? '#ff6050' : '#ffffff') : Colors.yellow;
        }
      } else if (police.state === 'pursuit') {
        const color = flash ? 0xd02020 : 0x2050e0;
        g.fillStyle(color, 0.92).fillRect(24, 40, 330, 56);
        g.lineStyle(2, 0xffffff, 1).strokeRect(24, 40, 330, 56);
        iconOn = true;
        title = 'POLICE PURSUIT';
        titleX = 74;
        titleY = 44;
        titleSize = 20;
        sub = `${police.level.name.toUpperCase()}  UNITS ${police.activeCount}  ${nearestBehind < 1e8 ? Math.round((nearestBehind / 381) | 0) + ' M' : ''}`;
        // Arrest (red) and escape (green) progress.
        g.fillStyle(0x000000, 0.75).fillRect(24, 100, 330, 24);
        g.fillStyle(0x2a2a34, 1).fillRect(30, 104, 150, 7).fillRect(30, 113, 150, 7);
        g.fillStyle(0xff3030, 1).fillRect(30, 104, 150 * police.bust, 7);
        g.fillStyle(0x40e070, 1).fillRect(30, 113, 150 * police.evade, 7);
        glow = nearestBehind < 6000 ? 0.1 + 0.1 * (1 - nearestBehind / 6000) : 0.05;
        glowColor = flash ? 0xff2020 : 0x2040ff;
      } else if (police.lastResult) {
        const r = police.lastResult;
        const busted = r.outcome === 'busted';
        cardText = (busted
          ? [`BUSTED`, `${police.level.name}`, `FINE  $${r.fine}`, `REP ${r.reputation}   SCORE ${r.score}`]
          : [`ESCAPED!`, `${police.level.name}`, `REWARD  $${r.cash}`, `REP +${r.reputation}   SCORE ${r.score}`]
        ).join('\n');
        cardColor = busted ? '#ff6050' : '#60ff90';
        glow = busted ? 0.12 : 0;
        glowColor = flash ? 0xff2020 : 0x2040ff;
      }
    }

    this.icon.setVisible(iconOn);
    setTextCached(this.title, title, titleColor, titleSize);
    if (title) this.title.setPosition(titleX, titleY);
    setTextCached(this.sub, sub);
    if (sub) this.sub.setPosition(74, 70);
    setTextCached(this.limit, limit);
    if (limit) this.limit.setPosition(46, 62);
    setTextCached(this.card, cardText, cardText ? cardColor : undefined);
    this.card.setVisible(cardText !== '');
    // Colour changes force a redraw, so only touch the glow when it is visible or was just visible.
    if (glow > 0 || this.glow.alpha > 0) this.glow.setFillStyle(glowColor).setAlpha(glow);
  }

  destroy(): void {
    [this.gfx, this.glow, this.icon, this.title, this.sub, this.limit, this.card].forEach((o) => o.destroy());
  }
}
