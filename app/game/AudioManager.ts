import { takeNextTrack } from "./playlist.mjs";
import { readStoredNumber, readStoredValue, writeStoredValue } from "./storage.mjs";

export type AudioCue =
  | "attack" | "hit" | "kill" | "dash" | "recruit"
  | "wave" | "damage" | "ultimate" | "victory" | "defeat";

const CROSSFADE_SECONDS = 4;
const TRACKS = [
  { id: "protocol", title: "Freeman Protocol", url: "/audio/freeman-protocol.mp3" },
  { id: "core-2", title: "Freeman Core", url: "/audio/freeman-core-2.mp3" },
  { id: "core-3", title: "Freeman Core (Alternate)", url: "/audio/freeman-core-3.mp3" },
] as const;

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const storedNumber = (key: string, fallback: number) => {
  const value = readStoredNumber(key, fallback);
  return Number.isFinite(value) ? clamp(value) : fallback;
};

export class AudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private readonly players = [new Audio(), new Audio()];
  private playerGains: GainNode[] = [];
  private activePlayer = 0;
  private playlist = { tracks: TRACKS.map((track) => track.id), bag: [] as string[], previous: null as string | null };
  private muted = readStoredValue("freeman-audio-muted") === "true";
  private musicVolume = storedNumber("freeman-music-volume", 0.42);
  private sfxVolume = storedNumber("freeman-sfx-volume", 0.72);
  private paused = false;
  private crossfading = false;
  private frame = 0;

  constructor() {
    for (const player of this.players) {
      player.preload = "metadata";
      player.addEventListener("timeupdate", this.checkCrossfade);
      player.addEventListener("ended", this.advance);
    }
    document.addEventListener("visibilitychange", this.handleVisibility);
  }

  unlock() {
    if (!this.context) this.createGraph();
    void this.context?.resume();
    if (!this.players[this.activePlayer].src) this.loadNext(this.activePlayer);
    if (!this.paused && !document.hidden) {
      this.players[this.activePlayer].play().catch(() => undefined);
    }
  }

  setMuted(value: boolean) {
    this.muted = value;
    writeStoredValue("freeman-audio-muted", String(value));
    this.applyVolumes();
  }

  setMusicVolume(value: number) {
    this.musicVolume = clamp(value);
    writeStoredValue("freeman-music-volume", String(this.musicVolume));
    this.applyVolumes();
  }

  setSfxVolume(value: number) {
    this.sfxVolume = clamp(value);
    writeStoredValue("freeman-sfx-volume", String(this.sfxVolume));
    this.applyVolumes();
  }

  setPaused(value: boolean) {
    this.paused = value;
    if (value) this.players.forEach((player) => player.pause());
    else this.unlock();
  }

  play(cue: AudioCue) {
    this.playCue(cue);
  }

  playCue(cue: AudioCue) {
    if (!this.context || !this.sfxBus || this.muted) return;
    const frequencies: Record<AudioCue, [number, number, number]> = {
      attack: [380, 145, 0.075], hit: [145, 72, 0.12],
      kill: [430, 720, 0.16], dash: [190, 660, 0.18],
      recruit: [220, 660, 0.3], wave: [120, 360, 0.34],
      damage: [95, 48, 0.24], ultimate: [70, 880, 0.65],
      victory: [220, 880, 0.7], defeat: [150, 42, 0.9],
    };
    const [from, to, duration] = frequencies[cue];
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    oscillator.type = cue === "victory" ? "triangle" : "sawtooth";
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + duration);
    gain.gain.setValueAtTime(0.075, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.sfxBus);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    document.removeEventListener("visibilitychange", this.handleVisibility);
    for (const player of this.players) {
      player.removeEventListener("timeupdate", this.checkCrossfade);
      player.removeEventListener("ended", this.advance);
      player.pause();
      player.removeAttribute("src");
      player.load();
    }
    this.playerGains.forEach((gain) => gain.disconnect());
    this.musicBus?.disconnect();
    this.sfxBus?.disconnect();
    this.master?.disconnect();
    this.compressor?.disconnect();
    void this.context?.close();
    this.context = null;
  }

  private createGraph() {
    const AudioContextConstructor = window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    this.context = new AudioContextConstructor();
    this.master = this.context.createGain();
    this.musicBus = this.context.createGain();
    this.sfxBus = this.context.createGain();
    this.compressor = this.context.createDynamicsCompressor();
    this.playerGains = this.players.map((player) => {
      const source = this.context!.createMediaElementSource(player);
      const gain = this.context!.createGain();
      source.connect(gain).connect(this.musicBus!);
      return gain;
    });
    this.playerGains[0].gain.value = 1;
    this.playerGains[1].gain.value = 0;
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.master.connect(this.compressor).connect(this.context.destination);
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.master?.gain.setTargetAtTime(this.muted ? 0 : 0.8, now, 0.03);
    this.musicBus?.gain.setTargetAtTime(this.musicVolume ** 2, now, 0.03);
    this.sfxBus?.gain.setTargetAtTime(this.sfxVolume ** 2, now, 0.03);
  }

  private loadNext(index: number) {
    const result = takeNextTrack(this.playlist);
    this.playlist = result.state;
    const track = TRACKS.find((item) => item.id === result.track) ?? TRACKS[0];
    this.players[index].src = track.url;
  }

  private checkCrossfade = () => {
    const active = this.players[this.activePlayer];
    if (
      this.crossfading || !Number.isFinite(active.duration) ||
      active.duration - active.currentTime > CROSSFADE_SECONDS
    ) return;
    this.crossfading = true;
    const incomingIndex = 1 - this.activePlayer;
    this.loadNext(incomingIndex);
    const incoming = this.players[incomingIndex];
    if (this.playerGains[incomingIndex]) {
      this.playerGains[incomingIndex].gain.value = 0;
    }
    incoming.currentTime = 0;
    incoming.play().catch(() => {
      this.crossfading = false;
    });
    const started = performance.now();
    const fade = () => {
      const progress = clamp((performance.now() - started) / (CROSSFADE_SECONDS * 1000));
      if (this.playerGains.length === 2) {
        this.playerGains[this.activePlayer].gain.value = Math.cos(progress * Math.PI * 0.5);
        this.playerGains[incomingIndex].gain.value = Math.sin(progress * Math.PI * 0.5);
      }
      if (progress < 1) this.frame = requestAnimationFrame(fade);
      else {
        active.pause();
        active.removeAttribute("src");
        this.activePlayer = incomingIndex;
        this.crossfading = false;
      }
    };
    this.frame = requestAnimationFrame(fade);
  };

  private advance = () => {
    if (!this.crossfading) this.checkCrossfade();
  };

  private handleVisibility = () => {
    if (document.hidden) this.players.forEach((player) => player.pause());
    else if (!this.paused) this.unlock();
  };
}
