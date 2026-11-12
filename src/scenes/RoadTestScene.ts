import Phaser from 'phaser';
import { SceneKeys, Colors, FONT } from '../core/config';
import { RoadRenderer } from '../road/RoadRenderer';
import { roadEdges } from '../road/RoadLayout';
import { BackdropBlender } from '../road/BackdropRenderer';
import { SceneryRenderer } from '../road/SceneryRenderer';
import { PoliceManager } from '../police/PoliceManager';
import { PursuitHud } from '../UI/PursuitHud';
import { TouchControls, isTouchDevice } from '../controls/TouchControls';
import { getSettings, updateSettings } from '../save/Settings';
import { QualityManager } from '../systems/QualityManager';
import { ArcadeSession } from '../arcade/ArcadeSession';
import { ChallengeDef, getChallenge } from '../arcade/Challenges';
import { ArcadeHud } from '../UI/ArcadeHud';
import { GATE_ART, GateKind, clearGates, createGateTextures, placeGate } from '../arcade/Gates';
import { recordScore } from '../economy/Profile';
import { JobDef, getJob } from '../career/Jobs';
import { completeJob } from '../career/Career';
import { WeatherRenderer, lerpWeather, weatherForTime } from '../road/WeatherRenderer';
import { DEFAULT_ROAD_CONFIG } from '../road/TestTrack';
import { ENVIRONMENTS, sceneryTexturesOf } from '../road/environments/Environments';
import { Environment, SceneryArt, TimeOfDay } from '../road/environments/EnvironmentTypes';
import { World, applyPalettes, blendAt, buildWorld } from '../road/environments/WorldBuilder';
import { InputManager } from '../controls/InputManager';
import { DrivingModel, REFERENCE_SPEED_KPH } from '../systems/DrivingModel';
import { VEHICLES, getVehicle } from '../vehicles/VehicleRoster';
import { getProfile } from '../economy/currentProfile';
import { effectiveSpec, owns, setDamage } from '../economy/Profile';
import { CockpitView } from '../UI/CockpitView';
import { TrafficManager } from '../traffic/TrafficManager';
import { TrafficRenderer, TrafficArtInfo } from '../traffic/TrafficRenderer';
import { DIFFICULTY, DifficultyName, UNITS_PER_METRE } from '../traffic/TrafficData';
import { audio } from '../audio/AudioManager';
import { saveManager } from '../save/SaveManager';
import { MuteButton } from '../UI/MuteButton';
import { DriveAudio, EngineInit } from '../audio/DriveAudio';
import { buildDriveFrame } from '../audio/driveFrame';
import { kphToMph, mphToKph } from '../systems/units';

// Phaser names digit keys with words.
const DIGIT_KEYS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'];
const DIFFICULTIES: DifficultyName[] = ['easy', 'normal', 'hard', 'extreme'];
/** Time-of-day override cycle; null lets each environment use its own default (the night expressway is at night). */
const TIME_CYCLE: Array<TimeOfDay | null> = [null, 'day', 'sunset', 'night', 'storm'];

interface WorldChoice {
  id: string;
  label: string;
  envs: Environment[];
}
/** Each environment on its own, plus the whole journey chained together to show the transitions. */
const WORLDS: WorldChoice[] = [
  ...ENVIRONMENTS.map((e) => ({ id: e.id, label: e.name, envs: [e] })),
  { id: 'journey', label: 'Journey', envs: ENVIRONMENTS },
];

/**
 * Drive test bed (Milestones 3-7): the road renderer, driving model, cockpit, traffic and environments together.
 * B cycles environments (and the chained journey), T the time of day.
 */
