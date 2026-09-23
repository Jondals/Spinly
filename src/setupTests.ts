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
