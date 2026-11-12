import { getSettings, updateSettings } from '../save/Settings';
import { MusicPlayer } from './MusicPlayer';
import { TrackId } from './MusicData';
import { playSfx, SfxName, SfxOpts } from './Sfx';

/**
 * The single owner of the browser AudioContext, the volume buses and the music player.
 *
 *   sounds -> sfxBus ----\
 *                         master -> speakers
 *   music  -> musicBus --/
 *
 * Browsers only allow audio after a user gesture, so the context is created on the first key press, click or
 * touch. Until then every call is a harmless no-op (and a requested music track starts as soon as audio unlocks).
 */
class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private music: MusicPlayer | null = null;
  private wantedTrack: TrackId | null = null;
  private duck = 1;
  private listening = false;

  /** Installs the one-time gesture listeners. Safe to call repeatedly. */
  attach(): void {
    if (this.listening || typeof window === 'undefined') return;
    this.listening = true;
    const unlock = () => this.unlock();
    for (const ev of ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown', 'mousedown']) window.addEventListener(ev, unlock, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else if (this.unlocked) void this.ctx.resume();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyX' && !e.repeat) this.toggleMute();
    });
  }

  private unlocked = false;

  /** Creates (first time) and resumes the audio context. Called from a user gesture. */
  unlock(): void {
    if (typeof window === 'undefined') return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      if (!this.ctx) {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.sfxBus = this.ctx.createGain();
        this.musicBus = this.ctx.createGain();
        this.sfxBus.connect(this.master);
        this.musicBus.connect(this.master);
        // A gentle compressor stops loud overlapping effects from clipping.
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.ratio.value = 6;
        this.master.connect(comp).connect(this.ctx.destination);
        this.music = new MusicPlayer(this.ctx, this.musicBus);
        this.applySettings();
      }
      void this.ctx.resume();
      this.unlocked = true;
      if (this.wantedTrack) this.music?.play(this.wantedTrack);
    } catch {
      // No audio available: the game stays silent.
    }
  }

  /** The context and the bus that effects/loops should connect to, or null while audio is locked or unavailable. */
  get engine(): { ctx: AudioContext; bus: AudioNode } | null {
    return this.ctx && this.sfxBus ? { ctx: this.ctx, bus: this.sfxBus } : null;
  }

  get muted(): boolean {
    return getSettings().muted;
  }

  /** Reads volumes/mute from settings and applies them to the buses. */
  applySettings(): void {
    if (!this.ctx || !this.master || !this.sfxBus || !this.musicBus) return;
    const s = getSettings();
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.masterVolume, t, 0.03);
    this.sfxBus.gain.setTargetAtTime(s.sfxVolume, t, 0.03);
    this.musicBus.gain.setTargetAtTime(s.musicVolume * this.duck, t, 0.05);
  }

  setMuted(m: boolean): void {
    updateSettings({ muted: m });
    this.applySettings();
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /** Plays a one-shot effect (ignored while audio is locked). */
  sfx(name: SfxName, opts?: SfxOpts): void {
    const e = this.engine;
    if (!e || e.ctx.state !== 'running') return;
    playSfx(e.ctx, e.bus, name, opts);
  }

  /** Starts a music track (or stops it with null). Remembered if audio is still locked. */
  playMusic(id: TrackId | null): void {
    this.wantedTrack = id;
    this.music?.play(id);
  }

  get currentTrack(): TrackId | null {
    return this.music?.playing ?? this.wantedTrack;
  }

  /** Lowers music (e.g. to 0.5 while driving so engine and sirens stay clear). */
  duckMusic(level: number): void {
    this.duck = Math.max(0, Math.min(1, level));
    this.applySettings();
  }
}

export const audio = new AudioManager();

// Dev-only handle for browser-based testing (same idea as window.__game).
if (typeof window !== 'undefined' && import.meta.env?.DEV) (window as unknown as { __audio: AudioManager }).__audio = audio;