export class RoadTestScene extends Phaser.Scene {
  private cfg = DEFAULT_ROAD_CONFIG;
  private road!: RoadRenderer;
  private world!: World;
  private backdrop!: BackdropBlender;
  private scenery!: SceneryRenderer;
  private weather!: WeatherRenderer;
  private sceneryArt: Record<string, SceneryArt> = {};
  private gfx!: Phaser.GameObjects.Graphics;
  private hudGfx!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private drive!: InputManager;
  private model!: DrivingModel;
  private worldIndex = 0;
  private timeIndex = 0;
  private lastZone = -1;
  private autoThrottle = false;
  private flash = 0;
  private cockpit!: CockpitView;
  private debugHud = false;
  private hint!: Phaser.GameObjects.Text;
  private shake = 0;
  private signal: -1 | 0 | 1 = 0;
  private signalTurned = false;
  private rearDemo = false;
  private rearDist = 600;
  private traffic!: TrafficManager;
  private trafficView!: TrafficRenderer;
  private trafficOn = true;
  private police!: PoliceManager;
  private policeView!: TrafficRenderer;
  private pursuitHud!: PursuitHud;
  private lawOn = true;
  private fromGarage = false;
  /** Arcade state (undefined in free drive / developer mode). */
  private challengeDef?: ChallengeDef;
  private startEnvId?: string;
  private job?: JobDef;
  private arcade?: ArcadeSession;
  private arcadeHud?: ArcadeHud;
  private escapeCount = 0;
  private paused = false;
  private pauseText?: Phaser.GameObjects.Text;
  private finishTimer = 0;
  private touch?: TouchControls;
  private quality = new QualityManager('high', false);
  private pauseButtons: Phaser.GameObjects.Text[] = [];
  private vehicleId = VEHICLES[0].id;
  private driveAudio!: DriveAudio;
  private engineInit!: EngineInit;
  private lastCountInt = -1;
  /** Scenery textures the current road uses (their smoothed close-up versions are built in the background). */
  private worldSceneryKeys: string[] = [];
  private policeLevel = 2;
  private diffIndex = 1;
  private popup!: Phaser.GameObjects.Text;
  private popupTime = 0;
  private zoneBanner!: Phaser.GameObjects.Text;
  private zoneBannerTime = 0;

  constructor() {
    super(SceneKeys.RoadTest);
  }

  init(data?: { fromGarage?: boolean; challengeId?: string; jobId?: string; envId?: string }): void {
    this.fromGarage = !!data?.fromGarage;
    this.job = data?.jobId ? getJob(data.jobId) : undefined;
    this.challengeDef = this.job ? this.job.challenge : data?.challengeId ? getChallenge(data.challengeId) : undefined;
    this.startEnvId = data?.envId ?? this.challengeDef?.env;
  }

  /** The car as the player has it: upgrades applied, and the damage it has carried over from earlier drives. */
  private playerCar(id: string): { spec: ReturnType<typeof effectiveSpec>; damage: number } {
    const p = getProfile();
    return { spec: effectiveSpec(p, id), damage: owns(p, id) ? p.vehicles[id].damage : 0 };
  }

