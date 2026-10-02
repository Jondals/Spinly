/**
 * Web Worker for beat analysis: the whole song is analysed off the main thread so animations never
 * stutter. It receives the decoded channels and posts back the beat grid (or null).
 */
import { analyzeBeats, type BeatGrid } from './beat-analysis';

export interface BeatRequest {
    channels: Float32Array[];
    sampleRate: number;
}

const scope = globalThis as unknown as {
    onmessage: ((event: MessageEvent<BeatRequest>) => void) | null;
    postMessage(grid: BeatGrid | null): void;
};

/** Mixes the channels down to mono, analyses them and posts the result back. */
scope.onmessage = ({ data }) => {
    const { channels, sampleRate } = data;
    const length = channels[0]?.length ?? 0;
    const mono = new Float32Array(length);
    for (const channel of channels) for (let i = 0; i < length; i++) mono[i] += channel[i] / channels.length;
    let grid: BeatGrid | null = null;
    try {
        grid = analyzeBeats(mono, sampleRate);
    } catch {
        grid = null;
    }
    scope.postMessage(grid);
};
