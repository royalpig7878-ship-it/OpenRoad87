import { ChallengeDef, Medal } from './Challenges';

/** World units per metre driven (the road renderer moves 45 units per km/h per second = 162 per metre). */
export const UNITS_PER_METRE_DRIVEN = 162;
export const COUNTDOWN_SECONDS = 3;

/** What the drive scene reports to the session each frame (cumulative counters). */
export interface ArcadeFrame {
  speedKph: number;
  /** 0..100 */
  damage: number;
  fuel: number;
  nearMisses: number;
  trafficHits: number;
  /** Pursuits escaped so far. */
  escapes: number;
  busted: boolean;
  /** The engine blew up (redlined until it gave out). */
  engineBlown?: boolean;
}

export type Outcome = 'complete' | 'time_up' | 'wrecked' | 'out_of_fuel' | 'engine_blown' | 'busted' | 'speed_lost' | 'escaped';

export interface ScoreLine {
  label: string;
  value: number;
}

export interface ArcadeResult {
  challengeId: string;
  outcome: Outcome;
  /** True when the player met the challenge's goal (medals are only awarded for success). */
  success: boolean;
  score: number;
  lines: ScoreLine[];
  timeS: number;
  distanceM: number;
  checkpoints: number;
  nearMisses: number;
  crashes: number;
  escapes: number;
  medal: Medal;
}

export interface ArcadeEvents {
  go: boolean;
  checkpoint: boolean;
  finished: boolean;
  /** Warning that the speed meter is low or time is nearly out. */
  warning: boolean;
}

/** Points per unit for each part of the score. */
export const SCORE = {
  perMetre: 0.5,
  perSpeedPoint: 0.2, // per km/h above 100, per second
  perNearMiss: 250,
  perCheckpoint: 1500,
  perSecondLeft: 80,
  perEscape: 4000,
  perCrash: -400,
};

export const medalFor = (def: ChallengeDef, score: number): Medal =>
  score >= def.medals.gold ? 'gold' : score >= def.medals.silver ? 'silver' : score >= def.medals.bronze ? 'bronze' : 'none';

/**
 * The rules and scoring of one arcade challenge: countdown, clock, checkpoints, distance, speed meter,
 * crashes, near misses and police escapes. Pure TypeScript; the drive scene feeds it each frame.
 */
export class ArcadeSession {
  phase: 'countdown' | 'running' | 'finished' = 'countdown';
  countdown = COUNTDOWN_SECONDS;
  elapsed = 0;
  timeLeft: number;
  distanceM = 0;
  checkpoints = 0;
  /** Distance (m) at which the next checkpoint or the finish gate stands. */
  nextGateM: number | null;
  speedMeter: number;
  result?: ArcadeResult;

  private speedPoints = 0;
  private nearMissBase = 0;
  private hitBase = 0;
  private escapeBase = 0;
  private nearMissesNow = 0;
  private crashesNow = 0;
  private escapesNow = 0;
  private started = false;
  private warnedTime = false;

  constructor(readonly def: ChallengeDef) {
    this.timeLeft = def.timeLimit;
    this.speedMeter = def.speed?.meterS ?? 0;
    this.nextGateM = def.kind === 'time_trial' ? (def.targetM ?? null) : def.checkpoint ? def.checkpoint.everyM : null;
  }

  /** True while the player must not be able to drive (the countdown). */
  get inputLocked(): boolean {
    return this.phase === 'countdown';
  }

  get score(): number {
    return this.computeScore().total;
  }

  private computeScore(): { total: number; lines: ScoreLine[] } {
    const timeBonus = this.def.kind === 'time_trial' && this.result?.success ? this.timeLeft * SCORE.perSecondLeft : this.def.kind === 'survival' && this.result?.success ? this.timeLeft * SCORE.perSecondLeft * 0.5 : 0;
    const nearMult = this.def.kind === 'survival' ? 2 : 1;
    const lines: ScoreLine[] = [
      { label: 'DISTANCE', value: Math.round(this.distanceM * SCORE.perMetre) },
      { label: 'SPEED', value: Math.round(this.speedPoints) },
      { label: 'NEAR MISSES', value: this.nearMissesNow * SCORE.perNearMiss * nearMult },
      { label: 'CHECKPOINTS', value: this.checkpoints * SCORE.perCheckpoint },
      { label: 'TIME LEFT', value: Math.round(timeBonus) },
      { label: 'POLICE ESCAPES', value: this.escapesNow * SCORE.perEscape },
      { label: 'CRASHES', value: this.crashesNow * SCORE.perCrash },
    ].filter((l) => l.value !== 0 || l.label === 'DISTANCE');
    return { total: Math.max(0, lines.reduce((s, l) => s + l.value, 0)), lines };
  }

