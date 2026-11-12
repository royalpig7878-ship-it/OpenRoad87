import { TrackId, StepClock, getTrack, CompiledTrack, NoteEvent } from './MusicData';
import { arpNote, bassNote, clap, hat, kick, leadNote, padNote, snare } from './synth';

interface Playing {
  id: TrackId;
  track: CompiledTrack;
  bus: GainNode;
  clock: StepClock;
}

/** Plays one note event of a track at audio time `t` (exported so tests can render music offline). */
export function playMusicNote(ctx: BaseAudioContext, dest: AudioNode, e: NoteEvent, t: number, stepSeconds: number): void {
  const dur = e.steps * stepSeconds;
  switch (e.part) {
    case 'kick': kick(ctx, dest, t, e.vel); break;
    case 'snare': snare(ctx, dest, t, e.vel); break;
    case 'hat': hat(ctx, dest, t, e.vel); break;
    case 'ohat': hat(ctx, dest, t, e.vel, true); break;
    case 'clap': clap(ctx, dest, t, e.vel); break;
    case 'bass': bassNote(ctx, dest, t, e.midi, dur * 0.9, e.vel); break;
    case 'arp': arpNote(ctx, dest, t, e.midi, dur, e.vel); break;
    case 'lead': leadNote(ctx, dest, t, e.midi, dur * 0.95, e.vel); break;
    case 'pad': padNote(ctx, dest, t, e.midi, dur, e.vel); break;
  }
}

const LOOKAHEAD = 0.35; // seconds of music scheduled in advance
const TICK_MS = 100;

/**
 * Plays the data-driven tracks with a look-ahead scheduler (the standard WebAudio approach: a timer wakes up
 * regularly and schedules the notes that fall in the next fraction of a second at exact audio times).
 */
export class MusicPlayer {
  private current: Playing | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private ctx: BaseAudioContext, private dest: AudioNode) {}

  get playing(): TrackId | null {
    return this.current?.id ?? null;
  }

  /** Starts a track (crossfading from the previous one), or stops music with `null`. Re-requesting the current track does nothing. */
  play(id: TrackId | null, fade = 0.8): void {
    if (id === this.current?.id) return;
    const now = this.ctx.currentTime;
    const old = this.current;
    if (old) {
      old.bus.gain.cancelScheduledValues(now);
      old.bus.gain.setValueAtTime(old.bus.gain.value, now);
      old.bus.gain.linearRampToValueAtTime(0, now + fade);
      setTimeout(() => old.bus.disconnect(), (fade + 0.6) * 1000);
    }
    this.current = null;
    if (id === null) {
      this.stopTimer();
      return;
    }
    const track = getTrack(id);
    const bus = this.ctx.createGain();
    bus.gain.setValueAtTime(0, now);
    bus.gain.linearRampToValueAtTime(track.level, now + fade);
    bus.connect(this.dest);
    this.current = { id, track, bus, clock: new StepClock(track, now + 0.08) };
    if (!this.timer) this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  private tick(): void {
    const cur = this.current;
    if (!cur) return;
    const now = this.ctx.currentTime;
    // If the page was throttled/suspended and we fell far behind, resync rather than playing a burst of old notes.
    if (cur.clock.nextTime < now - 0.5) cur.clock = new StepClock(cur.track, now + 0.05);
    for (const step of cur.clock.advance(now + LOOKAHEAD)) {
      if (step.time < now - 0.05) continue;
      for (const e of step.events) this.playNote(cur, e, step.time);
    }
  }

  private playNote(cur: Playing, e: NoteEvent, t: number): void {
    playMusicNote(this.ctx, cur.bus, e, t, cur.track.stepSeconds);
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  destroy(): void {
    this.stopTimer();
    this.current?.bus.disconnect();
    this.current = null;
  }
}
