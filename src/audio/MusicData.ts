/**
 * Original 1980s-style music, written as data. Each track is compiled into a flat list of note events per
 * 16th-note step, so a scheduler (see MusicPlayer) only has to play what falls inside its look-ahead window.
 * Pure TypeScript: unit-tested by `npm run sim:audio`.
 */

export type MusicPart = 'kick' | 'snare' | 'hat' | 'ohat' | 'clap' | 'bass' | 'arp' | 'pad' | 'lead';
export type TrackId = 'menu' | 'arcade' | 'pursuit';

export interface NoteEvent {
  part: MusicPart;
  /** MIDI note number (ignored for drums). */
  midi: number;
  /** Length in steps (16th notes). */
  steps: number;
  /** 0..1 */
  vel: number;
}

interface Chord {
  root: number;
  minor: boolean;
}

interface TrackDef {
  id: TrackId;
  name: string;
  bpm: number;
  /** One chord per bar; the song loops after this many bars. */
  progression: Chord[];
  /** 16-character rhythm strings (one bar). '.' = rest, 'x' = hit, 'X' = accented hit. */
  kick: string;
  snare: string;
  hat: string;
  ohat?: string;
  clap?: string;
  /** Bass: 'r' root, 'R' root one octave up, '5' fifth, 'o' root two octaves down is not used; '.' rest. */
  bass: string;
  /** Arpeggio: digits 0-3 pick a chord tone (3 = the octave), shifted up `arpOctave` octaves. */
  arp: string;
  arpOctave: number;
  /** Sustained pad chord each bar (menu feel). */
  pad: boolean;
  /** Lead melody: one 16-char string per bar; digits index into `leadScale`. */
  leadScale: number[];
  lead: string[];
  /** Overall level trim for the track. */
  level: number;
}

const A_MIN = (root: number): Chord => ({ root, minor: true });
const MAJ = (root: number): Chord => ({ root, minor: false });

export const TRACKS: Record<TrackId, TrackDef> = {
  // "Neon Dawn": calm, spacious menu theme. A minor, 92 bpm.
  menu: {
    id: 'menu',
    name: 'Neon Dawn',
    bpm: 92,
    progression: [A_MIN(45), MAJ(41), MAJ(48), MAJ(43), A_MIN(45), MAJ(41), MAJ(48), MAJ(43)],
    kick: 'x.......x.x.....',
    snare: '....x.......x...',
    hat: 'x.x.x.x.x.x.x.x.',
    clap: '................',
    bass: 'r.....R.r.....5.',
    arp: '0.1.2.1.0.1.2.3.',
    arpOctave: 2,
    pad: true,
    leadScale: [69, 72, 74, 76, 79, 81, 84], // A minor pentatonic
    lead: ['4...3...2...0...', '....2.3.4.......', '5...4...3...2...', '....3.2.0.......', '4...3...2...0...', '....2.3.4.5.....', '6...5...4...3...', '2...3...0.......'],
    level: 0.75,
  },
  // "Midnight Run": driving arcade theme. A minor, 138 bpm.
  arcade: {
    id: 'arcade',
    name: 'Midnight Run',
    bpm: 138,
    progression: [A_MIN(45), A_MIN(45), MAJ(41), MAJ(43), A_MIN(45), A_MIN(45), MAJ(48), MAJ(43)],
    kick: 'x...x...x...x...',
    snare: '....x.......x...',
    hat: 'x.x.x.x.x.x.x.x.',
    ohat: '..x...x...x...x.',
    bass: 'r.rRr.rRr.rRr.r5',
    arp: '0123210301232103',
    arpOctave: 2,
    pad: false,
    leadScale: [69, 72, 74, 76, 79, 81, 84],
    lead: ['4..4.5..4.3.2...', '0..2.3..2...0...', '5..5.6..5.4.3...', '2..3.4..3...2...', '4..4.5..6.5.4...', '3..3.4..5.4.3...', '6..6.5..4.3.5...', '4.3.2.0.2...3...'],
    level: 0.5,
  },
  // "Hot Pursuit": tense chase theme. D minor, 156 bpm.
  pursuit: {
    id: 'pursuit',
    name: 'Hot Pursuit',
    bpm: 156,
    progression: [A_MIN(38), A_MIN(38), MAJ(34), MAJ(36), A_MIN(38), A_MIN(38), MAJ(34), MAJ(33)],
    kick: 'x..xx..xx..xx.x.',
    snare: '....x.......x..x',
    hat: 'xxxxxxxxxxxxxxxx',
    clap: '....x.......x...',
    bass: 'rr.rr.rrr.rr.rrR',
    arp: '0.2.1.3.0.2.1.3.',
    arpOctave: 2,
    pad: false,
    leadScale: [62, 65, 67, 69, 72, 74, 77], // D minor pentatonic
    lead: ['5.5.4.3.4.....3.', '3.3.2.0.2.......', '4.4.3.2.3.....2.', '2.2.0.2.3.4.....', '5.5.4.3.4.5.6...', '6.6.5.4.3.....2.', '4.4.3.2.0.2.3...', '5.6.5.4.3.2.0...'],
    level: 0.7,
  },
};