  /** Advance one frame. Returns what happened so the scene can react (popups, gates, results). */
  update(dtRaw: number, f: ArcadeFrame): ArcadeEvents {
    const dt = Math.min(0.05, Math.max(0, dtRaw));
    const ev: ArcadeEvents = { go: false, checkpoint: false, finished: false, warning: false };
    if (this.phase === 'finished') return ev;

    if (this.phase === 'countdown') {
      if (!this.started) {
        // Counters start from whatever the scene has already seen.
        this.nearMissBase = f.nearMisses;
        this.hitBase = f.trafficHits;
        this.escapeBase = f.escapes;
        this.started = true;
      }
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.phase = 'running';
        ev.go = true;
      }
      return ev;
    }

    this.elapsed += dt;
    this.timeLeft -= dt;
    this.distanceM += (Math.max(0, f.speedKph) / 3.6) * dt;
    this.speedPoints += Math.max(0, f.speedKph - 100) * SCORE.perSpeedPoint * dt;
    this.nearMissesNow = f.nearMisses - this.nearMissBase;
    this.crashesNow = f.trafficHits - this.hitBase;
    this.escapesNow = f.escapes - this.escapeBase;

    // Gates: checkpoint rush adds time and sets the next gate; the time trial finishes at its gate.
    while (this.nextGateM !== null && this.distanceM >= this.nextGateM) {
      if (this.def.kind === 'time_trial') {
        this.finish('complete', true, ev);
        return ev;
      }
      this.checkpoints++;
      this.timeLeft += this.def.checkpoint!.bonusS;
      this.nextGateM += this.def.checkpoint!.everyM;
      ev.checkpoint = true;
    }

    // High-speed meter.
    if (this.def.speed) {
      const slow = f.speedKph < this.def.speed.minKph;
      this.speedMeter = Math.min(this.def.speed.meterS, Math.max(0, this.speedMeter + (slow ? -dt : dt * 0.5)));
      if (this.speedMeter < 2.5 && slow) ev.warning = true;
      if (this.speedMeter <= 0) {
        this.finish('speed_lost', true, ev); // the run simply ends; the score is what you earned
        return ev;
      }
    }

    if (this.timeLeft <= 10 && !this.warnedTime) {
      this.warnedTime = true;
      ev.warning = true;
    }

    // Ways a run ends.
    if (f.damage >= 100) {
      this.finish('wrecked', false, ev);
      return ev;
    }
    if (f.engineBlown && f.speedKph < 5) {
      this.finish('engine_blown', false, ev);
      return ev;
    }
    if (f.fuel <= 0 && f.speedKph < 5) {
      this.finish('out_of_fuel', false, ev);
      return ev;
    }
    if (this.def.kind === 'police_escape') {
      if (this.escapesNow > 0) {
        this.finish('escaped', true, ev);
        return ev;
      }
      if (f.busted) {
        this.finish('busted', false, ev);
        return ev;
      }
    }
    if (this.def.maxTimeS !== undefined && this.elapsed >= this.def.maxTimeS) {
      this.finish('time_up', true, ev);
      return ev;
    }
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      const success = this.def.kind !== 'time_trial' && this.def.kind !== 'police_escape';
      this.finish('time_up', success, ev);
    }
    return ev;
  }

  private finish(outcome: Outcome, success: boolean, ev: ArcadeEvents): void {
    this.phase = 'finished';
    ev.finished = true;
    // Provisional result so the time bonus can see `success`.
    this.result = { challengeId: this.def.id, outcome, success, score: 0, lines: [], timeS: this.elapsed, distanceM: this.distanceM, checkpoints: this.checkpoints, nearMisses: this.nearMissesNow, crashes: this.crashesNow, escapes: this.escapesNow, medal: 'none' };
    const { total, lines } = this.computeScore();
    this.result.score = Math.round(total);
    this.result.lines = lines;
    this.result.medal = success ? medalFor(this.def, this.result.score) : 'none';
  }
}
