import Phaser from 'phaser';
import { FONT } from '../core/config';
import { audio } from '../audio/AudioManager';

/** A tappable "SOUND ON / OFF" label (the X key does the same on desktop). Shows the current state. */
export class MuteButton {
  readonly text: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, depth = 50, size = 14, originX = 0.5) {
    this.text = scene.add
      .text(x, y, '', { fontFamily: FONT, resolution: 2, fontSize: `${size}px`, fontStyle: 'bold', color: '#ffd23f', backgroundColor: '#2a2550', padding: { x: 10, y: 6 }, stroke: '#000000', strokeThickness: 2 })
      .setOrigin(originX, 0.5)
      .setDepth(depth)
      .setInteractive({ useHandCursor: true });
    this.text.on('pointerdown', () => {
      audio.unlock();
      audio.toggleMute();
      if (!audio.muted) audio.sfx('uiSelect');
      this.refresh();
    });
    // The X key toggles mute too; keep the label in sync.
    const onKey = (e: KeyboardEvent) => e.code === 'KeyX' && this.refresh();
    window.addEventListener('keydown', onKey);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener('keydown', onKey));
    this.refresh();
  }

  refresh(): void {
    if (this.text.active) this.text.setText(audio.muted ? 'SOUND OFF  [X]' : 'SOUND ON  [X]').setColor(audio.muted ? '#ff7a6a' : '#ffd23f');
  }
}
