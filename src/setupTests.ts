/**
 * Jest setup (jsdom): browser APIs the app uses that jsdom does not implement.
 */
import '@testing-library/jest-dom';
import { webcrypto } from 'crypto';

if (!globalThis.crypto?.randomUUID) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

/** No-op ResizeObserver: layout never changes in jsdom. */
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

// jsdom does not draw on canvas (it would warn "Not implemented"): without a context the dot background is not painted.
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true });

// jsdom does not create blob URLs: the music player uses them to play uploaded songs.
if (!URL.createObjectURL) {
    Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:spinly-test', configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: () => undefined, configurable: true });
}
