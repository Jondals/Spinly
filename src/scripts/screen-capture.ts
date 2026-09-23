// Fuentes de imagen para tomar colores cuando el navegador no tiene EyeDropper nativo.
// Todo acaba en un canvas a resolución real, del que ColorSampler lee los píxeles.

import { rgbToHex } from './color';

/** Captura de pantalla (Firefox y Safari de escritorio): exige contexto seguro y un gesto del usuario. */
export function supportsScreenCapture(): boolean {
    return typeof navigator !== 'undefined'
        && typeof window !== 'undefined'
        && window.isSecureContext === true
        && typeof navigator.mediaDevices?.getDisplayMedia === 'function';
}

function canvasFrom(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement | null {
    if (!width || !height) return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, width, height);
    return canvas;
}

/** Espera a que el vídeo pinte un fotograma real: el primero puede llegar negro o vacío. */
function nextFrame(video: HTMLVideoElement): Promise<void> {
    const withFrameCallback = video as HTMLVideoElement & { requestVideoFrameCallback?: (callback: () => void) => number };
    if (typeof withFrameCallback.requestVideoFrameCallback === 'function') {
        return new Promise((resolve) => { withFrameCallback.requestVideoFrameCallback?.(() => resolve()); });
    }
    return new Promise((resolve) => { window.setTimeout(resolve, 150); });
}

/**
 * Pide al usuario qué pantalla, ventana o pestaña compartir, congela un fotograma y corta la
 * captura enseguida (el aviso de "compartiendo" desaparece). null si el usuario cancela.
 */
export async function captureScreenFrame(): Promise<HTMLCanvasElement | null> {
    if (!supportsScreenCapture()) return null;
    let stream: MediaStream | null = null;
    try {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        await video.play();
        await nextFrame(video);
        return canvasFrom(video, video.videoWidth, video.videoHeight);
    } catch {
        return null;
    } finally {
        stream?.getTracks().forEach((track) => track.stop());
    }
}

/** Imagen o captura elegida por el usuario (móvil, o sin permiso de captura). */
export async function loadImageFile(file: File): Promise<HTMLCanvasElement | null> {
    if (!file.type.startsWith('image/')) return null;
    const url = URL.createObjectURL(file);
    try {
        const image = new Image();
        image.src = url;
        await image.decode();
        return canvasFrom(image, image.naturalWidth, image.naturalHeight);
    } catch {
        return null;
    } finally {
        URL.revokeObjectURL(url);
    }
}

/** Color del píxel (x, y) del canvas, en hex. */
export function pixelHex(canvas: HTMLCanvasElement, x: number, y: number): string | null {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
    return rgbToHex({ r, g, b });
}
