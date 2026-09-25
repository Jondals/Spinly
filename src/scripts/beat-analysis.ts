// Análisis del pulso de una canción completa, sin DOM ni React: lo ejecuta un Web Worker
// (beat-worker.ts) y los tests. De la señal de audio saca la rejilla de tiempos:
// 1. Ataques (onsets): flujo espectral en escala logarítmica, a 100 fotogramas por segundo.
// 2. Tempo: autocorrelación de los ataques entre 70 y 180 BPM, con preferencia suave por los tempos
//    habituales y corrección de doble y mitad de tempo; también por tramos, para seguir cambios.
// 3. Tiempos: programación dinámica (Ellis, 2007): cada tiempo cae en un ataque fuerte y a una
//    distancia del anterior cercana al periodo. En silencios sigue marcando al mismo paso.
// 4. Ajuste fino: cada tiempo se lleva al instante exacto del ataque (resolución de ~3 ms).
// 5. Compás: el primer tiempo es el de la fase (de 4) con más ataque en los graves.

export interface BeatGrid {
    /** Tiempos de pulso en segundos desde el inicio de la canción. */
    beats: number[];
    bpm: number;
    /** Índice (0-3) del primer tiempo que abre compás: son primeros de compás downbeat, downbeat + 4… */
    downbeat: number;
}

const TARGET_RATE = 11025;
const FRAME = 512;
const FPS = 100;
const MIN_BPM = 70;
const MAX_BPM = 180;
// Rigidez del paso entre tiempos en la programación dinámica: más alto, más regular.
const TIGHTNESS = 80;
// Ventana y paso del tempo por tramos (s).
const LOCAL_WINDOW_S = 4;
const LOCAL_HOP_S = 1;

// Peso de cada banda en la fuerza de ataque (subida media por casilla de la banda): el bombo y el bajo
// marcan el pulso; los platos y los hats, que muchas veces van a contratiempo, cuentan poco.
const BAND_EDGES_HZ = [200, 2000];
const BAND_WEIGHTS = [1, 0.5, 0.2];

/** Peso de cada casilla del espectro según su banda. */
function bandWeights(bins: number, binHz: number): Float64Array {
    const bandOf = (k: number) => BAND_EDGES_HZ.filter((edge) => k * binHz >= edge).length;
    const counts = BAND_WEIGHTS.map(() => 0);
    for (let k = 1; k < bins; k++) counts[bandOf(k)] += 1;
    const weights = new Float64Array(bins);
    for (let k = 1; k < bins; k++) weights[k] = BAND_WEIGHTS[bandOf(k)] / Math.max(1, counts[bandOf(k)]);
    return weights;
}

/** FFT compleja radix-2 en el sitio (n potencia de 2). */
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

/** Mono a ~11 kHz: promedio por bloques (filtra lo que no cabe en la frecuencia nueva). */
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
    /** Fuerza de ataque normalizada, un valor cada 10 ms. */
    env: Float32Array;
    /** Ataque solo en graves (< 200 Hz), para el compás. */
    bass: Float32Array;
    /** Segundos del fotograma 0. */
    t0: number;
}

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
    // Sin la tendencia lenta (media de 0,5 s) y en unidades de desviación típica.
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
    // El fotograma f cubre [f·hop, f·hop + FRAME): su ataque se sitúa en el centro de la ventana.
    return { env: normalize(env), bass: normalize(bass), t0: FRAME / 2 / rate };
}

/** Autocorrelación de la serie para los retardos pedidos (en fotogramas). */
function autocorrelation(env: Float32Array, from: number, to: number, maxLag: number): Float64Array {
    const ac = new Float64Array(maxLag + 1);
    for (let lag = 1; lag <= maxLag; lag++) {
        let sum = 0;
        for (let i = from + lag; i < to; i++) sum += env[i] * env[i - lag];
        ac[lag] = sum / Math.max(1, to - from - lag);
    }
    return ac;
}

const bpmToLag = (bpm: number) => (60 * FPS) / bpm;

/**
 * Periodo (en fotogramas, con decimales) del tramo [from, to). La puntuación de cada retardo suma
 * su doble y su mitad: así el pulso real gana a sus múltiplos (errores de doble o mitad de tempo).
 * `around`, si se da, favorece un periodo cercano (continuidad entre tramos).
 */
