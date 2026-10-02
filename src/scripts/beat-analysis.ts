/**
 * Beat analysis of a whole song, without DOM or React: it runs in a Web Worker (beat-worker.ts) and in
 * tests. From the audio signal it extracts the beat grid:
 * 1. Onsets: spectral flux on a log scale, at 100 frames per second.
 * 2. Tempo: autocorrelation of the onsets between 70 and 180 BPM, with a soft preference for common
 *    tempos and double/half tempo correction; also per section, to follow tempo changes.
 * 3. Beats: dynamic programming (Ellis, 2007): each beat lands on a strong onset at a distance from the
 *    previous one close to the period. Through silences it keeps the same pace.
 * 4. Fine tuning: each beat is moved to the exact onset instant (~3 ms resolution).
 * 5. Bar: the first beat is the phase (out of 4) with the most bass onset strength.
 *
 * It also contains the real-time tracker (OnsetMeter + BeatTracker) used before the analysis is ready.
 */

export interface BeatGrid {
    /** Beat times in seconds from the start of the song. */
    beats: number[];
    bpm: number;
    /** Index (0-3) of the first beat that starts a bar: bars start at downbeat, downbeat + 4… */
    downbeat: number;
}

const TARGET_RATE = 11025;
const FRAME = 512;
const FPS = 100;
const MIN_BPM = 70;
const MAX_BPM = 180;
// Stiffness of the step between beats in the dynamic programming: higher means more regular.
const TIGHTNESS = 80;
// Window and hop of the per-section tempo (s).
const LOCAL_WINDOW_S = 4;
const LOCAL_HOP_S = 1;

// Weight of each band in the onset strength (average rise per bin of the band): kick and bass mark the
// beat; cymbals and hats, often on the off-beat, count little.
const BAND_EDGES_HZ = [200, 2000];
const BAND_WEIGHTS = [1, 0.5, 0.2];

/** Weight of each spectrum bin according to its band. */
function bandWeights(bins: number, binHz: number): Float64Array {
    /** Band index (0-2) of a bin. */
    const bandOf = (k: number) => BAND_EDGES_HZ.filter((edge) => k * binHz >= edge).length;
    const counts = BAND_WEIGHTS.map(() => 0);
    for (let k = 1; k < bins; k++) counts[bandOf(k)] += 1;
    const weights = new Float64Array(bins);
    for (let k = 1; k < bins; k++) weights[k] = BAND_WEIGHTS[bandOf(k)] / Math.max(1, counts[bandOf(k)]);
    return weights;
}

/** In-place radix-2 complex FFT (n must be a power of 2). */
export function fft(re: Float64Array, im: Float64Array): void {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            [re[i], re[j]] = [re[j], re[i]];
            [im[i], im[j]] = [im[j], im[i]];
        }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const angle = (-2 * Math.PI) / len;
        const wr = Math.cos(angle);
        const wi = Math.sin(angle);
        for (let i = 0; i < n; i += len) {
            let cr = 1;
            let ci = 0;
            for (let k = 0; k < len / 2; k++) {
                const a = i + k;
                const b = a + len / 2;
                const tr = re[b] * cr - im[b] * ci;
                const ti = re[b] * ci + im[b] * cr;
                re[b] = re[a] - tr;
                im[b] = im[a] - ti;
                re[a] += tr;
                im[a] += ti;
                const next = cr * wr - ci * wi;
                ci = cr * wi + ci * wr;
                cr = next;
            }
        }
    }
}

/** Mono down to ~11 kHz: block averaging (it filters what does not fit the new rate). */
export function downsample(samples: Float32Array, rate: number): { signal: Float32Array; rate: number } {
    const factor = Math.max(1, Math.round(rate / TARGET_RATE));
    const out = new Float32Array(Math.floor(samples.length / factor));
    for (let i = 0; i < out.length; i++) {
        let sum = 0;
        for (let k = 0; k < factor; k++) sum += samples[i * factor + k];
        out[i] = sum / factor;
    }
    return { signal: out, rate: rate / factor };
}

