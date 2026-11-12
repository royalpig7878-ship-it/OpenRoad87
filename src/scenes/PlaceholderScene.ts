import Phaser from 'phaser';
import { SceneKeys, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, Colors, FONT } from '../core/config';

export interface PlaceholderData {
  title: string;
  milestone: string;
}

/** Stand-in screen for features scheduled in later milestones. */
export class PlaceholderScene extends Phaser.Scene {
  private info: PlaceholderData = { title: '', milestone: '' };

  constructor() {
    super(SceneKeys.Placeholder);
  }

  init(data: PlaceholderData): void {
    this.info = data;
  }

  create(): void {
    const cx = VIRTUAL_WIDTH / 2;
    this.add.rectangle(cx, VIRTUAL_HEIGHT / 2, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, 0x14102a);
    this.add.text(cx, 200, this.info.title, { fontFamily: FONT, resolution: 2, fontSize: '40px', color: Colors.yellow }).setOrigin(0.5);
    this.add.text(cx, 270, `NOT YET BUILT - ${this.info.milestone}`, { fontFamily: FONT, resolution: 2, fontSize: '20px', color: Colors.cyan }).setOrigin(0.5);
    this.add.text(cx, 400, '< BACK (ESC / ENTER / TAP)', { fontFamily: FONT, resolution: 2, fontSize: '22px', color: Colors.white }).setOrigin(0.5);

    const goBack = () => this.scene.start(SceneKeys.MainMenu);
    this.input.keyboard?.once('keydown-ESC', goBack);
    this.input.keyboard?.once('keydown-ENTER', goBack);
    // Delay so the tap that opened this screen doesn't immediately close it.
    this.time.delayedCall(250, () => this.input.once('pointerdown', goBack));
  }
}