  create(): void {
    this.vehicleId = getProfile().selectedVehicle;
    this.worldIndex = Math.max(0, WORLDS.findIndex((w) => w.id === this.startEnvId));
    this.arcade = undefined;
    this.escapeCount = 0;
    this.paused = false;
    this.finishTimer = 0;
    this.timeIndex = 0;
    this.diffIndex = 1;
    this.trafficOn = true;
    this.autoThrottle = false;
    this.flash = 0;
    this.lastZone = -1;
    this.lawOn = true;
    this.policeLevel = 2;

    // Scenery scale metadata (only entries with a real-world scale are objects).
    const meta = this.cache.json.get('scenery_meta') as { assets: Record<string, { w: number; h: number; pxPerMetre: number | null }> };
    this.sceneryArt = {};
    for (const [key, a] of Object.entries(meta.assets)) if (a.pxPerMetre) this.sceneryArt[key] = { w: a.w, h: a.h, pxPerMetre: a.pxPerMetre };
    Object.assign(this.sceneryArt, GATE_ART);
    createGateTextures(this);

    this.backdrop = new BackdropBlender(this, this.cfg.horizonY);
    this.gfx = this.add.graphics().setDepth(1);
    this.weather = new WeatherRenderer(this, this.cfg.horizonY);
    this.pursuitHud = new PursuitHud(this);
    const car = this.playerCar(this.vehicleId);
    this.model = new DrivingModel(car.spec, roadEdges(this.cfg.lanes), 1, undefined, car.damage);
    audio.attach();
    this.engineInit = this.makeEngineInit(car.spec, this.vehicleId);
    this.driveAudio = new DriveAudio(this.engineInit);
    this.lastCountInt = -1;
    audio.playMusic(null);
    audio.duckMusic(0.5);

    this.popup = this.add.text(480, 80, '', { fontFamily: FONT, resolution: 2, fontSize: '28px', fontStyle: 'bold', color: Colors.yellow, stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5).setDepth(30).setVisible(false);
    this.zoneBanner = this.add.text(480, 130, '', { fontFamily: FONT, resolution: 2, fontSize: '22px', fontStyle: 'bold', color: Colors.white, stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5).setDepth(30).setVisible(false);
    this.popupTime = 0;
    this.cockpit = new CockpitView(this, getVehicle(this.vehicleId));
    this.hudGfx = this.add.graphics().setDepth(39);
    this.hud = this.add.text(8, 6, '', { fontFamily: FONT, resolution: 2, fontSize: '14px', color: Colors.white, backgroundColor: '#000000aa', lineSpacing: 2 }).setDepth(40);
    this.hint = this.add
      .text(8, 520, 'W/UP gas  S/DOWN brake  A/D steer  SHIFT/Z gears  M auto/manual  1-6 car  R repair  Q/E signals  K traffic level  N traffic  L police  Y police level  F force pursuit  B environment  T time  P rear car  H debug  SPACE cruise  ESC menu', {
        fontFamily: FONT, resolution: 2, fontSize: '11px', color: Colors.grey, backgroundColor: '#000000aa',
      })
      .setDepth(40);
    this.hud.setVisible(false);

    this.loadWorld(this.worldIndex);

    this.drive = new InputManager();
    // Touch controls: shown automatically on touch devices (or always/never by setting); multitouch.
    const settings = getSettings();
    const onTouchDevice = isTouchDevice();
    this.touch = new TouchControls(this, settings.steerMode, settings.touchOpacity, (m) => updateSettings({ steerMode: m }));
    this.drive.addSource(this.touch);
    this.touch.setVisible(settings.touchControls === 'on' || (settings.touchControls === 'auto' && onTouchDevice));
    // A first real touch on a device that did not look touch-capable also reveals the controls.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.wasTouch && this.touch && !this.touch.isVisible && getSettings().touchControls !== 'off') this.touch.setVisible(true);
    });
    // Adaptive quality: phones start one step down and adapt from there.
    this.quality = new QualityManager(settings.quality === 'auto' ? (onTouchDevice ? 'medium' : 'high') : settings.quality, settings.quality === 'auto');
    this.applyQuality();
    const kb = this.input.keyboard!;
    kb.on('keydown-T', () => this.cycleTime());
    kb.on('keydown-B', () => this.loadWorld((this.worldIndex + 1) % WORLDS.length));
    kb.on('keydown-M', () => this.model.transmission.toggleMode());
    kb.on('keydown-R', () => {
      this.model.refuel();
      this.model.state.damage = 0;
    });
    kb.on('keydown-Q', () => this.toggleSignal(-1));
    kb.on('keydown-E', () => this.toggleSignal(1));
    kb.on('keydown-K', () => {
      this.diffIndex = (this.diffIndex + 1) % DIFFICULTIES.length;
      this.traffic.setDifficulty(DIFFICULTY[DIFFICULTIES[this.diffIndex]]);
      this.showPopup(`TRAFFIC: ${DIFFICULTIES[this.diffIndex].toUpperCase()}`, Colors.cyan);
    });
    kb.on('keydown-N', () => {
      this.trafficOn = !this.trafficOn;
      this.traffic.reset();
      this.showPopup(this.trafficOn ? 'TRAFFIC ON' : 'TRAFFIC OFF', Colors.cyan);
    });
    kb.on('keydown-L', () => {
      this.lawOn = !this.lawOn;
      this.police.enabled = this.lawOn;
      this.showPopup(this.lawOn ? 'POLICE ON' : 'POLICE OFF', Colors.cyan);
    });
    kb.on('keydown-Y', () => {
      this.policeLevel = this.police.cycleLevel();
      this.showPopup(`POLICE: ${this.police.level.name.toUpperCase()}`, Colors.cyan);
    });
    kb.on('keydown-F', () => {
      const st = this.model.state;
      this.police.enabled = this.lawOn = true;
      this.police.reset();
      this.police.startPursuit({ position: st.position, playerX: st.playerX, speedKph: st.speedKph });
      this.showPopup('POLICE PURSUIT!', '#ff5a4a');
    });
    kb.on('keydown-P', () => (this.rearDemo = !this.rearDemo));
    kb.on('keydown-H', () => (this.debugHud = !this.debugHud));
    kb.on('keydown-SPACE', () => (this.autoThrottle = !this.autoThrottle));
    for (let i = 0; i < VEHICLES.length; i++) kb.on(`keydown-${DIGIT_KEYS[i]}`, () => {
        // Developer shortcut: try any car (owned cars keep their upgrades and damage).
        this.vehicleId = VEHICLES[i].id;
        const c = this.playerCar(VEHICLES[i].id);
        this.model.setVehicle(c.spec, c.damage);
        this.engineInit = this.makeEngineInit(c.spec, VEHICLES[i].id);
        this.driveAudio.setEngine(this.engineInit);
        void this.cockpit.setVehicle(VEHICLES[i]);
      });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.drive.destroy();
      this.driveAudio.destroy();
      this.trafficView.destroy();
      this.scenery.destroy();
      this.backdrop.destroy();
      this.weather.destroy();
      this.policeView.destroy();
      this.pursuitHud.destroy();
      this.arcadeHud?.destroy();
      this.touch?.destroy();
    });
    if (this.challengeDef) this.setupArcade(this.challengeDef);
  }

  /** Turns the drive scene into an arcade run: rules, HUD, gates, fixed traffic/police, no developer shortcuts. */
  private setupArcade(def: ChallengeDef): void {
    this.arcade = new ArcadeSession(def);
    this.arcadeHud = new ArcadeHud(this);
    this.diffIndex = Math.max(0, DIFFICULTIES.indexOf(def.trafficLevel));
    this.traffic.setDifficulty(DIFFICULTY[def.trafficLevel]);
    this.trafficOn = true;
    this.lawOn = !!def.police;
    this.police.enabled = this.lawOn;
    if (def.police) this.police.setLevel(def.police.level);
    this.timeIndex = 0;
    this.popup.setY(196);
    this.hint.setVisible(false);
    this.debugHud = false;
    this.pauseText = this.add.text(480, 200, 'PAUSED\n\nESC OR TAP: RESUME\nQ OR TAP: QUIT', { fontFamily: FONT, resolution: 2, fontSize: '28px', fontStyle: 'bold', color: Colors.white, align: 'center', backgroundColor: '#000000cc', padding: { x: 24, y: 16 }, stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5).setDepth(60).setVisible(false);
    // Tap targets for the pause menu (for touch screens).
    const tap = (y: number, label: string, fn: () => void) => {
      const t = this.add.text(480, y, label, { fontFamily: FONT, resolution: 2, fontSize: '26px', fontStyle: 'bold', color: '#ffd23f', backgroundColor: '#2a2550', padding: { x: 28, y: 10 }, stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(61).setVisible(false).setInteractive({ useHandCursor: true });
      t.on('pointerdown', fn);
      this.pauseButtons.push(t);
    };
    tap(318, 'RESUME', () => this.paused && this.togglePause());
    tap(372, 'QUIT', () => this.paused && this.leave());
    const mute = new MuteButton(this, 480, 438, 61, 20);
    mute.text.setVisible(false);
    this.pauseButtons.push(mute.text);
    // Developer shortcuts are off in arcade runs.
    const kb = this.input.keyboard!;
    for (const k of ['T', 'B', 'K', 'N', 'L', 'Y', 'F', 'P', 'R', 'SPACE', ...DIGIT_KEYS]) kb.removeAllListeners(`keydown-${k}`);
    this.placeNextGate();
    audio.playMusic('arcade');
  }

  /** What the engine sound needs to know about the current car. */
  private makeEngineInit(spec: { topSpeedKph: number; idleRpm: number; redlineRpm: number }, vehicleId: string): EngineInit {
    return { engineSound: getVehicle(vehicleId).engineSound, idleRpm: spec.idleRpm, redlineRpm: spec.redlineRpm, topSpeedKph: spec.topSpeedKph };
  }

  private placeNextGate(): void {
    const a = this.arcade;
    if (!a || a.nextGateM === null) return;
    const kind: GateKind = a.def.kind === 'time_trial' ? 'gate_finish' : 'gate_checkpoint';
    placeGate(this.world.segments, 0, this.cfg.segmentLength, a.nextGateM, kind);
  }

  private togglePause(): void {
    this.paused = !this.paused;
    this.driveAudio.setPaused(this.paused);
    this.pauseText?.setVisible(this.paused);
    this.pauseButtons.forEach((b) => b.setVisible(this.paused));
  }

  /** Runs the arcade rules for this frame and reacts to what happened. */
  private stepArcade(dt: number, s: { speedKph: number; damage: number; fuel: number; position: number; playerX: number }): void {
    const a = this.arcade!;
    const ev = a.update(dt, {
      speedKph: s.speedKph, damage: s.damage, fuel: s.fuel,
      nearMisses: this.traffic.stats.nearMisses, trafficHits: this.traffic.stats.hits,
      escapes: this.escapeCount, busted: this.police.state === 'busted',
    });
    if (a.phase === 'countdown') {
      const ci = Math.ceil(a.countdown);
      if (ci !== this.lastCountInt && ci >= 1) this.driveAudio.sfx('countBeep');
      this.lastCountInt = ci;
    }
    if (ev.go) {
      this.driveAudio.sfx('go');
      this.showPopup('GO!', '#60ff90');
      if (a.def.police?.startPursuit) {
        this.police.enabled = true;
        this.police.startPursuit({ position: s.position, playerX: s.playerX, speedKph: Math.max(s.speedKph, 120) });
      }
    }
    if (ev.checkpoint) {
      this.driveAudio.sfx('checkpoint');
      this.showPopup(`CHECKPOINT  +${a.def.checkpoint!.bonusS} S`, Colors.yellow);
      this.placeNextGate();
    }
    if (ev.warning && !ev.finished) this.showPopup(a.def.speed ? 'SPEED UP!' : 'HURRY!', '#ff9a4a');
    if (ev.finished && a.result) {
      this.driveAudio.sfx(a.result.success ? 'fanfare' : 'uiError');
      clearGates(this.world.segments);
      const r = a.result;
      this.showPopup(r.outcome === 'complete' || r.outcome === 'escaped' ? 'FINISH!' : r.outcome === 'time_up' ? 'TIME UP!' : r.outcome.replace('_', ' ').toUpperCase() + '!', r.success ? '#60ff90' : '#ff5a4a');
      this.finishTimer = 2;
    }
  }

  private finishArcade(): void {
    const a = this.arcade!;
    const r = a.result!;
    const profile = getProfile();
    setDamage(profile, this.vehicleId, this.model.state.damage);
    saveManager.requestSave();
    if (this.job) {
      // Career: pay out (or fine) and record progress; jobs have no arcade high-score table.
      const career = completeJob(profile, this.job, r);
      this.scene.start(SceneKeys.Results, { result: r, envId: this.startEnvId ?? a.def.env, rank: null, newBest: false, jobId: this.job.id, career });
      return;
    }
    const rank = recordScore(profile, a.def.id, r.score, this.vehicleId);
    this.scene.start(SceneKeys.Results, { result: r, envId: this.startEnvId ?? a.def.env, rank: rank.rank, newBest: rank.newBest });
  }

  /** Time of day used for an environment: the player's override, or the environment's own default. */
  private timeFor = (env: Environment): TimeOfDay => TIME_CYCLE[this.timeIndex] ?? env.defaultTime;

  private timeLabel(): string {
    return TIME_CYCLE[this.timeIndex] ?? 'auto';
  }

  /** (Re)builds the road, scenery, traffic and renderers for a world choice and puts the player at the start. */
  private loadWorld(index: number): void {
    this.worldIndex = index;
    const choice = WORLDS[index];
    this.trafficView?.destroy();
    this.policeView?.destroy();
    this.scenery?.destroy();

    this.world = buildWorld(this.cfg, choice.envs, this.sceneryArt);
    applyPalettes(this.world, this.timeFor);
    this.road = new RoadRenderer(this.gfx, this.world.segments, this.cfg, choice.envs[0].palette);
    this.model.setTrackLength(this.world.trackLength);
    this.model.state.speedKph = 0;

    this.traffic = new TrafficManager({
      trackLength: this.world.trackLength,
      lanes: this.cfg.lanes,
      segmentLength: this.cfg.segmentLength,
      drawDistance: this.cfg.drawDistance,
      difficulty: DIFFICULTY[DIFFICULTIES[this.diffIndex]],
    });
    this.trafficView = new TrafficRenderer(this, this.road, this.cfg, this.cache.json.get('traffic_meta') as Record<string, TrafficArtInfo>, this.traffic.cars.length);
    this.police = new PoliceManager({
      trackLength: this.world.trackLength,
      lanes: this.cfg.lanes,
      segmentLength: this.cfg.segmentLength,
      drawDistance: this.cfg.drawDistance,
      level: this.policeLevel,
      obstacles: () => this.traffic.cars,
    });
    this.police.enabled = this.lawOn;
    this.traffic.extras = this.police.units;
    this.policeView = new TrafficRenderer(this, this.road, this.cfg, this.cache.json.get('traffic_meta') as Record<string, TrafficArtInfo>, this.police.units.length);
    this.scenery = new SceneryRenderer(this, this.road, this.cfg, this.sceneryArt);
    this.worldSceneryKeys = sceneryTexturesOf(choice.envs);
    this.lastZone = -1;
    this.showPopup(choice.label.toUpperCase(), Colors.cyan);
    this.applyQuality();
  }

  /** Applies the current graphics quality: draw distance, scenery budget and weather detail. */
  private applyQuality(): void {
    const q = this.quality.profile;
    this.road?.setDrawDistance(q.drawDistance);
    if (this.road) this.road.lod = q.roadLod;
    if (this.scenery) {
      this.scenery.poolLimit = q.sceneryPool;
      this.scenery.hd = q.hdScenery;
      if (q.hdScenery) this.scenery.prepareHd(this.worldSceneryKeys);
    }
    if (this.weather) this.weather.lite = !q.fullWeather;
  }

  /** Leaves the drive: the car's damage is kept, so crashes cost money at the garage. */
  private leave(): void {
    setDamage(getProfile(), this.vehicleId, this.model.state.damage);
    saveManager.requestSave();
    this.scene.start(this.job ? SceneKeys.Career : this.arcade ? SceneKeys.ArcadeMenu : this.fromGarage ? SceneKeys.Garage : SceneKeys.MainMenu);
  }

  private showPopup(text: string, color: string): void {
    this.popup.setText(text).setColor(color).setVisible(true);
    this.popupTime = 1.2;
  }

  private toggleSignal(dir: -1 | 1): void {
    if (this.paused) {
      this.leave();
      return;
    }
    this.signal = this.signal === dir ? 0 : dir;
    this.signalTurned = false;
  }

  /** Real indicators self-cancel once the wheel has turned that way and then straightened. */
  private updateSignal(steerAngle: number): void {
    if (this.signal === 0) return;
    if (steerAngle * this.signal > 0.35) this.signalTurned = true;
    else if (this.signalTurned && Math.abs(steerAngle) < 0.1) this.signal = 0;
  }

  private cycleTime(): void {
    this.timeIndex = (this.timeIndex + 1) % TIME_CYCLE.length;
    applyPalettes(this.world, this.timeFor);
    this.showPopup(`TIME: ${this.timeLabel().toUpperCase()}`, Colors.cyan);
  }

  update(_t: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.05);
    this.touch?.update(dt, this.model.transmission.mode === 'manual');
    if (this.quality.update(dt, this.game.loop.actualFps)) this.applyQuality();
    const input = this.drive.poll();
    if (this.autoThrottle) input.throttle = 1;
    if (input.toggleTransmission) this.model.transmission.toggleMode();
    if (input.pause) {
      if (this.arcade) this.togglePause();
      else {
        this.leave();
        return;
      }
    }
    if (this.paused) return;
    if (this.finishTimer > 0) {
      this.finishTimer -= dt;
      if (this.finishTimer <= 0) {
        this.finishArcade();
        return;
      }
    }
    // Arcade: hold the car on the grid during the countdown and brake to a stop after the run ends.
    if (this.arcade && (this.arcade.inputLocked || this.arcade.phase === 'finished')) {
      input.throttle = 0;
      input.brake = 1;
      input.steer = 0;
    }

    // Pulled over: when busted the car brakes to a stop.
    if (this.police.state === 'busted') {
      input.throttle = 0;
      input.brake = 1;
      input.steer = 0;
    }
    const seg = this.road.findSegment(this.model.state.position);
    const s = this.model.update(dt, input, { curve: seg.curve, barrier: seg.barrier, barrierSide: seg.barrierSide });
    if (s.events.includes('barrier_hit')) this.flash = 0.25;
    if (s.events.includes('shift')) this.driveAudio.shift();
    if (s.events.includes('barrier_hit')) this.driveAudio.sfx('scrape', { level: Math.min(1, 0.4 + s.speedKph / 200) });
    if (s.events.includes('out_of_fuel')) this.driveAudio.sfx('sputter');
    this.flash = Math.max(0, this.flash - dt);
    if (s.events.includes('barrier_hit')) this.shake = 6;
    this.shake = Math.max(0, this.shake - dt * 14);

    // Traffic: simulate, resolve collisions and near misses.
    const player = { position: s.position, playerX: s.playerX, speedKph: s.speedKph };
    let trafficHitsNow = 0;
    let nearMissesNow = 0;
    if (this.trafficOn) {
      const ev = this.traffic.update(dt, player);
      trafficHitsNow = ev.hits.length;
      nearMissesNow = ev.nearMisses.length;
      for (const hit of ev.hits) {
        this.model.applyTrafficHit(hit);
        this.flash = 0.3;
        this.shake = 7;
        this.showPopup('CRASH!', '#ff5a4a');
        this.driveAudio.sfx('crash', { level: hit.impactKph / 90, pan: hit.side * 0.7 });
      }
      for (const nm of ev.nearMisses) this.driveAudio.sfx('nearMiss', { pan: Phaser.Math.Clamp((nm.car.x - s.playerX) * 0.9, -1, 1), speedKph: nm.relSpeedKph });
      if (ev.nearMisses.length === 0 && s.speedKph > 60) {
        for (const car of ev.passes) this.driveAudio.sfx('passBy', { pan: Phaser.Math.Clamp((car.x - s.playerX) * 0.9, -1, 1), speedKph: s.speedKph });
      }
      if (ev.hits.length === 0 && ev.nearMisses.length > 0) this.showPopup(`NEAR MISS  ${this.traffic.stats.nearMisses}`, Colors.yellow);
    }
    // Police: speeding and reckless driving build heat; patrols and pursuits run here.
    const here0 = blendAt(this.world, seg.index);
    this.police.setSpeedLimit(mphToKph(this.world.zones[here0.zone].env.speedLimitMph));
    const pev = this.police.update(dt, player, { trafficHits: trafficHitsNow, barrierHits: s.events.includes('barrier_hit') ? 1 : 0, nearMisses: nearMissesNow });
    for (const hit of pev.hits) {
      this.model.applyTrafficHit(hit);
      this.flash = 0.3;
      this.shake = 7;
      this.showPopup('CRASH!', '#ff5a4a');
      this.driveAudio.sfx('crash', { level: hit.impactKph / 90, pan: hit.side * 0.7 });
    }
    if (pev.started) this.showPopup('POLICE PURSUIT!', '#ff5a4a');
    if (pev.reinforcement) this.showPopup('REINFORCEMENTS!', '#ff9a4a');
    if (pev.busted) {
      this.showPopup('BUSTED!', '#ff5a4a');
      this.driveAudio.sfx('busted');
    }
    if (pev.escaped) {
      this.escapeCount++;
      this.driveAudio.sfx('escaped');
      this.showPopup('ESCAPED!', '#60ff90');
    }
    this.popupTime = Math.max(0, this.popupTime - dt);
    if (this.popupTime === 0) this.popup.setVisible(false);

    if (this.arcade) this.stepArcade(dt, s);

    // Where are we in the world? Near a zone boundary two environments blend.
    const here = blendAt(this.world, seg.index);
    const envHere = this.world.zones[here.zone].env;
    const envNext = this.world.zones[here.neighbour].env;
    const timeHere = this.timeFor(envHere);
    if (here.zone !== this.lastZone) {
      if (this.lastZone >= 0) {
        this.zoneBanner.setText(envHere.name.toUpperCase()).setVisible(true);
        this.zoneBannerTime = 2.5;
      }
      this.lastZone = here.zone;
    }
    this.zoneBannerTime = Math.max(0, this.zoneBannerTime - dt);
    if (this.zoneBannerTime === 0) this.zoneBanner.setVisible(false);

    // Road-surface rumble and impact kick move only the outside world; the cockpit stays put.
    const rumble = s.speedKph < 20 ? 0 : s.surface === 'grass' ? 2 : s.surface === 'shoulder' ? 1 : 0;
    const kick = Math.round(Math.max(rumble, this.shake));
    const jolt = kick === 0 ? 0 : (this.game.getFrame() % 2 === 0 ? kick : -kick);
    this.gfx.setY(jolt);
    this.backdrop.update({ env: envHere, time: timeHere }, { env: envNext, time: this.timeFor(envNext) }, here.t, seg.curve * Math.min(1, s.speedKph / REFERENCE_SPEED_KPH) * dt, jolt, this.road.yawPixels(s.heading));

    // Weather follows the time of day (storms), blended across zone boundaries; it thickens the road fog too.
    const wTarget = lerpWeather(weatherForTime(timeHere), weatherForTime(this.timeFor(envNext)), here.t);
    this.weather.update(dt, wTarget, timeHere === 'night' ? 0.55 : 1);
    this.road.setFogScale(1 + 1.6 * this.weather.level.fog);
    if (this.arcade) audio.playMusic(this.police.state === 'pursuit' ? 'pursuit' : 'arcade');
    this.driveAudio.update(dt, buildDriveFrame({
      speedKph: s.speedKph, position: s.position, playerX: s.playerX, rpm: s.rpm, throttle: s.throttle, brake: s.brake,
      skidding: s.skidding, surface: s.surface, shifting: s.shifting, damage: s.damage, fuel: s.fuel,
      topSpeedKph: this.engineInit.topSpeedKph, idleRpm: this.engineInit.idleRpm, redlineRpm: this.engineInit.redlineRpm,
      trackLength: this.road.trackLength, unitsPerMetre: UNITS_PER_METRE, rain: this.weather.level.rain,
      traffic: this.trafficOn ? this.traffic.cars : [], police: this.police.units,
    }));
    this.road.render({ position: s.position, playerX: s.playerX, heading: s.heading });
    this.scenery.setTimeOfDay(envHere.fixedLook ? 'day' : timeHere);
    this.scenery.update(jolt);
    this.trafficView.setTimeOfDay(envHere.fixedLook ? 'day' : timeHere);
    this.trafficView.update(this.trafficOn ? this.traffic.cars : [], s.position, this.road.trackLength, jolt);
    this.policeView.setTimeOfDay(envHere.fixedLook ? 'day' : timeHere);
    this.policeView.update(this.police.units, s.position, this.road.trackLength, jolt);
    let nearestBehind = 1e9;
    for (const c of this.police.rearView(player, 1e9)) if (c.distance < nearestBehind) nearestBehind = c.distance;
    this.pursuitHud.update(dt, this.police, s.speedKph, nearestBehind);
    if (this.arcade) this.arcadeHud?.update(this.arcade, s.speedKph);
    // Demo car in the mirror (toggle P): a police car trailing the player, closing and falling back.
    this.rearDist += (this.rearDemo ? Math.sin(this.time.now / 1500) * 80 * dt * 10 : 0);
    this.rearDist = Phaser.Math.Clamp(this.rearDist, 150, 1800);
    const behind = this.road.findSegment(Math.max(0, s.position - 6 * this.cfg.segmentLength));
    this.updateSignal(s.steerAngle);
    this.cockpit.update(s, dt, {
      signal: this.signal,
      headlights: timeHere === 'night' || timeHere === 'storm',
      manual: this.model.transmission.mode === 'manual',
      palette: seg.palette ?? envHere.palette,
      timeOfDay: timeHere,
      position: s.position,
      curveBehind: behind.curve,
      side: this.trafficOn ? { left: this.traffic.carBeside(player, -1), right: this.traffic.carBeside(player, 1) } : { left: false, right: false },
      rearCars: [
        ...(this.trafficOn ? this.traffic.rearCars(player) : []),
        ...this.police.rearView(player),
        ...(this.rearDemo ? [{ distance: this.rearDist, x: 0.1, color: 0x2a3a8a, lights: true }] : []),
      ],
    });
    this.drawHud();
  }

  private drawHud(): void {
    this.hud.setVisible(this.debugHud);
    this.hint.setVisible(this.debugHud);
    if (!this.debugHud) {
      this.hudGfx.clear();
      if (this.flash > 0) this.hudGfx.fillStyle(0xff3030, this.flash * 2).fillRect(0, 0, 960, 540);
      return;
    }
    const s = this.model.state;
    const v = this.model.vehicle;
    const tr = this.model.transmission;
    this.hud.setText([
      `${v.name.toUpperCase()}   ${tr.mode.toUpperCase()}`,
      `${Math.round(kphToMph(s.speedKph))} MPH   GEAR ${s.gear}${s.shifting ? ' *' : ''}   ${Math.round(s.rpm)} RPM`,
      `FUEL ${s.fuel.toFixed(1)}/${v.fuelCapacity} L   DAMAGE ${Math.round(s.damage)}%`,
      `${s.surface.toUpperCase()}${s.skidding ? '  SKID' : ''}   FPS ${Math.round(this.game.loop.actualFps)}   ${this.timeLabel()}`,
      `WORLD ${WORLDS[this.worldIndex].label}  SCENERY ${this.scenery.drawn}`,
      `TRAFFIC ${this.trafficOn ? DIFFICULTIES[this.diffIndex] : 'off'}  CARS ${this.traffic.activeCount}  PASSED ${this.traffic.stats.passed}  NEAR ${this.traffic.stats.nearMisses}  HITS ${this.traffic.stats.hits}`,
    ]);

    // RPM bar with redline zone, and a fuel bar.
    const g = this.hudGfx;
    g.clear();
    const x = 8, y = 86, w = 220, h = 10;
    const frac = Phaser.Math.Clamp((s.rpm - v.idleRpm) / (v.redlineRpm - v.idleRpm), 0, 1);
    g.fillStyle(0x000000, 0.7).fillRect(x - 2, y - 2, w + 4, h + 4);
    g.fillStyle(frac > 0.88 ? 0xe8344a : 0xffd23f, 1).fillRect(x, y, w * frac, h);
    g.fillStyle(0xe8344a, 0.5).fillRect(x + w * 0.88, y, w * 0.12, h);
    g.fillStyle(0x000000, 0.7).fillRect(x - 2, y + 14, w + 4, 8);
    g.fillStyle(0x4de1ff, 1).fillRect(x, y + 16, w * (s.fuel / v.fuelCapacity), 4);
    if (this.flash > 0) g.fillStyle(0xff3030, this.flash * 2).fillRect(0, 0, 960, 540);
  }
}
