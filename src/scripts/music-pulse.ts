/**
 * What the music is "doing" at every moment, so the wheel lights and the dot background move with it.
 * No React. It does not detect isolated hits: it follows the song's beat.
 * - Beats: those of the prior analysis of the whole song (beat-analysis.ts, in a worker). Until it is
 *   ready, or if it failed, a real-time tracker (BeatTracker, inside the audio engine, which loads on
 *   demand) predicts the next beat and keeps time through silences and passages without drums.
 * - Clock: the audio clock (AudioContext), in song time and minus the output latency, so every pulse
 *   lands when the beat is heard, not when the analyser sees it.
 * - Pulse (0-1): jumps on every beat and decays quickly; the first beat of each bar is stronger.
 * - Visual effect: one at a time, chosen from how the song sounds, changing every four bars right on the
 *   first beat of a bar, with a crossfade between the old and the new one.
 */
import type { BeatGrid } from './beat-analysis';

export type MusicBands = { bass: number; mid: number; high: number; pitch: number };

/**
 * rings: the whole rim pulses and rings spread out from the wheel · spin: the lights go round and a spiral
 * turns in the background · sparkle: random sparkles · bloom: a flower opening from the wheel · comets:
 * comets orbiting the wheel, one lap per bar · rays: light rays from the wheel on every beat, with the bulbs
 * alternating like a marquee · equalizer: equalizer bars jumping on every beat · fireworks: fireworks
 * bursting on every beat · tunnel: rings falling into the wheel like a tunnel, one ring per beat.
 */
export type MusicPattern = 'rings' | 'spin' | 'sparkle' | 'bloom' | 'comets' | 'rays' | 'equalizer' | 'fireworks' | 'tunnel';

/** Song times (s): what is heard now, and what the analyser measures now (it runs ahead). */
export interface MusicClock {
    audible: number;
    analysis: number;
}

/** What the audio engine provides to this module while a song plays. */
export interface PulseSource {
    /** Energy per band (0-1) of what the analyser measures. */
    bands(): MusicBands;
    /** null when nothing plays (paused, loading). */
    clock(): MusicClock | null;
    /**
     * Real-time tracker: it is fed what the analyser measures now (at song time `analysis`) and returns the
     * last predicted beat at or before `at` and the period (s); null when not locked.
     */
    live(analysis: number, at: number): { beat: number; period: number } | null;
    /** Grid of the prior analysis, as soon as it is ready. */
    grid(): BeatGrid | null;
}

export interface MusicFrame {
    pulse: number;
    /** Beats since the song started. */
    beats: number;
    /** Milliseconds since the last beat. */
    sinceBeat: number;
    /** Time between beats (ms). */
    beatMs: number;
    /** The last beat starts a bar. */
    downbeat: boolean;
    /** Intensity of the mids: vocals, chords, melody (0-1, within the song's own range). */
    melody: number;
    /** Brightness of the highs (0-1, normalised the same way). */
    sparkle: number;
    pattern: MusicPattern;
    previousPattern: MusicPattern;
    /** 0 right after a change, 1 when only the new pattern shows. */
    patternBlend: number;
}

const PATTERNS: readonly MusicPattern[] = ['rings', 'spin', 'sparkle', 'bloom', 'comets', 'rays', 'equalizer', 'fireworks', 'tunnel'];
const SILENT: MusicBands = { bass: 0, mid: 0, high: 0, pitch: 0.5 };
const DEFAULT_BEAT_MS = 500;
// The frame computed now is shown on the next refresh (one frame later: ~16 ms at 60 Hz, ~7 ms at 144 Hz),
// and every beat lights up on the frame shown closest to it, up to half a frame early. The frame duration
// is measured.
const DEFAULT_FRAME_MS = 16.7;
// Pulse decay: a third of the beat, so a fast song gets dry hits and a slow one long pulses. And the
// strength of beats that do not start a bar.
const PULSE_DECAY_SHARE = 0.3;
const OFFBEAT_ACCENT = 0.85;
// First effect after some of the song has been heard; then it changes every four bars (16 beats), on the
// first beat of a bar; for very fast songs (four bars in under 6 s), every eight. Without a beat (not locked
// yet), every 12 s. The change crossfades over one beat (between 300 and 900 ms).
const FIRST_PATTERN_MS = 2200;
// The song fades in over 0.8 s (and the previous one takes ~0.5 s to go): until it plays at its real
// volume it does not count towards its character.
const CHARACTER_FROM_MS = 1000;
const PATTERN_BEATS = 16;
const PATTERN_SHORTEST_MS = 6000;
const PATTERN_UNLOCKED_MS = 12000;
const PATTERN_FADE_MIN_MS = 300;
const PATTERN_FADE_MAX_MS = 900;

/** A band's own range: min and max adapt to the song, so 0-1 means "its" silence and "its" peak. */
interface Range { low: number; high: number }

