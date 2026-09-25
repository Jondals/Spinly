// Motor de música con Web Audio. Cada canción suena en un <audio> enganchado a un grafo propio:
// una ganancia por canción para los fundidos (entrar, salir y encadenar pistas sin cortes) y un
// volumen general con limitador. Se carga bajo demanda: solo cuando el usuario enciende la música.
// También da a music-pulse.ts el reloj de la canción y lo que mide el analizador, y analiza el pulso
// de cada canción entera.
import { OnsetMeter, type BeatGrid } from './beat-analysis';
import { analyzeInWorker } from './beat-client';
import type { MusicBands, MusicClock } from './music-pulse';

export interface MusicEngine {
    /** Empieza una canción (URL blob:), con fundido desde lo que sonara. false si no se puede reproducir. */
    playFile(url: string): Promise<boolean>;
    pause(): void;
    resume(): Promise<boolean>;
    setVolume(volume: number): void;
    /** Energía por bandas de lo que suena ahora (0-1), sin contar el volumen: para las luces y el fondo. */
    bands(): MusicBands;
    /** Fuerza de ataque de lo que mide ahora el analizador. */
    onset(): number;
    /** Tiempo de la canción que se oye ahora y el que mide el analizador; null si no suena. */
    clock(): MusicClock | null;
    /** Rejilla de pulso de un archivo de audio completo (null si no se puede decodificar o analizar). */
    analyze(file: Blob): Promise<BeatGrid | null>;
    /** Se llama cuando la canción actual termina sola (no al pausar ni al cambiar). */
    onEnded(listener: () => void): void;
    dispose(): void;
}

const FADE_IN_S = 0.8;
const FADE_OUT_S = 0.45;
// Frecuencia a la que se decodifica para analizar: sobra para el pulso y ocupa poco en memoria.
const ANALYSIS_RATE = 22050;

interface Session {
    element: HTMLAudioElement;
    gain: GainNode;
    pauseTimer: number;
    /** Reloj del audio menos tiempo de la canción (s), suavizado; null hasta la primera lectura. */
    offset: number | null;
}

