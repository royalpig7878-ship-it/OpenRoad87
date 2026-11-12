import Phaser from 'phaser';
import { SceneKeys } from '../core/config';

/** Minimal first scene; hands off to preloading. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Boot);
  }

  create(): void {
    this.scene.start(SceneKeys.Preload);
  }
}
