import Phaser from 'phaser';

/**
 * Makes every Text object legible at small sizes. The game is pixel art, so Phaser samples all textures with
 * nearest-neighbour filtering, which makes small anti-aliased text break up (an H looks like "II", thin stems vanish).
 * Text is not pixel art, so text textures use smooth (linear) filtering instead. Together with `resolution: 2` in the text
 * styles (text is drawn at double size and scaled down), letters stay crisp and readable.
 *
 * Call once before the game is created.
 */
export function installSmoothText(): void {
  const TextProto = Phaser.GameObjects.Text.prototype as unknown as { updateText: (...a: unknown[]) => unknown; __smooth?: boolean };
  if (TextProto.__smooth) return;
  TextProto.__smooth = true;
  const original = TextProto.updateText;
  // Phaser redraws a Text's canvas whenever its text or style changes; re-apply the filter after each redraw.
  TextProto.updateText = function (this: Phaser.GameObjects.Text, ...args: unknown[]) {
    const result = original.apply(this, args);
    this.texture?.setFilter(Phaser.Textures.FilterMode.LINEAR);
    return result;
  };
}