interface Onsets {
    /** Normalised onset strength, one value every 10 ms. */
    env: Float32Array;
    /** Onset strength in the bass only (< 200 Hz), for the bar. */
    bass: Float32Array;
    /** Time (s) of frame 0. */
    t0: number;
}

/** Onset strength envelope (all bands and bass only) of a mono signal. */
function onsetEnvelope(signal: Float32Array, rate: number): Onsets {
    const hop = rate / FPS;
    const frames = Math.max(0, Math.floor((signal.length - FRAME) / hop));
    const window = new Float64Array(FRAME).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FRAME));
    const bins = FRAME / 2;
    const bassBins = Math.max(2, Math.round((200 / rate) * FRAME));
    const weights = bandWeights(bins, rate / FRAME);
    const env = new Float32Array(frames);
    const bass = new Float32Array(frames);
    let previous = new Float64Array(bins);
    const re = new Float64Array(FRAME);
    const im = new Float64Array(FRAME);
    for (let f = 0; f < frames; f++) {
        const start = Math.round(f * hop);
        for (let i = 0; i < FRAME; i++) {
            re[i] = signal[start + i] * window[i];
            im[i] = 0;
        }
        fft(re, im);
        const current = new Float64Array(bins);
        let flux = 0;
        let bassFlux = 0;
        for (let k = 1; k < bins; k++) {
            const mag = Math.log1p(1000 * Math.hypot(re[k], im[k]));
            current[k] = mag;
            const rise = mag - previous[k];
            if (rise > 0) {
                flux += rise * weights[k];
                if (k < bassBins) bassFlux += rise;
            }
        }
        env[f] = flux;
        bass[f] = bassFlux;
        previous = current;
    }
    /** Removes the slow trend (0.5 s mean) and scales to standard deviation units. */
    const normalize = (series: Float32Array) => {
        const span = Math.round(FPS * 0.25);
        const out = new Float32Array(series.length);
        let sum = 0;
        for (let i = 0; i < series.length + span; i++) {
            if (i < series.length) sum += series[i];
            if (i - 2 * span - 1 >= 0) sum -= series[i - 2 * span - 1];
            const center = i - span;
            if (center >= 0 && center < series.length) {
                const count = Math.min(series.length, i + 1) - Math.max(0, i - 2 * span);
                out[center] = Math.max(0, series[center] - sum / count);
            }
        }
        let mean = 0;
        for (const v of out) mean += v;
        mean /= out.length || 1;
        let variance = 0;
        for (const v of out) variance += (v - mean) ** 2;
        const sd = Math.sqrt(variance / (out.length || 1)) || 1;
        for (let i = 0; i < out.length; i++) out[i] /= sd;
        return out;
    };
    // Frame f covers [f·hop, f·hop + FRAME): its onset is placed at the centre of the window.
    return { env: normalize(env), bass: normalize(bass), t0: FRAME / 2 / rate };
}

/** Autocorrelation of the series for lags up to maxLag (in frames). */
function autocorrelation(env: Float32Array, from: number, to: number, maxLag: number): Float64Array {
    const ac = new Float64Array(maxLag + 1);
    for (let lag = 1; lag <= maxLag; lag++) {
        let sum = 0;
        for (let i = from + lag; i < to; i++) sum += env[i] * env[i - lag];
        ac[lag] = sum / Math.max(1, to - from - lag);
    }
    return ac;
}

/** Beat period in frames for a BPM. */
const bpmToLag = (bpm: number) => (60 * FPS) / bpm;

/**
 * Period (in frames, fractional) of the [from, to) section. Each lag's score adds its double and its half,
 * so the real beat beats its multiples (double or half tempo errors). `around`, when given, favours a
 * nearby period (continuity between sections).
 */