function estimatePeriod(env: Float32Array, from: number, to: number, around?: number): number {
    const minLag = Math.floor(bpmToLag(MAX_BPM));
    const maxLag = Math.ceil(bpmToLag(MIN_BPM));
    const ac = autocorrelation(env, from, to, maxLag * 2 + 2);
    const at = (lag: number) => {
        const lo = Math.floor(lag);
        const frac = lag - lo;
        return ac[lo] * (1 - frac) + (ac[lo + 1] ?? 0) * frac;
    };
    let bestLag = bpmToLag(120);
    let bestScore = -Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
        const bpm = (60 * FPS) / lag;
        // Preferencia suave (log-normal) por ~115 BPM y, si hay un tramo anterior, por su tempo.
        const prior = Math.exp(-0.5 * (Math.log2(bpm / 115) / 1.2) ** 2);
        const continuity = around ? Math.exp(-0.5 * (Math.log2(lag / around) / 0.18) ** 2) : 1;
        const score = (at(lag) + 0.5 * at(lag * 2) + 0.25 * at(lag / 2)) * prior * (0.35 + 0.65 * continuity);
        if (score > bestScore) {
            bestScore = score;
            bestLag = lag;
        }
    }
    // Pico con decimales: parábola por los tres retardos vecinos.
    const a = at(bestLag - 1);
    const b = at(bestLag);
    const c = at(bestLag + 1);
    const denom = a - 2 * b + c;
    return denom < 0 ? bestLag + (0.5 * (a - c)) / denom : bestLag;
}

/**
 * Periodos locales (fotogramas) de cada fotograma, estimados por tramos: el del tramo centrado en él,
 * el del que acaba en él y el del que empieza en él. En un cambio de tempo el centrado mezcla los dos;
 * el de antes y el de después aciertan cada uno a un lado del cambio.
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

/** Programación dinámica: la mejor sucesión de tiempos (fotogramas) dado el periodo local. */
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
            // La distancia al anterior se compara con el periodo que mejor le encaje.
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
    // El final: el mejor de los últimos fotogramas; de ahí hacia atrás.
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
 * Lleva el tiempo al inicio exacto del ataque: donde más sube la energía (ventanas de ~3 ms) a
 * menos de 35 ms. Si no hay ataque claro (silencio), se queda donde estaba.
 */
