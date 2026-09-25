import { analyzeBeats, BeatTracker, fft, OnsetMeter } from './beat-analysis';

// Canciones sintéticas con los tiempos conocidos al milisegundo: bombo en cada tiempo, hats en las
// corcheas (con swing opcional), caja en los tiempos pares y un acorde de fondo constante.
const RATE = 22050;
const DURATION = 20;

interface SongOptions {
    swing?: number;
    silence?: [number, number];
    reverb?: number;
    accentEvery?: number;
}

function grid(bpm: number, from = 0, to = DURATION): number[] {
    const list: number[] = [];
    for (let t = from; t < to - 1e-6; t += 60 / bpm) list.push(t);
    return list;
}

function render(beats: number[], { swing = 0, silence, reverb = 0, accentEvery = 4 }: SongOptions = {}): Float32Array {
    const n = RATE * DURATION;
    const out = new Float32Array(n);
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    const add = (t0: number, fn: (x: number) => number, len: number) => {
        const start = Math.round(t0 * RATE);
        for (let i = 0; i < len * RATE && start + i < n; i++) out[start + i] += fn(i / RATE);
    };
    beats.forEach((t, k) => {
        if (silence && t >= silence[0] && t < silence[1]) return;
        const gain = k % accentEvery === 0 ? 1.4 : 1;
        add(t, (x) => gain * Math.exp(-x * 14) * Math.sin(2 * Math.PI * (48 + 40 * Math.exp(-x * 35)) * x), 0.4);
        const next = beats[k + 1] ?? t + (t - (beats[k - 1] ?? t - 0.5));
        add(t + (next - t) * (0.5 + swing), () => rnd() * 0.18, 0.03);
        if (k % 2 === 1) add(t, (x) => rnd() * 0.35 * Math.exp(-x * 25), 0.15);
    });
    for (let i = 0; i < n; i++) out[i] += 0.08 * Math.sin((2 * Math.PI * 220 * i) / RATE) + 0.05 * Math.sin((2 * Math.PI * 330 * i) / RATE);
    if (reverb > 0) {
        const wet = new Float32Array(n);
        const taps = 60;
        for (let j = 1; j <= taps; j++) {
            const delay = Math.round((j / taps) * reverb * RATE * (0.6 + (0.4 * ((j * 7919) % 13)) / 13));
            const gain = 0.5 * Math.exp((-3 * delay) / (reverb * RATE)) * (j % 2 ? 1 : -1);
            for (let i = delay; i < n; i++) wet[i] += out[i - delay] * gain * 0.4;
        }
        for (let i = 0; i < n; i++) out[i] += wet[i];
    }
    return out;
}

/** Desfase (ms) de cada tiempo real desde `from` s con el tiempo detectado más cercano; a más de 150 ms, perdido. */
function offsets(detected: number[], truth: number[], from = 2): { mean: number; max: number; missed: number } {
    const errors: number[] = [];
    let missed = 0;
    for (const t of truth.filter((b) => b >= from && b <= DURATION - 0.5)) {
        const nearest = detected.reduce((best, d) => (Math.abs(d - t) < Math.abs(best - t) ? d : best), Infinity);
        const error = Math.abs(nearest - t) * 1000;
        if (error > 150) missed += 1;
        else errors.push(error);
    }
    return { mean: errors.reduce((a, v) => a + v, 0) / Math.max(1, errors.length), max: Math.max(0, ...errors), missed };
}

/** Tempo de los tiempos detectados dentro de [from, to): mediana de los intervalos. */
function tempoBetween(beats: number[], from: number, to: number): number {
    const inside = beats.filter((t) => t >= from && t < to);
    const gaps = inside.slice(1).map((t, i) => t - inside[i]).sort((a, b) => a - b);
    return 60 / gaps[Math.floor(gaps.length / 2)];
}

/**
 * Como la app: 60 lecturas por segundo de un analizador (ventana de ~46 ms, suavizado 0,55) y su
 * fuerza de ataque al seguidor, fechada en el centro de la ventana.
 */
