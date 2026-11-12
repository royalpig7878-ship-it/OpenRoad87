import Phaser from 'phaser';
import { audio } from '../audio/AudioManager';
import { MuteButton } from '../UI/MuteButton';
import { startDrive } from './startDrive';
import { getProfile } from '../economy/currentProfile';
import { saveManager } from '../save/SaveManager';
import { rankFor } from '../career/Career';
import { SceneKeys, TextureKeys, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, Colors, FONT, GAME_TITLE, GAME_VERSION } from '../core/config';

interface MenuItem {
  label: string;
  milestone: string;
  /** If set, opens this scene instead of the placeholder. */
  scene?: string;
}

const ALL_ITEMS: MenuItem[] = [
  { label: 'ARCADE', milestone: '', scene: SceneKeys.ArcadeMenu },
  { label: 'CAREER', milestone: '', scene: SceneKeys.Career },
  { label: 'GARAGE', milestone: '', scene: SceneKeys.Garage },
  { label: 'SETTINGS', milestone: '', scene: SceneKeys.Settings },
  { label: 'ROAD TEST (DEV)', milestone: '', scene: SceneKeys.RoadTest },
];

/** The developer road test is only offered in development builds. */
const ITEMS: MenuItem[] = ALL_ITEMS.filter((i) => import.meta.env.DEV || i.scene !== SceneKeys.RoadTest);

/** Title screen. Navigable by keyboard, gamepad, mouse and touch. */
export class MainMenuScene extends Phaser.Scene {
  private selected = 0;
  private buttons: Phaser.GameObjects.Image[] = [];
  private lastPadDir = 0;
  private padAHeld = false;
  private ready = false;

  constructor() {
    super(SceneKeys.MainMenu);
  }

  create(): void {
    audio.attach();
    audio.playMusic('menu');
    audio.duckMusic(1);
    this.selected = 0;
    this.buttons = [];
    const cx = VIRTUAL_WIDTH / 2;

    this.add.image(cx, VIRTUAL_HEIGHT / 2, TextureKeys.TitleBackground);
    this.add.rectangle(cx, VIRTUAL_HEIGHT / 2, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, 0x000000, 0.35);

    this.add.text(cx + 3, 63, GAME_TITLE, { fontFamily: FONT, resolution: 2, fontSize: '56px', fontStyle: 'bold', color: '#000000' }).setOrigin(0.5);
    this.add.text(cx, 60, GAME_TITLE, { fontFamily: FONT, resolution: 2, fontSize: '56px', fontStyle: 'bold', color: Colors.yellow }).setOrigin(0.5);
    this.add.text(cx, 105, 'HIGHWAY DRIVING SIMULATOR', { fontFamily: FONT, resolution: 2, fontSize: '16px', color: Colors.cyan }).setOrigin(0.5);

    ITEMS.forEach((item, i) => {
      const y = 185 + i * 56;
      const btn = this.add.image(cx, y, TextureKeys.ButtonNormal).setInteractive({ useHandCursor: true });
      this.add.text(cx, y, item.label, { fontFamily: FONT, resolution: 2, fontSize: '24px', fontStyle: 'bold', color: Colors.white }).setOrigin(0.5);
      btn.on('pointerover', () => this.select(i));
      btn.on('pointerdown', () => {
        this.select(i);
        this.activate();
      });
      this.buttons.push(btn);
    });

    const prof = getProfile();
    const summary = '$' + prof.money.toLocaleString('en-US') + '   REP ' + prof.reputation + '   ' + rankFor(prof.reputation).name.toUpperCase();
    this.add.text(12, 12, summary, { fontFamily: FONT, resolution: 2, fontSize: '14px', fontStyle: 'bold', color: Colors.cyan, stroke: '#000000', strokeThickness: 3 });
    const notice = saveManager.lastReport.notice;
    if (notice) {
      const n = this.add.text(cx, VIRTUAL_HEIGHT - 40, notice, { fontFamily: FONT, resolution: 2, fontSize: '13px', fontStyle: 'bold', color: '#ff9a4a', backgroundColor: '#000000cc', padding: { x: 8, y: 4 }, align: 'center' }).setOrigin(0.5, 1);
      this.time.delayedCall(9000, () => n.destroy());
    }
    this.add.text(12, VIRTUAL_HEIGHT - 12, `v${GAME_VERSION}`, { fontFamily: FONT, resolution: 2, fontSize: '14px', color: '#c8c4d8', stroke: '#000000', strokeThickness: 3 }).setOrigin(0, 1);
    this.add.text(cx, VIRTUAL_HEIGHT - 14, 'W/S OR ARROWS + ENTER   |   TAP TO SELECT', { fontFamily: FONT, resolution: 2, fontSize: '14px', color: '#c8c4d8', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5, 1);

    const kb = this.input.keyboard;
    kb?.on('keydown-UP', () => this.select(this.selected - 1));
    kb?.on('keydown-W', () => this.select(this.selected - 1));
    kb?.on('keydown-DOWN', () => this.select(this.selected + 1));
    kb?.on('keydown-S', () => this.select(this.selected + 1));
    kb?.on('keydown-ENTER', () => this.activate());
    kb?.on('keydown-SPACE', () => this.activate());

    this.select(0);
    this.ready = true;
    new MuteButton(this, VIRTUAL_WIDTH - 12, 22, 20, 13, 1);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => (this.ready = false));
  }

  update(): void {
    // Gamepad: D-pad / left stick to move, A to confirm.
    const pad = this.input.gamepad?.getPad(0);
    if (!pad) return;
    const dir = pad.up || pad.leftStick.y < -0.5 ? -1 : pad.down || pad.leftStick.y > 0.5 ? 1 : 0;
    if (dir !== 0 && dir !== this.lastPadDir) this.select(this.selected + dir);
    this.lastPadDir = dir;
    if (pad.A && !this.padAHeld) this.activate();
    this.padAHeld = pad.A;
  }

  private select(index: number): void {
    const next = (index + ITEMS.length) % ITEMS.length;
    if (this.ready && next !== this.selected) audio.sfx('uiMove');
    this.selected = next;
    this.buttons.forEach((b, i) => b.setTexture(i === this.selected ? TextureKeys.ButtonSelected : TextureKeys.ButtonNormal));
  }

  private activate(): void {
    audio.sfx('uiSelect');
    const item = ITEMS[this.selected];
    if (item.scene === SceneKeys.RoadTest) {
      void startDrive(this, getProfile().selectedVehicle, false);
      return;
    }
    if (item.scene) {
      this.scene.start(item.scene);
      return;
    }
    this.scene.start(SceneKeys.Placeholder, { title: item.label, milestone: item.milestone });
  }
}
