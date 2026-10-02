/**
 * Shrinks an uploaded image before saving it. Photos up to 10 MB are accepted, but neither a wheel
 * texture (it lives in localStorage, ~5 MB in total) nor an avatar (shown at 40 px) needs that much: the
 * image is resized so its longer side is at most `maxSide` and re-encoded as WEBP (or JPEG when the
 * browser cannot encode WEBP and the image has no transparency to lose).
 */

/** Decodes an image file into something a canvas can draw. */
async function decode(file: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
    if (typeof createImageBitmap === 'function') return createImageBitmap(file);
    const url = URL.createObjectURL(file);
    try {
        const image = new Image();
        image.src = url;
        await image.decode();
        return image;
    } finally {
        URL.revokeObjectURL(url);
    }
}

/** Promise wrapper around canvas.toBlob. */
const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> =>
    new Promise((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * The shrunk image, or the original one if it was already small, if the shrunk one is not lighter, or if
 * the browser cannot process it (then the usual size limits decide).
 */
export async function shrinkImage(file: Blob, maxSide: number, quality = 0.86): Promise<Blob> {
    try {
        const image = await decode(file);
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return file;
        ctx.drawImage(image, 0, 0, width, height);
        if ('close' in image && typeof image.close === 'function') image.close();
        let result = await toBlob(canvas, 'image/webp', quality);
        // Without a WEBP encoder the browser returns PNG: JPEG is much lighter when there is no transparency.
        if (result && result.type !== 'image/webp' && file.type !== 'image/png') result = await toBlob(canvas, 'image/jpeg', quality);
        return result && result.size < file.size ? result : file;
    } catch {
        return file;
    }
}
