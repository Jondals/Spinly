// Conversiones de color compartidas por el selector de color, la ruleta y sus temas.

export type Rgb = { r: number; g: number; b: number };
export type Hsv = { h: number; s: number; v: number };

export const clamp = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), max);
const byte = (n: number): string => clamp(Math.round(Number.isFinite(n) ? n : 0), 0, 255).toString(16).padStart(2, '0');

export function hexToRgb(hex: string): Rgb {
    let clean = hex.trim().replace('#', '');
    if (clean.length === 3) clean = clean.split('').map((c) => c + c).join('');
    if (clean.length !== 6 || /[^0-9a-fA-F]/.test(clean)) return { r: 0, g: 0, b: 0 };
    const num = parseInt(clean, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
    return `#${byte(r)}${byte(g)}${byte(b)}`;
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
    const rr = r / 255;
    const gg = g / 255;
    const bb = b / 255;
    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
        if (max === rr) h = ((gg - bb) / d) % 6;
        else if (max === gg) h = (bb - rr) / d + 2;
        else h = (rr - gg) / d + 4;
        h *= 60;
        if (h < 0) h += 360;
    }
    return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
    const c = v * s;
    const hh = (((h % 360) + 360) % 360) / 60;
    const x = c * (1 - Math.abs((hh % 2) - 1));
    let r = 0;
    let g = 0;
    let b = 0;
    if (hh < 1) { r = c; g = x; }
    else if (hh < 2) { r = x; g = c; }
    else if (hh < 3) { g = c; b = x; }
    else if (hh < 4) { g = x; b = c; }
    else if (hh < 5) { r = x; b = c; }
    else { r = c; b = x; }
    const m = v - c;
    return {
        r: Math.round((r + m) * 255),
        g: Math.round((g + m) * 255),
        b: Math.round((b + m) * 255),
    };
}

export function hslToHex(h: number, s: number, l: number): string {
    const sat = s / 100;
    const light = l / 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = sat * Math.min(light, 1 - light);
    const channel = (n: number) => {
        const value = light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
        return Math.round(value * 255).toString(16).padStart(2, '0');
    };
    return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/** Tono (0-360) de un hex #rgb/#rrggbb; null si no es hex válido o es gris. */
export function hexToHue(color: string | undefined): number | null {
    if (!color || !color.startsWith('#')) return null;
    let hex = color.slice(1);
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    if (hex.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(hex)) return null;
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b);
    const delta = max - Math.min(r, g, b);
    if (delta === 0) return null;
    let hue: number;
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    return (hue * 60 + 360) % 360;
}