function estimatePeriod(env: Float32Array, from: number, to: number, around?: number): number {
    const minLag = Math.floor(bpmToLag(MAX_BPM));
    const maxLag = Math.ceil(bpmToLag(MIN_BPM));
    const ac = autocorrelation(env, from, to, maxLag * 2 + 2);
    /** Autocorrelation at a fractional lag (linear interpolation). */
    const at = (lag: number) => {
        const lo = Math.floor(lag);
        const frac = lag - lo;
        return ac[lo] * (1 - frac) + (ac[lo + 1] ?? 0) * frac;
    };
    let bestLag = bpmToLag(120);
    let bestScore = -Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
        const bpm = (60 * FPS) / lag;
        // Soft (log-normal) preference for ~115 BPM and, if there is a previous section, for its tempo.
        const prior = Math.exp(-0.5 * (Math.log2(bpm / 115) / 1.2) ** 2);
        const continuity = around ? Math.exp(-0.5 * (Math.log2(lag / around) / 0.18) ** 2) : 1;
        const score = (at(lag) + 0.5 * at(lag * 2) + 0.25 * at(lag / 2)) * prior * (0.35 + 0.65 * continuity);
        if (score > bestScore) {
            bestScore = score;
            bestLag = lag;
        }
    }
    // Fractional peak: a parabola through the three neighbouring lags.
    const a = at(bestLag - 1);
    const b = at(bestLag);
    const c = at(bestLag + 1);
    const denom = a - 2 * b + c;
    return denom < 0 ? bestLag + (0.5 * (a - c)) / denom : bestLag;
}

/**
 * Local periods (frames) of every frame, estimated per section: from the section centred on it, the one
 * ending at it and the one starting at it. At a tempo change the centred one mixes both; the before and
 * after ones are each right on their side of the change.
 */
function localPeriods(env: Float32Array): Float32Array[] {
    const global = estimatePeriod(env, 0, env.length);
    const windowFrames = LOCAL_WINDOW_S * FPS;
    if (env.length <= windowFrames * 1.5) return [new Float32Array(env.length).fill(global)];
    const hop = LOCAL_HOP_S * FPS;
    const values: number[] = [];
    let previous = global;
    for (let start = 0; start + windowFrames <= env.length; start += hop) {
        previous = estimatePeriod(env, start, start + windowFrames, previous);
        values.push(previous);
    }
    const last = values.length - 1;
    /** Section period by index, clamped to the known sections. */
    const pick = (k: number) => values[Math.min(last, Math.max(0, k))];
    const centered = new Float32Array(env.length);
    const before = new Float32Array(env.length);
    const after = new Float32Array(env.length);
    for (let f = 0; f < env.length; f++) {
        centered[f] = pick(Math.round((f - windowFrames / 2) / hop));
        before[f] = pick(Math.floor((f - windowFrames) / hop));
        after[f] = pick(Math.ceil(f / hop));
    }
    return [centered, before, after];
}

/** Dynamic programming: the best sequence of beats (frames) given the local period. */
function trackBeats(env: Float32Array, periods: Float32Array[]): number[] {
    const n = env.length;
    const score = new Float64Array(n);
    const back = new Int32Array(n).fill(-1);
    for (let t = 0; t < n; t++) {
        const candidates = periods.map((series) => series[t]);
        const from = Math.max(0, Math.round(t - 2 * Math.max(...candidates)));
        const to = Math.round(t - Math.min(...candidates) / 2);
        let best = 0;
        let bestFrom = -1;
        for (let p = from; p <= to; p++) {
            // The distance to the previous beat is compared with whichever period fits it best.
            let penalty = Infinity;
            for (const period of candidates) penalty = Math.min(penalty, Math.log((t - p) / period) ** 2);
            const candidate = score[p] - TIGHTNESS * penalty;
            if (bestFrom < 0 || candidate > best) {
                best = candidate;
                bestFrom = p;
            }
        }
        score[t] = env[t] + (bestFrom >= 0 ? best : 0);
        back[t] = bestFrom;
    }
    // The end: the best of the last frames; backtrack from there.
    const tail = Math.round(periods[0][n - 1] ?? FPS / 2);
    let end = n - 1;
    for (let t = Math.max(0, n - tail); t < n; t++) if (score[t] > score[end]) end = t;
    const beats: number[] = [];
    for (let t = end; t >= 0; t = back[t]) {
        beats.push(t);
        if (back[t] < 0) break;
    }
    return beats.reverse();
}

