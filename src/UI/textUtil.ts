import Phaser from 'phaser';

/**
 * Updates a Text object only when something actually changed. Phaser re-draws the text onto a canvas and uploads
 * it to the GPU every time `setText` (with a new string), `setColor` or `setFontSize` is called, and `setColor` /
 * `setFontSize` do so even if the value is the same, so calling them every frame is expensive.
 */
export function setTextCached(t: Phaser.GameObjects.Text, text: string, color?: string, fontSize?: number): void {
  if (t.text !== text) t.setText(text);
  if (color !== undefined && t.style.color !== color) t.setColor(color);
  if (fontSize !== undefined && t.style.fontSize !== `${fontSize}px`) t.setFontSize(fontSize);
}