let source: PulseSource | null = null;
let character: MusicBands | null = null;
let bassRange: Range | null = null;
let midRange: Range | null = null;
let highRange: Range | null = null;
let presence = 0;
let pulse = 0;
let melody = 0;
let sparkle = 0;
let lastRead = 0;
let frameMs = DEFAULT_FRAME_MS;
let songTime = -1;
let beats = 0;
let beatTime = -Infinity;
let beatAudibleAt = 0;
let beatMs = DEFAULT_BEAT_MS;
let downbeat = false;
let pattern: MusicPattern = 'spin';
let previousPattern: MusicPattern = 'spin';
let startedAt = 0;
let patternAt = 0;
let patternBeat = 0;

/** Forgets everything about the current song. */
function resetSong(): void {
    character = null;
    bassRange = null;
    midRange = null;
    highRange = null;
    presence = 0;
    songTime = -1;
    beats = 0;
    beatTime = -Infinity;
    beatMs = DEFAULT_BEAT_MS;
    downbeat = false;
    pattern = 'spin';
    previousPattern = 'spin';
    startedAt = 0;
    patternAt = 0;
    patternBeat = 0;
}

/** The music provider sets it for every song that starts playing and clears it on pause. */
export function setPulseSource(next: PulseSource | null): void {
    source = next;
    resetSong();
}

/** Whether a song is feeding the visuals. */
export function isPulseActive(): boolean {
    return source !== null;
}

/**
 * How well each effect suits how the song sounds. Thresholds measured with the analyser (dB scale, 0-1):
 * the lows almost always read high, so what tells songs apart is how much high end (cymbals, brightness)
 * and mids (vocals, chords) they have. Rings, spin and bloom also have a high base score: they look good
 * with almost anything.
 */
const suitability = ({ mid, high }: MusicBands): Record<MusicPattern, number> => ({
    rings: mid < 0.12 && high < 0.15 ? 3 : 1.4,
    spin: mid > 0.2 ? 2.5 : 1.4,
    sparkle: high > 0.35 ? 3 : 0.3,
    bloom: mid > 0.2 ? 2.2 : 1.2,
    equalizer: mid < 0.2 ? 1.8 : 1.4,
    fireworks: high > 0.3 ? 2.2 : 1,
    tunnel: 1.6,
    comets: mid > 0.2 ? 2 : 1.3,
    rays: high > 0.25 ? 2.2 : 1.2,
});

/** The best fit to start with; after that, a weighted random pick among the others. */
function nextPattern(current: MusicPattern | null, traits: MusicBands): MusicPattern {
    const scores = suitability(traits);
    if (!current) return PATTERNS.reduce<MusicPattern>((best, p) => (scores[p] > scores[best] ? p : best), 'spin');
    const options = PATTERNS.filter((p) => p !== current);
    let roll = Math.random() * options.reduce((sum, p) => sum + scores[p], 0);
    for (const option of options) {
        roll -= scores[option];
        if (roll <= 0) return option;
    }
    return options[0];
}

/** Tracks a band's range: the max rises instantly and decays slowly; the min, the other way round. */
const track = (range: Range | null, value: number, dt: number): Range => {
    if (!range) return { low: value, high: value + 0.05 };
    const drift = 1 - Math.exp(-dt / 6000);
    return {
        low: value < range.low ? value : range.low + (value - range.low) * drift,
        high: value > range.high ? value : range.high + (value - range.high) * drift,
    };
};

/** Position of a value inside a range (0-1). */
const within = (range: Range, value: number): number => Math.min(1, Math.max(0, (value - range.low) / Math.max(range.high - range.low, 0.06)));

/** Envelope: rises almost instantly and falls over `release` ms. */
const envelope = (current: number, target: number, dt: number, release: number): number =>
    target > current ? current + (target - current) * (1 - Math.exp(-dt / 25)) : current + (target - current) * (1 - Math.exp(-dt / release));

