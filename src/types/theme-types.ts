/**
 * Theme and preset models: types, storage keys, the seed themes and presets, and the sanitizers that
 * validate anything read from localStorage, the sync file or Supabase.
 */
import { MAX_OPTION_LENGTH, MAX_WHEEL_OPTIONS } from '../scripts/option-wheel';
import type { WheelOption } from '../scripts/option-wheel';
import { pickText, type SpinlyLang } from '../scripts/strings';

export { MAX_WHEEL_OPTIONS };

/**
 * How a sector's image is fitted, in coordinates of the unrotated wheel.
 * x/y: offset of the image centre from the wheel centre, as a fraction of the diameter.
 * scale: 1 = the image covers the whole wheel. rotate: degrees around the image centre.
 */
export type ImageFit = {
    x: number;
    y: number;
    scale: number;
    rotate: number;
};

export const DEFAULT_IMAGE_FIT: ImageFit = { x: 0, y: 0, scale: 1, rotate: 0 };

export const IMAGE_FIT_LIMITS = {
    minScale: 0.2,
    maxScale: 4,
    maxOffset: 1,
    maxRotate: 180,
} as const;

/** Visual only: names live in WheelOption. */
export type WheelSegmentStyle = {
    color: string;
    backgroundImage?: string;
    imageFit?: ImageFit;
};

/** A finite number clamped to [min, max], or the fallback. */
const clampFinite = (value: unknown, min: number, max: number, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(value, min), max) : fallback;

/** Validates a fit coming from storage or the network; undefined if it is not an object. */
export function sanitizeImageFit(raw: unknown): ImageFit | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const fit = raw as Record<string, unknown>;
    const { minScale, maxScale, maxOffset, maxRotate } = IMAGE_FIT_LIMITS;
    return {
        x: clampFinite(fit['x'], -maxOffset, maxOffset, 0),
        y: clampFinite(fit['y'], -maxOffset, maxOffset, 0),
        scale: clampFinite(fit['scale'], minScale, maxScale, 1),
        rotate: clampFinite(fit['rotate'], -maxRotate, maxRotate, 0),
    };
}

/** Deep copy of a segment style (with a fallback color when missing). */
function copySegment(s: WheelSegmentStyle | undefined, fallbackColor: string): WheelSegmentStyle {
    const out: WheelSegmentStyle = { color: s?.color ?? fallbackColor };
    if (s?.backgroundImage) {
        out.backgroundImage = s.backgroundImage;
        if (s.imageFit) out.imageFit = { ...s.imageFit };
    }
    return out;
}

/** Visual only: it never changes option names or the number of options. */
export type WheelTheme = {
    id: string;
    name: string;
    description?: string;
    styleTag?: string;
    category?: string;
    segments: WheelSegmentStyle[];
    /** Wheel rim; without a value, the light/dark mode's one is used. */
    borderColor?: string;
    centerColor?: string;
    /** Pointer; without a value, amber (--wheel-pointer-color). */
    pointerColor?: string;
    /** Animated lights of the rim and the hub; without a value, amber (--wheel-light-color). */
    lightColor?: string;
};

/** Options plus the complete visual theme at the moment it was saved. */
export type WheelPreset = {
    id: string;
    name: string;
    options: WheelOption[];
    theme: WheelTheme;
    updatedAt: number;
    tags?: string[];
};

export const THEMES_STORAGE_KEY = 'spinly-themes';

export const ACTIVE_THEME_STORAGE_KEY = 'spinly-active-theme';

export const PRESETS_STORAGE_KEY = 'spinly-presets';

export const ACTIVE_PRESET_STORAGE_KEY = 'spinly-active-preset';

export const WHEEL_LIMIT_STORAGE_KEY = 'spinly-wheel-limit';

export const OPTIONS_STORAGE_KEY = 'spinly-options';

/** Ids of the sample themes and presets the user has deleted. */
export const HIDDEN_DEFAULTS_STORAGE_KEY = 'spinly-hidden-defaults';

export const DEFAULT_SEGMENT_COLOR = '#6366f1';

/** Shorthand for a seed segment. */
const seg = (color: string, backgroundImage?: string): WheelSegmentStyle => (
    backgroundImage ? { color, backgroundImage } : { color }
);