function live(samples: Float32Array): { beats: number[]; bpm: number } {
    const size = 1024;
    const window = Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size));
    const smoothed = new Float64Array(size / 2);
    const db = new Float32Array(size / 2);
    const re = new Float64Array(size);
    const im = new Float64Array(size);
    const meter = new OnsetMeter(RATE / size);
    const tracker = new BeatTracker();
    const beats: number[] = [];
    for (let frame = 1; ; frame++) {
        const end = Math.round((frame / 60) * RATE);
        if (end > samples.length) break;
        if (end < size) continue;
        for (let i = 0; i < size; i++) {
            re[i] = samples[end - size + i] * window[i];
            im[i] = 0;
        }
        fft(re, im);
        for (let k = 0; k < size / 2; k++) {
            smoothed[k] = 0.55 * smoothed[k] + 0.45 * (Math.hypot(re[k], im[k]) / size);
            db[k] = 20 * Math.log10(smoothed[k] + 1e-12);
        }
        tracker.push((end - size / 2) / RATE, meter.measure(db));
        beats.push(...tracker.takeBeats());
    }
    return { beats, bpm: tracker.bpm };
}

// Cada caso: los tiempos reales y el tempo de cada tramo [desde, hasta, BPM].
const cases: { name: string; beats: number[]; options?: SongOptions; tempos: [number, number, number][] }[] = [
    { name: '120 BPM exactos', beats: grid(120), tempos: [[0, 20, 120]] },
    { name: '95 BPM con swing', beats: grid(95), options: { swing: 0.17 }, tempos: [[0, 20, 95]] },
    { name: 'cambio de 100 a 130 BPM', beats: [...grid(100, 0, 10), ...grid(130, 10)], tempos: [[0, 9.5, 100], [12, 20, 130]] },
    { name: 'pausa de 4 s sin percusión', beats: grid(120), options: { silence: [8, 12] }, tempos: [[0, 20, 120]] },
    { name: 'reverberación larga', beats: grid(110), options: { reverb: 1.5 }, tempos: [[0, 20, 110]] },
];

describe('análisis previo de la canción', () => {
    it.each(cases)('$name: tempo, fase y desfase máximo', ({ beats, options, tempos }) => {
        const result = analyzeBeats(render(beats, options), RATE);
        expect(result).not.toBeNull();
        if (!result) return;
        for (const [from, to, bpm] of tempos) expect(Math.abs(tempoBetween(result.beats, from, to) - bpm)).toBeLessThan(1.5);
        if (tempos.length === 1) expect(Math.abs(result.bpm - tempos[0][2])).toBeLessThan(1.5);
        const score = offsets(result.beats, beats);
        expect(score.missed).toBe(0);
        expect(score.mean).toBeLessThan(15);
        expect(score.max).toBeLessThan(40);
    });

    it('el primero de compás es el tiempo acentuado', () => {
        // Acento en los tiempos 2, 6, 10…: la canción empieza a mitad de compás.
        const beats = grid(120).slice(1);
        const result = analyzeBeats(render(beats), RATE);
        expect(result).not.toBeNull();
        if (!result) return;
        const accented = beats.filter((_, k) => k % 4 === 0);
        for (let i = result.downbeat; i < result.beats.length; i += 4) {
            expect(accented.some((t) => Math.abs(t - result.beats[i]) < 0.04)).toBe(true);
        }
    });

    it('rechaza lo demasiado corto', () => {
        expect(analyzeBeats(new Float32Array(RATE), RATE)).toBeNull();
    });
});

describe('seguidor en tiempo real', () => {
    it.each(cases)('$name: tempo y desfase', ({ beats, options, tempos }) => {
        const result = live(render(beats, options));
        const [, , finalBpm] = tempos[tempos.length - 1];
        expect(Math.abs(result.bpm - finalBpm)).toBeLessThan(2);
        for (const [from, to, bpm] of tempos) expect(Math.abs(tempoBetween(result.beats, Math.max(from, 3.5), to) - bpm)).toBeLessThan(2);
        // Engancha en ~3 s; después solo puede perder los pocos tiempos que tarda en re-enganchar tras
        // un cambio de tempo. En la pausa sigue marcando: esos tiempos también cuentan.
        const score = offsets(result.beats, beats, 3.5);
        expect(score.missed).toBeLessThanOrEqual(tempos.length > 1 ? 3 : 0);
        expect(score.mean).toBeLessThan(15);
        if (tempos.length === 1) expect(score.max).toBeLessThan(40);
    });
});
