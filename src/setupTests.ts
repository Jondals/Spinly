// Entorno de Jest (jsdom): APIs del navegador que jsdom no implementa y la app usa.
import '@testing-library/jest-dom';
import { webcrypto } from 'crypto';

if (!globalThis.crypto?.randomUUID) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
}
if (!('ResizeObserver' in globalThis)) {
    Object.defineProperty(globalThis, 'ResizeObserver', { value: ResizeObserverStub, configurable: true });
}

if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
}

// jsdom no dibuja en canvas (avisaría "Not implemented"): sin contexto, el fondo de puntos no se pinta.
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true });

// jsdom no crea URLs de blobs: la música las usa para reproducir las canciones subidas.
if (!URL.createObjectURL) {
    Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:spinly-test', configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: () => undefined, configurable: true });
}
