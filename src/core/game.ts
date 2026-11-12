import Phaser from 'phaser';
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from './config';
import { BootScene } from '../scenes/BootScene';
import { PreloadScene } from '../scenes/PreloadScene';
import { MainMenuScene } from '../scenes/MainMenuScene';
import { PlaceholderScene } from '../scenes/PlaceholderScene';
import { RoadTestScene } from '../scenes/RoadTestScene';
import { GarageScene } from '../scenes/GarageScene';
import { ArcadeMenuScene } from '../scenes/ArcadeMenuScene';
import { ResultsScene } from '../scenes/ResultsScene';
import { CareerScene } from '../scenes/CareerScene';
import { SettingsScene } from '../scenes/SettingsScene';
import { installSmoothText } from '../UI/smoothText';
import { SharpScaler } from './SharpScaler';
import { getSettings, onSettingsChange } from '../save/Settings';

/**
 * Creates the Phaser game at a fixed 960x540 virtual resolution.
 * Scale.FIT preserves the aspect ratio (letterboxing) on any screen;
 * pixelArt + CSS image-rendering:pixelated give nearest-neighbour scaling.
 */
export function createGame(parent: string): Phaser.Game {
  installSmoothText();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: VIRTUAL_WIDTH,
    height: VIRTUAL_HEIGHT,
    backgroundColor: '#000000',
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    input: { activePointers: 4, gamepad: true },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, PreloadScene, MainMenuScene, PlaceholderScene, RoadTestScene, GarageScene, ArcadeMenuScene, ResultsScene, CareerScene, SettingsScene],
  });
  // Phones: the browser toolbars grow and shrink and rotation reports stale sizes, so size the host to the real
  // visible area ourselves and re-fit a few times after every change (otherwise the picture can be cut off).
  const hostEl = document.getElementById(parent);
  if (hostEl) {
    const fit = () => {
      const vv = window.visualViewport;
      hostEl.style.width = `${Math.floor(vv?.width ?? window.innerWidth)}px`;
      hostEl.style.height = `${Math.floor(vv?.height ?? window.innerHeight)}px`;
      game.scale.refresh();
    };
    const refit = () => { fit(); for (const ms of [100, 300, 800]) window.setTimeout(fit, ms); };
    window.addEventListener('resize', refit);
    window.addEventListener('orientationchange', refit);
    window.visualViewport?.addEventListener('resize', fit);
    refit();
  }
  // Even-pixel scaling at fractional screen scales (the "pixel scaling" setting turns it off).
  const host = document.getElementById(parent);
  if (host && game.canvas) {
    const scaler = new SharpScaler(game, host);
    const apply = () => scaler.setEnabled(getSettings().pixelScaling === 'even');
    apply();
    onSettingsChange(apply);
    if (import.meta.env.DEV) (window as unknown as { __scaler: SharpScaler }).__scaler = scaler;
  }
  // Dev-only handle for browser-based testing.
  if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
  return game;
}