/**
 * Moves a beat to the exact start of its onset: where energy rises the most (~3 ms windows) within 35 ms.
 * Without a clear onset (silence) it stays where it was.
 */
function refine(signal: Float32Array, rate: number, time: number): number {
    const step = Math.max(1, Math.round(rate * 0.0029));
    const reach = Math.round(0.035 * rate);
    const center = Math.round(time * rate);
    const from = Math.max(step, center - reach);
    const to = Math.min(signal.length - 2 * step, center + reach);
    /** Energy of one ~3 ms window. */
    const energy = (at: number) => {
        let sum = 0;
        for (let i = at; i < at + step; i++) sum += signal[i] * signal[i];
        return sum;
    };
    let bestRise = 0;
    let bestAt = -1;
    let floor = 0;
    let count = 0;
    for (let at = from; at < to; at += step) {
        const rise = energy(at) - energy(at - step);
        floor += Math.abs(rise);
        count += 1;
        if (rise > bestRise) {
            bestRise = rise;
            bestAt = at;
        }
    }
    const typical = floor / Math.max(1, count);
    return bestAt >= 0 && bestRise > typical * 4 ? bestAt / rate : time;
}

/** Beat grid of a song (mono samples and their sample rate); null if it is too short or unclear. */
export function analyzeBeats(samples: Float32Array, sampleRate: number): BeatGrid | null {
    const { signal, rate } = downsample(samples, sampleRate);
    if (signal.length < rate * 3) return null;
    const onsets = onsetEnvelope(signal, rate);
    if (onsets.env.length < FPS * 3) return null;
    const periods = localPeriods(onsets.env);
    const frames = trackBeats(onsets.env, periods);
    if (frames.length < 4) return null;
    const beats = frames.map((f) => refine(signal, rate, onsets.t0 + f / FPS));
    // Typical tempo: median of the intervals.
    const gaps = beats.slice(1).map((t, i) => t - beats[i]).sort((a, b) => a - b);
    const bpm = 60 / gaps[Math.floor(gaps.length / 2)];
    // Bar: the phase with the most bass onset strength starts each bar.
    const votes = [0, 0, 0, 0];
    frames.forEach((f, i) => {
        let strongest = 0;
        for (let k = Math.max(0, f - 2); k <= Math.min(onsets.bass.length - 1, f + 2); k++) strongest = Math.max(strongest, onsets.bass[k]);
        votes[i % 4] += strongest;
    });
    const downbeat = votes.indexOf(Math.max(...votes));
    return { beats, bpm, downbeat };
}

// Real-time tracking, for when there is no prior analysis (it has not finished yet, or the file could not
// be decoded). It receives the onset strength of each analyser reading and runs a PLL-like beat clock: it
// predicts the next beat and nudges the phase with every onset that lands near the prediction. Without
// onsets (silence, passages without drums) it keeps the same pace; if the tempo changes, it relocks within
// a few beats.

/** Onset strength of a spectrum in dB (getFloatFrequencyData): how much it rises over the previous one. */
export class OnsetMeter {
    private previous: Float32Array | null = null;
    private weights: Float64Array | null = null;

    /** `binHz`: width of each spectrum bin (sample rate / FFT size). */
    constructor(private readonly binHz: number) {}

    /** Measures the band-weighted rise of a new spectrum over the previous one. */
    measure(db: Float32Array): number {
        const previous = this.previous && this.previous.length === db.length ? this.previous : null;
        if (!this.weights || this.weights.length !== db.length) this.weights = bandWeights(db.length, this.binHz);
        let flux = 0;
        for (let k = 1; k < db.length; k++) {
            const level = Math.max(db[k], -100);
            const rise = previous ? (level - previous[k]) / 20 : 0;
            if (rise > 0) flux += rise * this.weights[k];
        }
        const next = previous ?? new Float32Array(db.length);
        for (let k = 0; k < db.length; k++) next[k] = Math.max(db[k], -100);
        this.previous = next;
        return flux;
    }
}

