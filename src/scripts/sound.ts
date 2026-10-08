/**
 * Sound effects synthesized with Web Audio: no audio files to download.
 * The AudioContext is created on first use, which always comes after a user gesture (a click or
 * pressing Space), as browsers require.
 */

const SOUND_KEY = 'spinly-sound';
const SOUND_VOLUME_KEY = 'spinly-sound-volume';

let context: AudioContext | null = null;
// Only used when localStorage is unavailable (strict private mode).
let memoryEnabled = true;
let memoryVolume = 1;
const listeners = new Set<() => void>();

/** Whether sound effects are on (on by default). Read from storage on every call: no copy to get out of sync. */
export function isSoundEnabled(): boolean {
    try {
        return localStorage.getItem(SOUND_KEY) !== 'off';
    } catch {
        return memoryEnabled;
    }
}

/** Turns sound effects on or off and notifies subscribers. */
export function setSoundEnabled(enabled: boolean): void {
    memoryEnabled = enabled;
    try {
        localStorage.setItem(SOUND_KEY, enabled ? 'on' : 'off');
    } catch {
        // No storage access: the preference is kept in memory.
    }
    listeners.forEach((listener) => listener());
}

/** Effects volume, 0 to 1 (1 by default). Turning effects off keeps it: it comes back when they are turned on. */
export function getSoundVolume(): number {
    try {
        const raw = localStorage.getItem(SOUND_VOLUME_KEY);
        const volume = Number(raw);
        return raw !== null && Number.isFinite(volume) ? Math.min(Math.max(volume, 0), 1) : 1;
    } catch {
        return memoryVolume;
    }
}

/** Sets the effects volume (0-1) and notifies subscribers. */
export function setSoundVolume(volume: number): void {
    memoryVolume = Math.min(Math.max(volume, 0), 1);
    try {
        localStorage.setItem(SOUND_VOLUME_KEY, String(Math.round(memoryVolume * 100) / 100));
    } catch {
        // No storage access: the volume is kept in memory.
    }
    listeners.forEach((listener) => listener());
}

/** Subscribes to sound preference changes (for useSyncExternalStore); returns the unsubscribe function. */
export function subscribeSound(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** The shared AudioContext, created and resumed on demand; null when sound is off or unsupported. */
function audio(): AudioContext | null {
    if (!isSoundEnabled()) return null;
    if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return null;
    if (!context) context = new window.AudioContext();
    if (context.state === 'suspended') void context.resume();
    return context;
}

/** Plays one oscillator note with a short attack and an exponential decay. */
function tone(ctx: AudioContext, { frequency, to, start, duration, volume, type }: {
    frequency: number;
    /** Final frequency: a short sweep gives the "pop" or falling character. */
    to?: number;
    start: number;
    duration: number;
    volume: number;
    type: OscillatorType;
}) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    // Squared curve: the slider feels linear. Never 0: exponential ramps do not accept it.
    const level = Math.max(volume * getSoundVolume() ** 2, 0.0002);
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (to) oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(level, start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
}

/** A short burst of filtered noise, the "wood" of the flapper's click. */
function noise(ctx: AudioContext, { start, duration, volume, filter }: { start: number; duration: number; volume: number; filter: number }) {
    const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * duration)), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = filter;
    const gain = ctx.createGain();
    const level = Math.max(volume * getSoundVolume() ** 2, 0.0002);
    gain.gain.setValueAtTime(level, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(band).connect(gain).connect(ctx.destination);
    source.start(start);
}

/** The flapper's click as it passes the border between two sectors (same sound as in Chatterly). */
export function playTick(): void {
    const ctx = audio();
    if (!ctx) return;
    const now = ctx.currentTime;
    tone(ctx, { frequency: 1500, to: 900, start: now, duration: 0.03, volume: 0.1, type: 'triangle' });
    noise(ctx, { start: now, duration: 0.006, volume: 0.05, filter: 4500 });
}

/** Short rising arpeggio when the winner is announced (same sound as in Chatterly). */
export function playWin(): void {
    const ctx = audio();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes: Array<[number, number, number]> = [[523, 0, 0.18], [659, 0.12, 0.18], [784, 0.24, 0.2], [1047, 0.36, 0.45]];
    for (const [frequency, at, duration] of notes) {
        tone(ctx, { frequency, start: now + at, duration, volume: 0.11, type: 'sine' });
    }
}

/** Tournament: a duel is decided. A rising arpeggio that lands on a bright chord. */
export function playDuelWin(): void {
    const ctx = audio();
    if (!ctx) return;
    const now = ctx.currentTime;
    [392, 523.25, 659.25, 783.99].forEach((frequency, i) => {
        tone(ctx, { frequency, start: now + i * 0.08, duration: 0.3, volume: 0.12, type: 'triangle' });
    });
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency) => {
        tone(ctx, { frequency, start: now + 0.36, duration: 0.9, volume: 0.07, type: 'sine' });
    });
}

/** Tournament: the champion is crowned. A short brass-like fanfare with a sparkling tail. */
export function playFanfare(): void {
    const ctx = audio();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes: Array<[number, number, number]> = [
        [523.25, 0, 0.16], [523.25, 0.18, 0.16], [523.25, 0.36, 0.16], [659.25, 0.54, 0.5],
        [587.33, 1.08, 0.16], [659.25, 1.26, 0.16], [783.99, 1.44, 1.2],
    ];
    for (const [frequency, at, duration] of notes) {
        tone(ctx, { frequency, start: now + at, duration, volume: 0.1, type: 'sawtooth' });
        tone(ctx, { frequency: frequency * 2, start: now + at, duration, volume: 0.05, type: 'sine' });
    }
    [1046.5, 1318.51, 1567.98, 2093].forEach((frequency, i) => {
        tone(ctx, { frequency, start: now + 1.5 + i * 0.07, duration: 0.6, volume: 0.04, type: 'sine' });
    });
}

/**
 * tap: a regular button. nav: switching section or tab. confirm: a primary action.
 * remove: deleting or removing something.
 */
export type UiSound = 'tap' | 'nav' | 'confirm' | 'remove';

/** Plays the interface sound of a kind of button. */
export function playUi(kind: UiSound): void {
    const ctx = audio();
    if (!ctx) return;
    const now = ctx.currentTime;
    switch (kind) {
        case 'nav':
            tone(ctx, { frequency: 520, to: 820, start: now, duration: 0.09, volume: 0.07, type: 'sine' });
            break;
        case 'confirm':
            tone(ctx, { frequency: 659.25, start: now, duration: 0.12, volume: 0.08, type: 'sine' });
            tone(ctx, { frequency: 987.77, start: now + 0.06, duration: 0.16, volume: 0.08, type: 'sine' });
            break;
        case 'remove':
            tone(ctx, { frequency: 420, to: 210, start: now, duration: 0.12, volume: 0.09, type: 'sine' });
            break;
        case 'tap':
        default:
            tone(ctx, { frequency: 760, to: 440, start: now, duration: 0.06, volume: 0.09, type: 'sine' });
            tone(ctx, { frequency: 2600, start: now, duration: 0.012, volume: 0.015, type: 'triangle' });
            break;
    }
}
