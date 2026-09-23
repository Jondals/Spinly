import type { WheelOption } from './option-wheel';
import { hexToHue, hslToHex } from './color';
import { IMAGE_FIT_LIMITS, type ImageFit } from '../types/theme-types';

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

/** Probabilidad de cada opción; debe cambiar a la vez que spinWheel si algún día hay pesos. */
export function getOptionProbabilities(options: WheelOption[]): OptionProbability[] {
    if (options.length === 0) return [];
    const share = 1 / options.length;
    return options.map((option) => ({ id: option.id, name: option.name, probability: share }));
}

/** Lado del viewBox SVG de la ruleta; toda la geometría de imágenes se expresa en él. */
export const WHEEL_VIEWBOX = 480;

export type SectorAngles = { start: number; end: number; mid: number };

/** Ángulos en grados (0 = arriba, sentido horario) del sector `index` de `count`. */
export function getSectorAngles(index: number, count: number): SectorAngles {
    const size = 360 / Math.max(count, 1);
    const start = index * size;
    return { start, end: start + size, mid: start + size / 2 };
}

export type ImageBox = { x: number; y: number; width: number; height: number; transform?: string };

/** Caja del <image> (preserveAspectRatio slice) para un encaje en un viewBox de lado `size`. */
export function getImageBox(fit: ImageFit | undefined, size = WHEEL_VIEWBOX): ImageBox {
    const scale = fit?.scale ?? 1;
    const side = size * scale;
    const cx = size / 2 + (fit?.x ?? 0) * size;
    const cy = size / 2 + (fit?.y ?? 0) * size;
    const rotate = fit?.rotate ?? 0;
    return {
        x: cx - side / 2,
        y: cy - side / 2,
        width: side,
        height: side,
        transform: rotate ? `rotate(${rotate} ${cx} ${cy})` : undefined,
    };
}

/** Punto de la ruleta que queda bajo el puntero cuando gana este sector. */
const SECTOR_FOCUS_RADIUS = 0.55;

/**
 * Encaje inicial para una imagen nueva: centrada en el sector, derecha cuando el
 * sector queda arriba (al ganar) y lo justo de grande para cubrirlo entero.
 */
export function fitImageToSector(index: number, count: number): ImageFit {
    if (count <= 1) return { x: 0, y: 0, scale: 1, rotate: 0 };
    const { mid } = getSectorAngles(index, count);
    const radius = 0.5;
    const focus = radius * SECTOR_FOCUS_RADIUS;
    const rad = (mid * Math.PI) / 180;
    const halfAngle = Math.PI / count;
    const farthest = Math.max(
        focus,
        radius - focus,
        Math.sqrt(radius * radius + focus * focus - 2 * radius * focus * Math.cos(halfAngle)),
    );
    const scale = Math.min(Math.max(farthest * 2, IMAGE_FIT_LIMITS.minScale), IMAGE_FIT_LIMITS.maxScale);
    return {
        x: focus * Math.sin(rad),
        y: -focus * Math.cos(rad),
        scale,
        rotate: normalizeDegrees(mid),
    };
}

/** Grados en el rango (-180, 180]. */
export function normalizeDegrees(deg: number): number {
    const d = ((deg % 360) + 360) % 360;
    return d > 180 ? d - 360 : d;
}

export function getLabelTransform(index: number, total: number): string {
    const segmentAngle = 360 / total;
    const angle = index * segmentAngle + segmentAngle / 2;
    return `rotate(${angle}deg)`;
}

// Saturación y luminosidad fijas: cualquier tono sale vivo y legible.
const RANDOM_SATURATION = 70;
const RANDOM_LIGHTNESS = 55;
// Separación mínima de tono con el sector anterior para que no se confundan.
const MIN_HUE_DISTANCE = 40;

const hueDistance = (a: number, b: number): number => {
    const diff = Math.abs(a - b) % 360;
    return diff > 180 ? 360 - diff : diff;
};

/** Color de sector aleatorio y distinguible del anterior. `random` se inyecta en los tests. */
export function randomSegmentColor(previousColor?: string, random: () => number = Math.random): string {
    const previousHue = hexToHue(previousColor);
    let hue = Math.floor(random() * 360);
    for (let attempt = 0; previousHue !== null && hueDistance(hue, previousHue) < MIN_HUE_DISTANCE && attempt < 12; attempt += 1) {
        hue = Math.floor(random() * 360);
    }
    if (previousHue !== null && hueDistance(hue, previousHue) < MIN_HUE_DISTANCE) {
        hue = (previousHue + 180) % 360;
    }
    return hslToHex(hue, RANDOM_SATURATION, RANDOM_LIGHTNESS);
}

export function isLightColor(color: string | undefined): boolean {
    if (!color) return false;
    if (LIGHT_COLORS.includes(color)) return true;
    if (typeof color === 'string' && color.startsWith('#')) {
        let hex = color.slice(1);
        if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
        if (hex.length !== 6) return false;
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.6;
    }
    return false;
}
