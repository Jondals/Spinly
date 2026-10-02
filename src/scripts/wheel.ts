/**
 * Wheel geometry and spinning: the conic-gradient background, SVG sector paths, picking a winner, image
 * fitting inside a sector and color helpers for the sectors.
 */
import type { WheelOption } from './option-wheel';
import { hexToHue, hslToHex } from './color';
import { IMAGE_FIT_LIMITS, type ImageFit } from '../types/theme-types';

type WheelColors = Record<string, string>;

// Palette color names mapped to their CSS variables.
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

// Palette colors light enough to need dark label text.
const LIGHT_COLORS: string[] = ['coral', 'amber', 'teal', 'pink', 'violet', 'sky', 'mint'];

/** Duration of a spin of the main wheel (ms). */
export const SPIN_DURATION = 4200;

export type SpinResult = {
    rotation: number;
    winner: string;
};

type PolarPoint = { x: number; y: number };

/** The wheel's background: one conic-gradient with a slice per option (or a flat color for one option). */
export function getWheelBackground(
    options: WheelOption[],
    segmentColors?: Array<string | undefined>,
): string | undefined {
    if (options.length === 0) {
        return undefined;
    }

    /** A segment's own color if the theme sets one, else the option's palette color. */
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

/** SVG path of a circular sector between two angles (0 = top, clockwise). */
export function describeSector(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
    const start = polar(cx, cy, r, endDeg);
    const end = polar(cx, cy, r, startDeg);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y} Z`;
}

/** Point at a given angle (0 = top, clockwise) and radius from the centre. */
function polar(cx: number, cy: number, r: number, deg: number): PolarPoint {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/**
 * Spins the main wheel: picks the winner first, then a random point inside its sector plus five to seven
 * full turns, and returns the final rotation for the CSS transition.
 */
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

/** Probability of each option; it must change together with spinWheel if weights are ever added. */
export function getOptionProbabilities(options: WheelOption[]): OptionProbability[] {
    if (options.length === 0) return [];
    const share = 1 / options.length;
    return options.map((option) => ({ id: option.id, name: option.name, probability: share }));
}

/** Side of the wheel's SVG viewBox; all image geometry is expressed in it. */
export const WHEEL_VIEWBOX = 480;

export type SectorAngles = { start: number; end: number; mid: number };

/** Angles in degrees (0 = top, clockwise) of sector `index` out of `count`. */
export function getSectorAngles(index: number, count: number): SectorAngles {
    const size = 360 / Math.max(count, 1);
    const start = index * size;
    return { start, end: start + size, mid: start + size / 2 };
}

export type ImageBox = { x: number; y: number; width: number; height: number; transform?: string };

/** Box of the <image> (preserveAspectRatio slice) for a fit inside a viewBox of side `size`. */
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

/** Point of the wheel (as a fraction of the radius) that ends up under the pointer when the sector wins. */
const SECTOR_FOCUS_RADIUS = 0.55;

/**
 * Initial fit for a new image: centred on the sector, upright when the sector is at the top (when it
 * wins) and just big enough to cover it entirely.
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

/** Degrees in the (-180, 180] range. */
export function normalizeDegrees(deg: number): number {
    const d = ((deg % 360) + 360) % 360;
    return d > 180 ? d - 360 : d;
}

/** CSS rotation that places an option's label in the middle of its sector. */
export function getLabelTransform(index: number, total: number): string {
    const segmentAngle = 360 / total;
    const angle = index * segmentAngle + segmentAngle / 2;
    return `rotate(${angle}deg)`;
}

// Fixed saturation and lightness: any hue comes out vivid and readable.
const RANDOM_SATURATION = 70;
const RANDOM_LIGHTNESS = 55;
// Minimum hue distance from the previous sector so they are not confused.
const MIN_HUE_DISTANCE = 40;

/** Shortest distance between two hues around the color wheel. */
const hueDistance = (a: number, b: number): number => {
    const diff = Math.abs(a - b) % 360;
    return diff > 180 ? 360 - diff : diff;
};

/** A random sector color that is distinguishable from the previous one. `random` is injected in tests. */
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

/** Whether a sector color is light enough to need dark text on it. */
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