/** Index of the last grid beat at or before `time` (-1 if there is none yet). Binary search. */
function gridIndex(list: number[], time: number): number {
    let low = 0;
    let high = list.length - 1;
    let found = -1;
    while (low <= high) {
        const mid = (low + high) >> 1;
        if (list[mid] <= time) {
            found = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    return found;
}

/** The beat playing now: from the grid if there is one, otherwise the tracker's prediction. */
function currentBeat(at: number, analysis: number, grid: BeatGrid | null): { time: number; period: number; index: number | null; downbeat: boolean | null } | null {
    if (grid && grid.beats.length > 1) {
        const i = gridIndex(grid.beats, at);
        if (i < 0) return null;
        const next = grid.beats[i + 1] ?? grid.beats[i] + (grid.beats[i] - grid.beats[i - 1]);
        return { time: grid.beats[i], period: next - grid.beats[i], index: i + 1, downbeat: (i - grid.downbeat) % 4 === 0 };
    }
    const predicted = source?.live(analysis, at) ?? null;
    return predicted && predicted.beat >= 0 ? { time: predicted.beat, period: predicted.period, index: null, downbeat: null } : null;
}

/** Advances the state to `now`: levels, beat, pulse, song character and pattern rotation. */
function update(now: number): void {
    const dt = lastRead ? Math.min(now - lastRead, 100) : 16;
    if (lastRead) frameMs += (Math.min(40, Math.max(4, dt)) - frameMs) * 0.1;
    lastRead = now;
    let clock: MusicClock | null = null;
    let bands = SILENT;
    let grid: BeatGrid | null = null;
    if (source) {
        try {
            clock = source.clock();
            bands = source.bands();
            grid = source.grid();
        } catch {
            // The engine could not read the audio (closed context, or in development an engine from before a
            // hot reload): the lights calm down instead of breaking the page.
            clock = null;
        }
    }
    if (!clock) {
        const fade = Math.exp(-dt / 120);
        pulse *= fade;
        melody *= fade;
        sparkle *= fade;
        return;
    }
    // The song started over (a single track repeating): start from scratch.
    if (clock.audible < songTime - 0.5) resetSong();
    songTime = clock.audible;
    if (!startedAt) startedAt = now;

    // Presence: how much the lows sound within the song's range. In a passage without drums the pulse keeps
    // time, but softer.
    bassRange = track(bassRange, bands.bass, dt);
    presence = envelope(presence, within(bassRange, bands.bass), dt, 600);
    midRange = track(midRange, bands.mid, dt);
    highRange = track(highRange, bands.high, dt);
    // They decay over a fraction of the beat: faster for faster songs.
    melody = envelope(melody, within(midRange, bands.mid), dt, beatMs * 0.45);
    sparkle = envelope(sparkle, within(highRange, bands.high), dt, beatMs * 0.32);

    const shown = clock.audible + frameMs / 1000;
    const beat = currentBeat(shown + frameMs / 2000, clock.analysis, grid);
    if (beat && beat.time > beatTime + beat.period * 0.5) {
        beats = beat.index ?? beats + 1;
        downbeat = beat.downbeat ?? beats % 4 === 1;
        beatTime = beat.time;
        beatAudibleAt = now - (shown - beat.time) * 1000;
    }
    if (beat) beatMs = beat.period * 1000;
    const since = beat ? now - beatAudibleAt : Infinity;
    const accent = (downbeat ? 1 : OFFBEAT_ACCENT) * (0.7 + 0.3 * presence);
    // Until the beat is known (the first seconds, while the song is analysed), the lights pulse with the raw
    // bass hits: the music shows from the very first moment.
    pulse = Number.isFinite(since)
        ? accent * Math.exp(-Math.max(0, since) / (beatMs * PULSE_DECAY_SHARE))
        : envelope(pulse, within(bassRange, bands.bass) ** 2, dt, 140);

    // Song character (~4 s averages) and pattern rotation.
    if (now - startedAt >= CHARACTER_FROM_MS) {
        // At first, the average of everything heard; then, of the last ~4 s.
        const slow = 1 - Math.exp(-dt / Math.min(4000, Math.max(100, now - startedAt - CHARACTER_FROM_MS)));
        const was = character ?? bands;
        character = {
            bass: was.bass + (bands.bass - was.bass) * slow,
            mid: was.mid + (bands.mid - was.mid) * slow,
            high: was.high + (bands.high - was.high) * slow,
            pitch: was.pitch + (bands.pitch - was.pitch) * slow,
        };
    }
    const elapsed = now - startedAt;
    const barStart = beat !== null && downbeat && since < 100;
    // The first one, at the start of a bar (or after 4 s if there is no beat yet).
    const first = !patternAt && elapsed >= FIRST_PATTERN_MS && (barStart || elapsed >= 4000);
    const held = now - patternAt;
    // With a beat, at the start of the bar that completes four (or eight) since the previous change.
    const barsBeats = beatMs * PATTERN_BEATS < PATTERN_SHORTEST_MS ? PATTERN_BEATS * 2 : PATTERN_BEATS;
    const onBar = barStart && beats - patternBeat >= barsBeats;
    const rotate = patternAt > 0 && (onBar || (!beat && held >= PATTERN_UNLOCKED_MS));
    if ((first || rotate) && character) {
        const next = nextPattern(first ? null : pattern, character);
        previousPattern = first ? next : pattern;
        pattern = next;
        patternAt = now;
        patternBeat = beats;
    }
}

/** Current state. Several reads in the same frame (same instant) return the same result. */
export function readMusic(now: number = performance.now()): MusicFrame {
    if (now - lastRead >= 1) update(now);
    return {
        pulse,
        beats,
        sinceBeat: beatTime > -Infinity ? Math.max(0, now - beatAudibleAt) : Infinity,
        beatMs,
        downbeat,
        melody,
        sparkle,
        pattern,
        previousPattern,
        patternBlend: patternAt ? Math.min(1, (now - patternAt) / Math.min(PATTERN_FADE_MAX_MS, Math.max(PATTERN_FADE_MIN_MS, beatMs))) : 1,
    };
}

/** Just the pulse (0-1). */
export function readPulse(now: number = performance.now()): number {
    return readMusic(now).pulse;
}
