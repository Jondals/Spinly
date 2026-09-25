// Reduce una imagen subida antes de guardarla. Se aceptan fotos de hasta 10 MB, pero ni una textura de
// la ruleta (vive en localStorage, ~5 MB en total) ni un avatar (se ve a 40 px) necesitan tanto: se
// redimensiona para que su lado mayor no pase de `maxSide` y se vuelve a comprimir en WEBP (o JPEG si
// el navegador no codifica WEBP y la imagen no tiene transparencia que perder).

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

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> =>
    new Promise((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * La imagen reducida, o la original si ya era pequeña, si la reducida no pesa menos o si el navegador
 * no puede procesarla (entonces deciden los límites de siempre).
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
        // Sin codificador WEBP el navegador devuelve PNG: JPEG pesa mucho menos si no hay transparencia.
        if (result && result.type !== 'image/webp' && file.type !== 'image/png') result = await toBlob(canvas, 'image/jpeg', quality);
        return result && result.size < file.size ? result : file;
    } catch {
        return file;
    }
}