/** Exactly `count` segments, cycling the given ones (deep copies). */
export function ensureSegments(
    segments: WheelSegmentStyle[],
    count: number,
    fallbackColor = DEFAULT_SEGMENT_COLOR
): WheelSegmentStyle[] {
    const out: WheelSegmentStyle[] = [];
    const len = Math.max(segments.length, 1);
    for (let i = 0; i < count; i++) {
        out.push(copySegment(segments[i % len], fallbackColor));
    }
    return out;
}

/** Style of sector `index`, cycling the palette without expanding the saved theme. */
export function segmentForIndex(
    theme: WheelTheme | null | undefined,
    index: number,
    fallbackColor = DEFAULT_SEGMENT_COLOR
): WheelSegmentStyle {
    const segs = theme?.segments ?? [];
    if (segs.length === 0) return { color: fallbackColor };
    return copySegment(segs[index % segs.length], fallbackColor);
}

/** Relative time ("3 days ago") in the given language. */
export function timeAgo(updatedAt: number, lang: SpinlyLang): string {
    const diff = Date.now() - updatedAt;
    const min = Math.floor(diff / 60000);
    if (min < 1) return pickText('time', 'justNow', lang);
    if (min < 60) return pickText('time', 'minutes', lang, { n: min });
    const h = Math.floor(min / 60);
    if (h < 24) return pickText('time', 'hours', lang, { n: h });
    const d = Math.floor(h / 24);
    if (d < 30) return pickText('time', 'days', lang, { n: d });
    const m = Math.floor(d / 30);
    if (m < 12) return pickText('time', 'months', lang, { n: m });
    return pickText('time', 'years', lang, { n: Math.floor(m / 12) });
}

/** Seed themes (their texts are localized through seedText in strings.ts). */
export const DEFAULT_THEMES: WheelTheme[] = [
    {
        id: 'theme-obsidian',
        name: 'Obsidian Flow',
        description: 'Modo oscuro profundo, titanio & alta precisión.',
        styleTag: 'DEEP TECH DENSITY',
        category: 'POR DEFECTO',
        segments: [
            seg('#0b0f19'),
            seg('#1e1b4b'),
            seg('#3730a3'),
            seg('#6366f1'),
            seg('#c7d2fe'),
        ],
        pointerColor: '#a5b4fc',
        lightColor: '#818cf8',
    },
    {
        id: 'theme-neon',
        name: 'Neon Nights',
        description: 'Cian eléctrico, magenta synthwave & ultravioleta.',
        styleTag: 'HIGH CONTRAST GLOW',
        category: 'CYBERPUNK',
        segments: [
            seg('#22d3ee'),
            seg('#f472b6'),
            seg('#a855f7'),
            seg('#3b82f6'),
            seg('#ec4899'),
        ],
        pointerColor: '#22d3ee',
        lightColor: '#f472b6',
    },
];

/** Validates a preset from storage or the network; null if it is unusable. */
export function sanitizePreset(raw: unknown): WheelPreset | null {
    if (!raw || typeof raw !== 'object') return null;
    const p = raw as Partial<WheelPreset>;
    if (typeof p.id !== 'string' || typeof p.name !== 'string') return null;
    if (!Array.isArray(p.options) || p.options.length === 0) return null;
    const theme = sanitizeTheme(p.theme);
    if (!theme) return null;
    const options = sanitizeOptions(p.options, p.id);
    if (options.length === 0) return null;
    return {
        id: p.id,
        name: p.name,
        options,
        theme,
        updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : Date.now(),
        tags: Array.isArray(p.tags) ? (p.tags as unknown[]).filter((t): t is string => typeof t === 'string') : [],
    };
}

/** Options read from storage or the cloud: only name (trimmed), id and color; empty ones are dropped. */
export function sanitizeOptions(raw: unknown, idPrefix: string): WheelOption[] {
    if (!Array.isArray(raw)) return [];
    return (raw as Array<Record<string, unknown>>)
        .filter((o) => o && typeof o === 'object' && typeof o['name'] === 'string')
        .map((o, i) => ({
            id: typeof o['id'] === 'string' ? (o['id'] as string) : `${idPrefix}-opt-${i}`,
            name: String(o['name']).slice(0, MAX_OPTION_LENGTH),
            color: typeof o['color'] === 'string' ? (o['color'] as string) : 'indigo',
        }))
        .filter((o) => o.name.length > 0);
}

