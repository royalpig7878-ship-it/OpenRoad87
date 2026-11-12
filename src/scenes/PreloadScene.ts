import Phaser from 'phaser';
import { ensureCockpitAssets, loadSharedCockpitAssets } from '../UI/CockpitView';
import { VEHICLES } from '../vehicles/VehicleRoster';
import { TRAFFIC_TYPES } from '../traffic/TrafficData';
import { POLICE_TEXTURES } from '../police/PoliceData';
import { allSceneryTextures } from '../road/environments/Environments';
import { sceneryTexturePath } from '../road/SceneryRenderer';
import { SceneKeys, TextureKeys, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, Colors, FONT } from '../core/config';

/** Loads menu assets with a simple progress bar. */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Preload);
  }

  preload(): void {
    const cx = VIRTUAL_WIDTH / 2;
    const cy = VIRTUAL_HEIGHT / 2;
    this.add.text(cx, cy - 30, 'LOADING', { fontFamily: FONT, resolution: 2, fontSize: '24px', color: Colors.yellow }).setOrigin(0.5);
    this.add.rectangle(cx, cy + 10, 304, 20, 0x000000).setStrokeStyle(2, 0xffffff);
    const bar = this.add.rectangle(cx - 150, cy + 10, 0, 12, 0xffd23f).setOrigin(0, 0.5);
    this.load.on('progress', (p: number) => (bar.width = 300 * p));

    this.load.image(TextureKeys.TitleBackground, 'assets/menus/menu_title_background.png');
    this.load.image(TextureKeys.ButtonNormal, 'assets/UI/ui_button_normal.png');
    this.load.image(TextureKeys.ButtonSelected, 'assets/UI/ui_button_selected.png');
    // Shared cockpit pieces; each car's own cockpit art loads on demand (see ensureCockpitAssets).
    loadSharedCockpitAssets(this.load);

    // Traffic art (rear views; fronts are for oncoming traffic later) and its scale metadata.
    this.load.json('traffic_meta', 'assets/traffic/traffic.json');
    for (const t of TRAFFIC_TYPES) {
      this.load.image(t.texture, `assets/traffic/${t.texture}.png`);
      const front = t.texture.replace('_back', '_front'); // shown in the rear-view mirror
      this.load.image(front, `assets/traffic/${front}.png`);
    }
    this.load.image('police_cruiser_front', 'assets/police/police_cruiser_front.png');

    // Arcade: backdrops and the medal icon.
    this.load.image('career_bg', 'assets/menus/menu_career_background.png');
    this.load.image('arcade_bg', 'assets/menus/menu_arcade_background.png');
    this.load.image('results_bg', 'assets/menus/menu_results.png');
    this.load.image('career_medal', 'assets/menus/career_medal.png');

    // Garage: backdrops, car artwork and upgrade icons.
    this.load.image('garage_showroom_bg', 'assets/menus/menu_vehicle_select.png');
    this.load.image('garage_workshop_bg', 'assets/menus/menu_garage_background.png');
    for (const v of VEHICLES) this.load.image(v.artwork, `assets/vehicles/${v.artwork}.png`);
    for (const icon of ['ui_coin', 'ui_engine', 'ui_transmission', 'ui_tire', 'ui_brake', 'ui_damage', 'ui_fuel', 'ui_speed', 'ui_repair', 'ui_button_disabled']) this.load.image(icon, `assets/UI/${icon}.png`);

    // Police cruiser sprites (light bar off / red / blue / both) and the pursuit icon.
    for (const key of POLICE_TEXTURES) this.load.image(key, `assets/police/${key}.png`);
    this.load.image('ui_police_alert', 'assets/UI/ui_police_alert.png');

    // Touch controls: the virtual wheel art (5 frames, -30..+30 degrees).
    this.load.spritesheet('anim_steering_wheel', 'assets/cockpits/anim_steering_wheel.png', { frameWidth: 256, frameHeight: 256 });

    // Weather effects (rain/splash sheets are 8 frames of 960x540, lightning 4 frames of 256x300).
    this.load.spritesheet('fx_rain_overlay', 'assets/effects/fx_rain_overlay.png', { frameWidth: 960, frameHeight: 540 });
    this.load.spritesheet('fx_rain_splashes', 'assets/effects/fx_rain_splashes.png', { frameWidth: 960, frameHeight: 540 });
    this.load.image('fx_fog_overlay', 'assets/effects/fx_fog_overlay.png');
    this.load.spritesheet('fx_lightning', 'assets/effects/fx_lightning.png', { frameWidth: 256, frameHeight: 300 });

    // Environment scenery: scale metadata plus every texture the environments can place.
    this.load.json('scenery_meta', 'assets/scenery/scenery.json');
    for (const key of allSceneryTextures()) this.load.image(key, sceneryTexturePath(key));
    this.load.image('desert_mesa', 'assets/scenery/desert_mesa.png');
    for (const key of ['synth_layer_sky', 'synth_wire_peaks', 'synth_skyline']) this.load.image(key, `assets/scenery/${key}.png`);

    // Sky layers for the road renderer (all times of day).
    for (const t of ['day', 'sunset', 'night', 'storm']) {
      for (const l of ['sky', 'far', 'near']) this.load.image(`sky_${t}_layer_${l}`, `assets/scenery/sky_${t}_layer_${l}.png`);
    }
    this.load.on('loaderror', (f: Phaser.Loader.File) => console.error('Failed to load asset:', f.src));
  }

  create(): void {
    // Preload the default car's cockpit so the first drive starts instantly.
    ensureCockpitAssets(this, VEHICLES[0]).then(() => this.scene.start(SceneKeys.MainMenu));
  }
}
