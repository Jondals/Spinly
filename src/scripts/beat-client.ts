// Lanza el análisis del pulso de una canción decodificada en un worker propio y lo cierra al acabar.
// Aparte del motor para que los tests (Jest no entiende import.meta) puedan sustituirlo.
import type { BeatGrid } from './beat-analysis';
import type { BeatRequest } from './beat-worker';

const TIMEOUT_MS = 30000;

export function analyzeInWorker(audio: AudioBuffer): Promise<BeatGrid | null> {
    if (typeof Worker === 'undefined') return Promise.resolve(null);
    return new Promise((resolve) => {
        let worker: Worker;
        try {
            worker = new Worker(new URL('./beat-worker.ts', import.meta.url));
        } catch {
            resolve(null);
            return;
        }
        const finish = (grid: BeatGrid | null) => {
            window.clearTimeout(timer);
            worker.terminate();
            resolve(grid);
        };
        const timer = window.setTimeout(() => finish(null), TIMEOUT_MS);
        worker.onmessage = (event: MessageEvent<BeatGrid | null>) => finish(event.data);
        worker.onerror = () => finish(null);
        // Copias de los canales, transferidas sin volver a copiar.
        const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i).slice());
        const request: BeatRequest = { channels, sampleRate: audio.sampleRate };
        worker.postMessage(request, channels.map((channel) => channel.buffer));
    });
}