/** Deep copy of a preset. */
export function clonePreset(p: WheelPreset): WheelPreset {
    return {
        ...p,
        options: p.options.map((o) => ({ ...o })),
        theme: cloneTheme(p.theme),
        tags: p.tags ? [...p.tags] : [],
    };
}

// Whatever comes from storage or Supabase is untrusted: colors must be hex and images raster data:image
// URLs only (no SVG with scripts, no external URLs).
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpeg|webp|gif|avif);base64,/i;

/** The value if it is a hex color, else undefined. */
const hexOrUndefined = (value: unknown): string | undefined =>
    typeof value === 'string' && HEX_COLOR.test(value) ? value : undefined;

/** Validates a theme from storage or the network; null if it is unusable. */
export function sanitizeTheme(raw: unknown): WheelTheme | null {
    if (!raw || typeof raw !== 'object') return null;
    const t = raw as Partial<WheelTheme> & { segments?: Array<Record<string, unknown>> };
    if (typeof t.id !== 'string' || typeof t.name !== 'string') return null;
    if (!Array.isArray(t.segments) || t.segments.length === 0) return null;
    const segments: WheelSegmentStyle[] = t.segments
        .filter((s) => s && typeof s === 'object')
        .map((s) => {
            const rawColor = s['color'];
            const rawImage = s['backgroundImage'];
            // An invalid color falls back to the default instead of invalidating the whole theme.
            const color = typeof rawColor === 'string' && HEX_COLOR.test(rawColor)
                ? rawColor
                : DEFAULT_SEGMENT_COLOR;
            const backgroundImage = typeof rawImage === 'string' && SAFE_DATA_IMAGE.test(rawImage)
                ? rawImage
                : undefined;
            if (!backgroundImage) return { color };
            const imageFit = sanitizeImageFit(s['imageFit']);
            return imageFit ? { color, backgroundImage, imageFit } : { color, backgroundImage };
        })
        .filter((s) => typeof s.color === 'string' && s.color.length > 0);
    if (segments.length === 0) return null;
    return {
        id: t.id,
        name: t.name,
        description: typeof t.description === 'string' ? t.description : undefined,
        styleTag: typeof t.styleTag === 'string' ? t.styleTag : undefined,
        category: typeof t.category === 'string' ? t.category : undefined,
        segments,
        borderColor: hexOrUndefined(t.borderColor),
        centerColor: hexOrUndefined(t.centerColor),
        pointerColor: hexOrUndefined(t.pointerColor),
        lightColor: hexOrUndefined(t.lightColor),
    };
}

/** Deep copy of a theme. */
export function cloneTheme(t: WheelTheme): WheelTheme {
    return { ...t, segments: t.segments.map((s) => copySegment(s, s.color)) };
}

/** Options of a seed preset, with stable ids. */
function mkPresetOptions(names: string[], prefix: string): WheelOption[] {
    return names.map((name, i) => ({
        id: `${prefix}-opt-${i}`,
        name,
        color: 'indigo',
    }));
}

/** A seed theme by id (the first one as a fallback). */
function defaultThemeById(id: string): WheelTheme {
    return DEFAULT_THEMES.find((theme) => theme.id === id) ?? DEFAULT_THEMES[0];
}

/** Seed presets (their names are localized through seedText in strings.ts). */
export const DEFAULT_PRESETS: WheelPreset[] = [
    {
        id: 'default-preset-cena',
        name: 'Cena de Viernes',
        options: mkPresetOptions(['Pizza Night', 'Sushi', 'Burgers', 'Tacos'], 'cena'),
        theme: cloneTheme(defaultThemeById('theme-neon')),
        updatedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
        tags: [],
    },
    {
        id: 'default-preset-juegos',
        name: 'Juegos de Mesa',
        options: mkPresetOptions(['Catan', 'Carcassonne', 'Dixit', 'Azul', 'Ticket to Ride', 'Pandemic', 'Splendor', 'Codenames'], 'juegos'),
        theme: cloneTheme(defaultThemeById('theme-obsidian')),
        updatedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
        tags: [],
    },
];