const LIVE_HISTORY_S = 8;
const LIVE_ESTIMATE_EVERY = FPS / 2;
const LIVE_MIN_HISTORY = 3 * FPS;
// Short window: it sees a tempo change earlier and locks the phase to the most recent material.
const LIVE_SHORT = 2 * FPS;
// Window around the predicted beat within which an onset corrects the phase (fraction of the period).
const LIVE_CAPTURE = 0.18;

/** Real-time PLL-style beat clock fed with onset strengths. */
export class BeatTracker {
    /** Current tempo (0 until locked). */
    bpm = 0;
    private env: number[] = [];
    /** Time (s) of frame env[0]. */
    private envStart = 0;
    private lastTime = -1;
    private lastValue = 0;
    private mean = 0;
    private spread = 0;
    private peakLevel = 0;
    private recent: { time: number; value: number }[] = [];
    private sinceEstimate = 0;
    private period = 0;
    private candidate = 0;
    private candidateHits = 0;
    private nextBeat = 0;
    private emitted: number[] = [];
    private pending: number[] = [];

    /** Onset strength measured at `time` (s, in song time). */
    push(time: number, strength: number): void {
        // A jump (backwards: the song restarted; forwards: a long gap) starts from scratch.
        if (this.lastTime >= 0 && (time < this.lastTime - 0.5 || time - this.lastTime > 1)) this.reset();
        if (this.lastTime >= 0 && time <= this.lastTime) return;
        // Without the slow trend (~1 s) and relative to the recent spread (~4 s).
        const first = this.lastTime < 0;
        const dt = first ? 0 : time - this.lastTime;
        this.mean += (strength - this.mean) * (first ? 1 : 1 - Math.exp(-dt / 1));
        const value = Math.max(0, strength - this.mean);
        this.spread += (value - this.spread) * (first ? 1 : 1 - Math.exp(-dt / 4));
        this.record(time, value);
        this.detectPeak(time, value);
        this.lastTime = time;
        this.lastValue = value;
        if (this.sinceEstimate >= LIVE_ESTIMATE_EVERY && this.env.length >= LIVE_MIN_HISTORY) {
            this.sinceEstimate = 0;
            this.estimate(time);
        }
        if (!this.period) return;
        while (this.nextBeat <= time) {
            this.emitted.push(this.nextBeat);
            this.pending.push(this.nextBeat);
            if (this.emitted.length > 8) this.emitted.shift();
            this.nextBeat += this.period;
        }
    }

    /** Beats that have passed since the last call. */
    takeBeats(): number[] {
        const beats = this.pending;
        this.pending = [];
        return beats;
    }

    /** The last beat at or before `time` and the period (s), as predicted by the clock; null when not locked. */
    beatAt(time: number): { beat: number; period: number } | null {
        if (!this.period) return null;
        let beat = this.nextBeat;
        for (let i = this.emitted.length - 1; i >= 0 && beat > time; i--) beat = this.emitted[i];
        // Beyond what is known (forwards or backwards), at the same pace.
        const steps = Math.floor((time - beat) / this.period);
        return { beat: beat + steps * this.period, period: this.period };
    }

    /** Forgets everything (after a jump in song time). */
    private reset(): void {
        this.env = [];
        this.recent = [];
        this.period = 0;
        this.bpm = 0;
        this.emitted = [];
        this.pending = [];
        this.lastTime = -1;
        this.candidateHits = 0;
        this.sinceEstimate = 0;
    }

    /** Stores the series at 100 frames per second, interpolating between readings. */
    private record(time: number, value: number): void {
        if (!this.env.length) {
            this.envStart = time;
            this.env.push(value);
            return;
        }
        const target = Math.floor((time - this.envStart) * FPS);
        for (let f = this.env.length; f <= target; f++) {
            const at = this.envStart + f / FPS;
            const mix = Math.min(1, Math.max(0, (at - this.lastTime) / (time - this.lastTime)));
            this.env.push(this.lastValue + (value - this.lastValue) * mix);
            this.sinceEstimate += 1;
        }
        const excess = this.env.length - LIVE_HISTORY_S * FPS;
        if (excess > 0) {
            this.env.splice(0, excess);
            this.envStart += excess / FPS;
        }
    }