export function createMusicEngine(): MusicEngine | null {
    if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return null;
    const ctx = new window.AudioContext();
    const master = ctx.createGain();
    // Techo suave: canciones masterizadas muy fuerte no saturan al subir el volumen.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    master.connect(limiter).connect(ctx.destination);
    // Las canciones pasan por un bus común antes del volumen: el analizador mide la música tal cual,
    // así las luces laten igual con el volumen bajo.
    const bus = ctx.createGain();
    bus.connect(master);
    const analyser = ctx.createAnalyser();
    // 2048: casillas de ~23 Hz, finas para seguir la altura de la melodía y no solo los golpes.
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.55;
    bus.connect(analyser);
    const spectrum = new Uint8Array(analyser.frequencyBinCount);
    // Bandas del espectro: graves hasta ~180 Hz (bombo y bajo), medios hasta ~2 kHz (voces,
    // acordes, melodía) y agudos hasta ~11 kHz (platos, brillo).
    const binHz = ctx.sampleRate / analyser.fftSize;
    const bassEnd = Math.max(2, Math.round(180 / binHz));
    const midEnd = Math.round(2000 / binHz);
    const highEnd = Math.min(analyser.frequencyBinCount - 1, Math.round(11000 / binHz));
    // Altura de la melodía: centro de masas del espectro entre 200 Hz y 4 kHz en escala logarítmica
    // (como un teclado), sin el ruido de fondo. 0 = grave, 1 = agudo.
    const pitchFrom = Math.round(200 / binHz);
    const pitchTo = Math.round(4000 / binHz);
    const pitchOctaves = Math.log2(4000 / 200);
    const NOISE_FLOOR = 90;
    const decibels = new Float32Array(analyser.frequencyBinCount);
    const meter = new OnsetMeter(binHz);

    let current: Session | null = null;
    let endedListener: (() => void) | null = null;
    let disposed = false;

    const ramp = (gain: GainNode, to: number, seconds: number) => {
        const now = ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now);
        gain.gain.linearRampToValueAtTime(to, now + seconds);
    };

    const ensureRunning = async (): Promise<boolean> => {
        if (ctx.state !== 'running') {
            try {
                await ctx.resume();
            } catch {
                return false;
            }
        }
        return ctx.state === 'running';
    };

    /** Fundido de salida y, al acabar, fuera del grafo: la siguiente entra a la vez (fundido cruzado). */
    const retire = (session: Session | null) => {
        if (!session) return;
        window.clearTimeout(session.pauseTimer);
        ramp(session.gain, 0.0001, FADE_OUT_S);
        window.setTimeout(() => {
            session.element.pause();
            session.element.removeAttribute('src');
            session.element.load();
            session.gain.disconnect();
        }, FADE_OUT_S * 1000 + 50);
    };

    return {
        async playFile(url) {
            if (disposed) return false;
            const element = new Audio();
            element.preload = 'auto';
            element.src = url;
            const gain = ctx.createGain();
            gain.gain.value = 0.0001;
            gain.connect(bus);
            ctx.createMediaElementSource(element).connect(gain);
            const session: Session = { element, gain, pauseTimer: 0, offset: null };
            element.addEventListener('ended', () => {
                if (current === session && !disposed) endedListener?.();
            });
            retire(current);
            current = session;
            if (!(await ensureRunning())) return false;
            try {
                await element.play();
            } catch {
                if (current === session) current = null;
                gain.disconnect();
                return false;
            }
            if (current === session) ramp(gain, 1, FADE_IN_S);
            return true;
        },
        pause() {
            const session = current;
            if (!session) return;
            ramp(session.gain, 0.0001, FADE_OUT_S);
            window.clearTimeout(session.pauseTimer);
            session.pauseTimer = window.setTimeout(() => session.element.pause(), FADE_OUT_S * 1000);
        },
        async resume() {
            const session = current;
            if (!session) return false;
            window.clearTimeout(session.pauseTimer);
            if (!(await ensureRunning())) return false;
            try {
                await session.element.play();
            } catch {
                return false;
            }
            ramp(session.gain, 1, FADE_IN_S);
            return true;
        },
        setVolume(volume) {
            // Curva cuadrática: el deslizador se percibe lineal.
            const level = Math.min(Math.max(volume, 0), 1) ** 2;
            master.gain.setTargetAtTime(level, ctx.currentTime, 0.05);
        },
        bands() {
            analyser.getByteFrequencyData(spectrum);
            const average = (from: number, to: number) => {
                let sum = 0;
                for (let k = from; k <= to; k++) sum += spectrum[k];
                return sum / ((to - from + 1) * 255);
            };
            let weight = 0;
            let weighted = 0;
            for (let k = pitchFrom; k <= pitchTo; k++) {
                const w = Math.max(0, spectrum[k] - NOISE_FLOOR) ** 2;
                weight += w;
                weighted += w * (Math.log2((k * binHz) / 200) / pitchOctaves);
            }
            return {
                bass: average(1, bassEnd),
                mid: average(bassEnd + 1, midEnd),
                high: average(midEnd + 1, highEnd),
                pitch: weight > 0 ? Math.min(1, Math.max(0, weighted / weight)) : 0.5,
            };
        },
        onset() {
            analyser.getFloatFrequencyData(decibels);
            return meter.measure(decibels);
        },
        clock() {
            const session = current;
            if (!session || session.element.paused || ctx.state !== 'running') return null;
            // El tiempo del <audio> avanza a saltos; el reloj del contexto, muestra a muestra. Se sigue
            // la diferencia entre los dos, suavizada, y la canción se lee en el reloj del contexto.
            const sample = ctx.currentTime - session.element.currentTime;
            if (session.offset === null || Math.abs(sample - session.offset) > 0.08) session.offset = sample;
            else session.offset += (sample - session.offset) * 0.05;
            const playing = ctx.currentTime - session.offset;
            // Lo que se oye va por detrás de lo que se procesa: la latencia del contexto y de la salida.
            const latency = (ctx.baseLatency || 0) + (ctx.outputLatency || 0);
            // El analizador ve una ventana de fftSize muestras que acaba ahora: su centro.
            return { audible: playing - latency, analysis: playing - analyser.fftSize / 2 / ctx.sampleRate };
        },
        async analyze(file) {
            if (typeof OfflineAudioContext === 'undefined') return null;
            try {
                const decoder = new OfflineAudioContext(1, 1, ANALYSIS_RATE);
                const audio = await decoder.decodeAudioData(await file.arrayBuffer());
                return await analyzeInWorker(audio);
            } catch {
                return null;
            }
        },
        onEnded(listener) {
            endedListener = listener;
        },
        dispose() {
            disposed = true;
            retire(current);
            current = null;
            window.setTimeout(() => { void ctx.close(); }, FADE_OUT_S * 1000 + 150);
        },
    };
}
