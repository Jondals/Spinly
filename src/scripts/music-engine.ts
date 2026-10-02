/**
 * Music engine built on Web Audio. Each song plays in an <audio> element wired into its own graph: one
 * gain per song for fades (in, out, and chaining tracks without cuts) and a master volume with a
 * limiter. It loads on demand, only when the user turns music on. It also gives music-pulse.ts the
 * song clock and what the analyser measures, and analyses the beat of every whole song.
 */
import { BeatTracker, OnsetMeter, type BeatGrid } from './beat-analysis';
import { analyzeInWorker } from './beat-client';
import type { MusicBands, MusicClock } from './music-pulse';

export interface MusicEngine {
    /** Starts a song (blob: URL), crossfading from whatever was playing. false if it cannot be played. */
    playFile(url: string): Promise<boolean>;
    pause(): void;
    resume(): Promise<boolean>;
    setVolume(volume: number): void;
    /** Energy per band of what is playing now (0-1), regardless of volume: for the lights and the background. */
    bands(): MusicBands;
    /** Real-time beat tracker (see PulseSource.live in music-pulse.ts). */
    live(analysis: number, at: number): { beat: number; period: number } | null;
    /** Song time being heard now and the one the analyser measures; null when nothing plays. */
    clock(): MusicClock | null;
    /** Beat grid of a whole audio file (null if it cannot be decoded or analysed). */
    analyze(file: Blob): Promise<BeatGrid | null>;
    /** Called when the current song ends by itself (not when paused or switched). */
    onEnded(listener: () => void): void;
    dispose(): void;
}

const FADE_IN_S = 0.8;
const FADE_OUT_S = 0.45;
// Sample rate used to decode for analysis: plenty for the beat and light on memory.
const ANALYSIS_RATE = 22050;

interface Session {
    element: HTMLAudioElement;
    gain: GainNode;
    pauseTimer: number;
    /** Audio clock minus song time (s), smoothed; null until the first reading. */
    offset: number | null;
    /** Real-time beat tracker of this song. */
    tracker: BeatTracker;
}

/** Creates the engine (null without Web Audio support). */
export function createMusicEngine(): MusicEngine | null {
    if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return null;
    const ctx = new window.AudioContext();
    const master = ctx.createGain();
    // Soft ceiling: very loud masters do not clip when the volume goes up.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    master.connect(limiter).connect(ctx.destination);
    // Songs go through a shared bus before the volume: the analyser measures the music as it is, so the
    // lights pulse the same at low volume.
    const bus = ctx.createGain();
    bus.connect(master);
    const analyser = ctx.createAnalyser();
    // 2048: ~23 Hz bins, fine enough to follow the melody's pitch and not just the hits.
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.55;
    bus.connect(analyser);
    const spectrum = new Uint8Array(analyser.frequencyBinCount);
    // Spectrum bands: lows up to ~180 Hz (kick and bass), mids up to ~2 kHz (vocals, chords, melody)
    // and highs up to ~11 kHz (cymbals, brightness).
    const binHz = ctx.sampleRate / analyser.fftSize;
    const bassEnd = Math.max(2, Math.round(180 / binHz));
    const midEnd = Math.round(2000 / binHz);
    const highEnd = Math.min(analyser.frequencyBinCount - 1, Math.round(11000 / binHz));
    // Melody pitch: centre of mass of the spectrum between 200 Hz and 4 kHz on a log scale (like a
    // keyboard), ignoring the noise floor. 0 = low, 1 = high.
    const pitchFrom = Math.round(200 / binHz);
    const pitchTo = Math.round(4000 / binHz);
    const pitchOctaves = Math.log2(4000 / 200);
    const NOISE_FLOOR = 90;
    const decibels = new Float32Array(analyser.frequencyBinCount);
    const meter = new OnsetMeter(binHz);

    let current: Session | null = null;
    let endedListener: (() => void) | null = null;
    let disposed = false;

    /** Linear gain ramp from the current value. */
    const ramp = (gain: GainNode, to: number, seconds: number) => {
        const now = ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now);
        gain.gain.linearRampToValueAtTime(to, now + seconds);
    };

    /** Resumes the AudioContext if needed; false if the browser does not allow it. */
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

    /** Fades a song out and then removes it from the graph; the next one fades in meanwhile (crossfade). */
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
        /** Starts a song in its own graph and crossfades from the current one. */
        async playFile(url) {
            if (disposed) return false;
            const element = new Audio();
            element.preload = 'auto';
            element.src = url;
            const gain = ctx.createGain();
            gain.gain.value = 0.0001;
            gain.connect(bus);
            ctx.createMediaElementSource(element).connect(gain);
            const session: Session = { element, gain, pauseTimer: 0, offset: null, tracker: new BeatTracker() };
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
        /** Fades out and pauses. */
        pause() {
            const session = current;
            if (!session) return;
            ramp(session.gain, 0.0001, FADE_OUT_S);
            window.clearTimeout(session.pauseTimer);
            session.pauseTimer = window.setTimeout(() => session.element.pause(), FADE_OUT_S * 1000);
        },
        /** Resumes the loaded song with a fade in. */
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
        /** Sets the master volume (0-1). */
        setVolume(volume) {
            // Squared curve: the slider feels linear.
            const level = Math.min(Math.max(volume, 0), 1) ** 2;
            master.gain.setTargetAtTime(level, ctx.currentTime, 0.05);
        },
        /** Energy of the lows, mids and highs, plus the melody pitch. */
        bands() {
            analyser.getByteFrequencyData(spectrum);
            /** Average level (0-1) of a range of bins. */
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
        /** Feeds the real-time tracker and returns its prediction. */
        live(analysis, at) {
            const session = current;
            if (!session) return null;
            analyser.getFloatFrequencyData(decibels);
            session.tracker.push(analysis, meter.measure(decibels));
            const predicted = session.tracker.beatAt(at);
            return predicted && predicted.beat >= 0 ? predicted : null;
        },
        /** Song time being heard and being analysed. */
        clock() {
            const session = current;
            if (!session || session.element.paused || ctx.state !== 'running') return null;
            // The <audio> time advances in jumps; the context clock, sample by sample. The difference between
            // them is tracked, smoothed, and the song time is read on the context clock.
            const sample = ctx.currentTime - session.element.currentTime;
            if (session.offset === null || Math.abs(sample - session.offset) > 0.08) session.offset = sample;
            else session.offset += (sample - session.offset) * 0.05;
            const playing = ctx.currentTime - session.offset;
            // What is heard lags behind what is processed: the context and output latency.
            const latency = (ctx.baseLatency || 0) + (ctx.outputLatency || 0);
            // The analyser sees a window of fftSize samples ending now: its centre.
            return { audible: playing - latency, analysis: playing - analyser.fftSize / 2 / ctx.sampleRate };
        },
        /** Decodes a whole file and analyses its beat in a worker. */
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
        /** Registers the listener for a song ending on its own. */
        onEnded(listener) {
            endedListener = listener;
        },
        /** Stops everything and closes the AudioContext. */
        dispose() {
            disposed = true;
            retire(current);
            current = null;
            window.setTimeout(() => { void ctx.close(); }, FADE_OUT_S * 1000 + 150);
        },
    };
}
