// Worker del análisis del pulso: la canción entera se analiza fuera del hilo principal, así las
// animaciones no se resienten. Recibe los canales ya decodificados y devuelve la rejilla (o null).
import { analyzeBeats, type BeatGrid } from './beat-analysis';

export interface BeatRequest {
    channels: Float32Array[];
    sampleRate: number;
}

const scope = globalThis as unknown as {
    onmessage: ((event: MessageEvent<BeatRequest>) => void) | null;
    postMessage(grid: BeatGrid | null): void;
};

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
