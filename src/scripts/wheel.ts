import type { WheelOption } from './option-wheel';

type WheelColors = Record<string, string>;

const COLORS: WheelColors = {
    indigo: 'var(--item-indigo)',
    coral: 'var(--item-coral)',
    amber: 'var(--item-amber)',
    teal: 'var(--item-teal)',
    pink: 'var(--item-pink)',
    violet: 'var(--item-violet)',
    sky: 'var(--item-sky)',
    mint: 'var(--item-mint)',
};

const LIGHT_COLORS: string[] = ['coral', 'amber', 'teal', 'pink', 'violet', 'sky', 'mint'];

export const SPIN_DURATION = 4200;

export type SpinResult = {
    rotation: number;
    winner: string;
};

type PolarPoint = { x: number; y: number };

export function getWheelBackground(
    options: WheelOption[],
    segmentColors?: Array<string | undefined>,
): string | undefined {
    if (options.length === 0) {
        return undefined;
    }

    const getColor = (option: WheelOption, index: number): string => {
        // Usa color hex del tema activo si está disponible y tiene ese índice
        if (segmentColors?.[index] && segmentColors[index] !== option.color) {
            return segmentColors[index] as string;
        }
        return COLORS[option.color] ?? 'var(--wheel-color-dark)';
    };

    if (options.length === 1) {
        const first = options[0];
        if (!first) return undefined;
        return getColor(first, 0);
    }

    const segmentAngle = 360 / options.length;

    return `conic-gradient(${
        options
            .map((option, index) => {
                const start = index * segmentAngle;
                const end = (index + 1) * segmentAngle;
                const color = getColor(option, index);
                return `${color} ${start}deg ${end}deg`;
            })
            .join(', ')
    })`;
}

export function describeSector(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
    const start = polar(cx, cy, r, endDeg);
    const end = polar(cx, cy, r, startDeg);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y} Z`;
}

function polar(cx: number, cy: number, r: number, deg: number): PolarPoint {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export function spinWheel(options: WheelOption[], rotation: number): SpinResult {
    const segmentAngle = 360 / options.length;
    const randomIndex = Math.floor(Math.random() * options.length);
    const randomOffset = Math.random() * segmentAngle;
    const extraTurns = 5 + Math.floor(Math.random() * 3);
    const targetAngle = 360 - (randomIndex * segmentAngle + randomOffset);
    const currentAngle = rotation % 360;
    const delta = (360 - currentAngle + targetAngle) % 360;

    return {
        rotation: rotation + delta + extraTurns * 360,
        winner: options[randomIndex]?.name ?? '',
    };
}

export type OptionProbability = { id: string; name: string; probability: number };

// Probabilidad REAL de cada opción según spinWheel (índice uniforme: 1/N cada una).
// Si algún día hay pesos por opción, se cambian aquí y en spinWheel a la vez y el
// tooltip de "Aleatoriedad certificada" los refleja sin tocar la UI.
export function getOptionProbabilities(options: WheelOption[]): OptionProbability[] {
    if (options.length === 0) return [];
    const share = 1 / options.length;
    return options.map((option) => ({ id: option.id, name: option.name, probability: share }));
}

export function getLabelTransform(index: number, total: number): string {
    const segmentAngle = 360 / total;
    const angle = index * segmentAngle + segmentAngle / 2;
    return `rotate(${angle}deg)`;
}

// —— Color aleatorio para un sector nuevo ("Add option") ——
// Tono aleatorio con saturación/luminosidad fijas → siempre vivo y legible.
const RANDOM_SATURATION = 70;
const RANDOM_LIGHTNESS = 55;
// Diferencia mínima de tono con el sector anterior (que contiguos no se confundan)
const MIN_HUE_DISTANCE = 40;

function hslToHex(h: number, s: number, l: number): string {
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

// Tono (0-360) de un hex #rgb/#rrggbb; null si no es un hex válido o es gris.
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

const hueDistance = (a: number, b: number): number => {
    const diff = Math.abs(a - b) % 360;
    return diff > 180 ? 360 - diff : diff;
};

// hsl(aleatorio, 70%, 55%) en hex, a ≥40° de tono del sector anterior si se conoce.
// `random` inyectable solo para tests deterministas.
export function randomSegmentColor(previousColor?: string, random: () => number = Math.random): string {
    const previousHue = hexToHue(previousColor);
    let hue = Math.floor(random() * 360);
    for (let attempt = 0; previousHue !== null && hueDistance(hue, previousHue) < MIN_HUE_DISTANCE && attempt < 12; attempt += 1) {
        hue = Math.floor(random() * 360);
    }
    if (previousHue !== null && hueDistance(hue, previousHue) < MIN_HUE_DISTANCE) {
        hue = (previousHue + 180) % 360; // último recurso: el tono opuesto
    }
    return hslToHex(hue, RANDOM_SATURATION, RANDOM_LIGHTNESS);
}

export function isLightColor(color: string | undefined): boolean {
    if (!color) return false;
    if (LIGHT_COLORS.includes(color)) return true;
    // Soporta hex del tema activo (#rgb / #rrggbb)
    if (typeof color === 'string' && color.startsWith('#')) {
        let hex = color.slice(1);
        if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
        if (hex.length !== 6) return false;
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        // Luminancia relativa aproximada
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.6;
    }
    return false;
}