export const TRACK_IDS = Object.keys(TRACKS) as TrackId[];
export const STEPS_PER_BAR = 16;

export interface CompiledTrack {
  id: TrackId;
  name: string;
  bpm: number;
  /** Seconds per 16th-note step. */
  stepSeconds: number;
  totalSteps: number;
  /** Events starting at each step (length = totalSteps). */
  events: NoteEvent[][];
  level: number;
}

export const stepSeconds = (bpm: number): number => 60 / bpm / 4;

/** Turns a track definition into per-step note events. */
export function compileTrack(def: TrackDef): CompiledTrack {
  const bars = def.progression.length;
  const total = bars * STEPS_PER_BAR;
  const events: NoteEvent[][] = Array.from({ length: total }, () => []);
  const add = (step: number, e: NoteEvent) => events[step % total].push(e);

  for (let b = 0; b < bars; b++) {
    const chord = def.progression[b];
    const tones = chord.minor ? [0, 3, 7, 12] : [0, 4, 7, 12];
    for (let s = 0; s < STEPS_PER_BAR; s++) {
      const step = b * STEPS_PER_BAR + s;
      const hit = (str: string | undefined) => (str ? str[s] : '.');
      const drum = (part: MusicPart, str: string | undefined, vel: number) => {
        const c = hit(str);
        if (c === 'x') add(step, { part, midi: 0, steps: 1, vel });
        else if (c === 'X') add(step, { part, midi: 0, steps: 1, vel: Math.min(1, vel * 1.3) });
      };
      drum('kick', def.kick, 0.9);
      drum('snare', def.snare, 0.7);
      drum('hat', def.hat, 0.32);
      drum('ohat', def.ohat, 0.3);
      drum('clap', def.clap, 0.5);

      const bc = def.bass[s];
      if (bc === 'r') add(step, { part: 'bass', midi: chord.root, steps: 1, vel: 0.85 });
      else if (bc === 'R') add(step, { part: 'bass', midi: chord.root + 12, steps: 1, vel: 0.7 });
      else if (bc === '5') add(step, { part: 'bass', midi: chord.root + 7, steps: 1, vel: 0.7 });

      const ac = def.arp[s];
      if (ac >= '0' && ac <= '3') add(step, { part: 'arp', midi: chord.root + 12 * def.arpOctave + tones[Number(ac)], steps: 1, vel: 0.5 });

      const lc = def.lead[b % def.lead.length]?.[s] ?? '.';
      if (lc >= '0' && lc <= '9') {
        const note = def.leadScale[Number(lc)];
        if (note !== undefined) {
          // A note lasts until the next note or rest in the bar (at most 4 steps).
          let len = 1;
          while (s + len < STEPS_PER_BAR && len < 4 && def.lead[b % def.lead.length][s + len] === '.') len++;
          add(step, { part: 'lead', midi: note, steps: len, vel: 0.6 });
        }
      }
    }
    if (def.pad) {
      for (const t of tones.slice(0, 3)) add(b * STEPS_PER_BAR, { part: 'pad', midi: chord.root + 24 + t, steps: STEPS_PER_BAR, vel: 0.3 });
    }
  }
  return { id: def.id, name: def.name, bpm: def.bpm, stepSeconds: stepSeconds(def.bpm), totalSteps: total, events, level: def.level };
}

const cache = new Map<TrackId, CompiledTrack>();
export function getTrack(id: TrackId): CompiledTrack {
  let t = cache.get(id);
  if (!t) {
    t = compileTrack(TRACKS[id]);
    cache.set(id, t);
  }
  return t;
}

/**
 * A repeating scheduler clock. `advance(until)` yields every step whose start time is before `until`
 * (in the clock's own seconds), so a caller can schedule notes slightly ahead of playback.
 */
export class StepClock {
  private step = 0;
  private time: number;

  constructor(private track: CompiledTrack, startTime: number) {
    this.time = startTime;
  }

  /** Steps due before `until`: `{ time, step, events }` where step is the position in the loop. */
  advance(until: number): { time: number; step: number; events: NoteEvent[] }[] {
    const out: { time: number; step: number; events: NoteEvent[] }[] = [];
    while (this.time < until) {
      const pos = this.step % this.track.totalSteps;
      out.push({ time: this.time, step: pos, events: this.track.events[pos] });
      this.time += this.track.stepSeconds;
      this.step++;
    }
    return out;
  }

  get nextTime(): number {
    return this.time;
  }
}