function refine(signal: Float32Array, rate: number, time: number): number {
    const step = Math.max(1, Math.round(rate * 0.0029));
    const reach = Math.round(0.035 * rate);
    const center = Math.round(time * rate);
    const from = Math.max(step, center - reach);
    const to = Math.min(signal.length - 2 * step, center + reach);
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

/** Rejilla de pulso de una canción (muestras mono y su frecuencia). */
export function analyzeBeats(samples: Float32Array, sampleRate: number): BeatGrid | null {
    const { signal, rate } = downsample(samples, sampleRate);
    if (signal.length < rate * 3) return null;
    const onsets = onsetEnvelope(signal, rate);
    if (onsets.env.length < FPS * 3) return null;
    const periods = localPeriods(onsets.env);
    const frames = trackBeats(onsets.env, periods);
    if (frames.length < 4) return null;
    const beats = frames.map((f) => refine(signal, rate, onsets.t0 + f / FPS));
    // Tempo típico: mediana de los intervalos.
    const gaps = beats.slice(1).map((t, i) => t - beats[i]).sort((a, b) => a - b);
    const bpm = 60 / gaps[Math.floor(gaps.length / 2)];
    // Compás: la fase con más ataque en los graves abre cada compás.
    const votes = [0, 0, 0, 0];
    frames.forEach((f, i) => {
        let strongest = 0;
        for (let k = Math.max(0, f - 2); k <= Math.min(onsets.bass.length - 1, f + 2); k++) strongest = Math.max(strongest, onsets.bass[k]);
        votes[i % 4] += strongest;
    });
    const downbeat = votes.indexOf(Math.max(...votes));
    return { beats, bpm, downbeat };
}

// Seguimiento en tiempo real, para cuando no hay análisis previo (aún no ha terminado o el archivo
// no se pudo decodificar). Recibe la fuerza de ataque de cada lectura del analizador y lleva un
// reloj de pulso tipo PLL: predice el siguiente tiempo y corrige la fase poco a poco con cada ataque
// que cae cerca de lo previsto. Sin ataques (silencio, pasajes sin percusión) sigue marcando al
// mismo paso; si el tempo cambia, en pocos tiempos lo vuelve a enganchar.

/** Fuerza de ataque de un espectro en dB (getFloatFrequencyData): lo que sube respecto al anterior. */
export class OnsetMeter {
    private previous: Float32Array | null = null;
    private weights: Float64Array | null = null;

    /** `binHz`: ancho de cada casilla del espectro (frecuencia de muestreo / tamaño de la FFT). */
    constructor(private readonly binHz: number) {}

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
// Ventana corta: ve antes un cambio de tempo y engancha la fase con lo más reciente.
const LIVE_SHORT = 2 * FPS;
// Ventana alrededor del tiempo previsto dentro de la cual un ataque corrige la fase (fracción del periodo).
const LIVE_CAPTURE = 0.18;

export class BeatTracker {
    /** Tempo actual (0 hasta enganchar). */
    bpm = 0;
    private env: number[] = [];
    /** Segundos del fotograma env[0]. */
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

    /** Fuerza de ataque medida en el instante `time` (s, en tiempo de la canción). */
    push(time: number, strength: number): void {
        // Un salto (atrás: la canción vuelve a empezar; adelante: un corte largo) empieza de cero.
        if (this.lastTime >= 0 && (time < this.lastTime - 0.5 || time - this.lastTime > 1)) this.reset();
        if (this.lastTime >= 0 && time <= this.lastTime) return;
        // Sin la tendencia lenta (~1 s) y relativo a la dispersión reciente (~4 s).
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

    /** Tiempos que ya han pasado desde la última llamada. */
    takeBeats(): number[] {
        const beats = this.pending;
        this.pending = [];
        return beats;
    }

    /** El último tiempo en o antes de `time` y el periodo (s), previstos por el reloj; null sin enganche. */
    beatAt(time: number): { beat: number; period: number } | null {
        if (!this.period) return null;
        let beat = this.nextBeat;
        for (let i = this.emitted.length - 1; i >= 0 && beat > time; i--) beat = this.emitted[i];
        // Fuera de lo conocido (hacia delante o hacia atrás), al mismo paso.
        const steps = Math.floor((time - beat) / this.period);
        return { beat: beat + steps * this.period, period: this.period };
    }

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

    /** Guarda la serie a 100 fotogramas por segundo, interpolando entre lecturas. */
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

    /** Un máximo local claro es un ataque: corrige la fase si cae cerca del tiempo previsto. */
    private detectPeak(time: number, value: number): void {
        this.recent.push({ time, value });
        if (this.recent.length > 3) this.recent.shift();
        if (this.recent.length < 3) return;
        const [a, b, c] = this.recent;
        if (!(b.value > a.value && b.value >= c.value && b.value > this.spread * 2.5)) return;
        this.peakLevel = Math.max(b.value, this.peakLevel * 0.97);
        if (!this.period) return;
        // Instante del máximo con una parábola por los tres puntos.
        const denom = a.value - 2 * b.value + c.value;
        const shift = denom < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a.value - c.value)) / denom)) : 0;
        const peak = b.time + shift * ((c.time - a.time) / 2);
        const previous = this.emitted[this.emitted.length - 1] ?? this.nextBeat - this.period;
        const nearest = Math.abs(peak - previous) < Math.abs(peak - this.nextBeat) ? previous : this.nextBeat;
        const error = peak - nearest;
        if (Math.abs(error) > this.period * LIVE_CAPTURE) return;
        // Los ataques fuertes (el bombo) mandan; los flojos (hats, adornos) apenas mueven la fase.
        const weight = Math.min(1, (b.value / Math.max(this.peakLevel, 1e-9)) ** 2);
        this.nextBeat += error * 0.35 * weight;
        this.period += error * 0.04 * weight;
    }

    private estimate(time: number): void {
        const env = Float32Array.from(this.env);
        const end = env.length;
        const from = Math.max(0, end - LOCAL_WINDOW_S * FPS);
        // Silencio o sin percusión: el reloj sigue solo, sin reestimar con ruido.
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
            // Dos estimaciones seguidas de acuerdo: el tempo ha cambiado de verdad.
            this.candidateHits += 1;
            if (this.candidateHits >= 2) this.lock(fresh, env, time);
        } else {
            this.candidate = fresh;
            this.candidateHits = 1;
        }
        this.bpm = 60 / this.period;
    }

    /** Engancha tempo y fase: la fase es la que más ataque reúne en la ventana corta. */
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
