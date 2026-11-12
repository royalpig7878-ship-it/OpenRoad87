/** Virtual resolution — all gameplay and UI is authored in this space. */
export const VIRTUAL_WIDTH = 960;
export const VIRTUAL_HEIGHT = 540;

export const GAME_TITLE = "OPEN ROAD '87";
export const GAME_VERSION = '0.1.0';

/** Scene keys, centralised so scenes never hard-code strings. */
export const SceneKeys = {
  Boot: 'BootScene',
  Preload: 'PreloadScene',
  MainMenu: 'MainMenuScene',
  Placeholder: 'PlaceholderScene',
  RoadTest: 'RoadTestScene',
  Garage: 'GarageScene',
  ArcadeMenu: 'ArcadeMenuScene',
  Results: 'ResultsScene',
  Career: 'CareerScene',
  Settings: 'SettingsScene',
} as const;

/** Texture keys for loaded assets. */
export const TextureKeys = {
  TitleBackground: 'menu_title_background',
  ButtonNormal: 'ui_button_normal',
  ButtonSelected: 'ui_button_selected',
} as const;

/** 1980s-inspired palette used for UI text. */
export const Colors = {
  yellow: '#ffd23f',
  orange: '#ff8a1f',
  red: '#e8344a',
  cyan: '#4de1ff',
  white: '#f4f0e6',
  grey: '#8a8798',
  dark: '#14102a',
} as const;

export const FONT = '"Courier New", Courier, monospace';