    /** A clear local maximum is an onset: it corrects the phase if it lands near the predicted beat. */
    private detectPeak(time: number, value: number): void {
        this.recent.push({ time, value });
        if (this.recent.length > 3) this.recent.shift();
        if (this.recent.length < 3) return;
        const [a, b, c] = this.recent;
        if (!(b.value > a.value && b.value >= c.value && b.value > this.spread * 2.5)) return;
        this.peakLevel = Math.max(b.value, this.peakLevel * 0.97);
        if (!this.period) return;
        // Instant of the maximum, from a parabola through the three points.
        const denom = a.value - 2 * b.value + c.value;
        const shift = denom < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a.value - c.value)) / denom)) : 0;
        const peak = b.time + shift * ((c.time - a.time) / 2);
        const previous = this.emitted[this.emitted.length - 1] ?? this.nextBeat - this.period;
        const nearest = Math.abs(peak - previous) < Math.abs(peak - this.nextBeat) ? previous : this.nextBeat;
        const error = peak - nearest;
        if (Math.abs(error) > this.period * LIVE_CAPTURE) return;
        // Strong onsets (the kick) lead; weak ones (hats, fills) barely move the phase.
        const weight = Math.min(1, (b.value / Math.max(this.peakLevel, 1e-9)) ** 2);
        this.nextBeat += error * 0.35 * weight;
        this.period += error * 0.04 * weight;
    }

    /** Re-estimates the tempo every half second and relocks on a confirmed change. */
    private estimate(time: number): void {
        const env = Float32Array.from(this.env);
        const end = env.length;
        const from = Math.max(0, end - LOCAL_WINDOW_S * FPS);
        // Silence or no drums: the clock runs on its own, without re-estimating from noise.
        let recent = 0;
        let whole = 0;
        for (let i = from; i < end; i++) {
            whole += env[i];
            if (i >= end - 2 * FPS) recent += env[i];
        }
        if (recent / (2 * FPS) < (whole / (end - from)) * 0.25) return;
        const shortFrom = Math.max(0, end - LIVE_SHORT);
        const seconds = estimatePeriod(env, this.candidateHits ? shortFrom : from, end, this.period ? this.period * FPS : undefined) / FPS;
        if (!this.period) {
            this.lock(seconds, env, time);
            return;
        }
        const fresh = estimatePeriod(env, shortFrom, end) / FPS;
        if (Math.abs(seconds / this.period - 1) < 0.04 && Math.abs(fresh / this.period - 1) < 0.04) {
            this.period += (seconds - this.period) * 0.2;
            this.candidateHits = 0;
        } else if (this.candidateHits && Math.abs(fresh / this.candidate - 1) < 0.04) {
            // Two estimates in a row agree: the tempo has really changed.
            this.candidateHits += 1;
            if (this.candidateHits >= 2) this.lock(fresh, env, time);
        } else {
            this.candidate = fresh;
            this.candidateHits = 1;
        }
        this.bpm = 60 / this.period;
    }

    /** Locks tempo and phase: the phase is the one that gathers the most onset strength in the short window. */
    private lock(seconds: number, env: Float32Array, time: number): void {
        const period = seconds * FPS;
        const end = env.length - 1;
        let bestPhase = 0;
        let bestScore = -Infinity;
        for (let phase = 0; phase < period; phase++) {
            let score = 0;
            for (let at = end - phase; at >= Math.max(0, end - LIVE_SHORT); at -= period) {
                const i = Math.round(at);
                score += Math.max(env[i - 1] ?? 0, env[i], env[i + 1] ?? 0);
            }
            if (score > bestScore) {
                bestScore = score;
                bestPhase = phase;
            }
        }
        this.period = seconds;
        this.bpm = 60 / seconds;
        this.candidateHits = 0;
        const last = this.envStart + (end - bestPhase) / FPS;
        this.emitted = [last];
        this.nextBeat = last + seconds;
        while (this.nextBeat <= time) {
            this.emitted.push(this.nextBeat);
            this.nextBeat += seconds;
        }
        this.emitted = this.emitted.slice(-8);
    }
}
