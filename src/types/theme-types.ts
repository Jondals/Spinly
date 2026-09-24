import { MAX_OPTION_LENGTH, MAX_WHEEL_OPTIONS } from '../scripts/option-wheel';
import type { WheelOption } from '../scripts/option-wheel';
import { pickText, type SpinlyLang } from '../scripts/strings';

export { MAX_WHEEL_OPTIONS };

/**
 * Encaje de la imagen de un sector, en coordenadas de la ruleta sin girar.
 * x/y: desplazamiento del centro de la imagen respecto al centro de la ruleta,
 * en fracción del diámetro. scale: 1 = la imagen cubre la ruleta entera.
 * rotate: grados alrededor del centro de la imagen.
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

/** Solo visual: los nombres viven en WheelOption. */
export type WheelSegmentStyle = {
    color: string;
    backgroundImage?: string;
    imageFit?: ImageFit;
};

const clampFinite = (value: unknown, min: number, max: number, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(value, min), max) : fallback;

/** Valida un encaje venido de storage/red; undefined si no es un objeto. */
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

function copySegment(s: WheelSegmentStyle | undefined, fallbackColor: string): WheelSegmentStyle {
    const out: WheelSegmentStyle = { color: s?.color ?? fallbackColor };
    if (s?.backgroundImage) {
        out.backgroundImage = s.backgroundImage;
        if (s.imageFit) out.imageFit = { ...s.imageFit };
    }
    return out;
}

/** Solo visual: nunca cambia nombres ni número de opciones. */
export type WheelTheme = {
    id: string;
    name: string;
    description?: string;
    styleTag?: string;
    category?: string;
    segments: WheelSegmentStyle[];
    /** Aro de la ruleta; sin valor se usa el del modo claro/oscuro. */
    borderColor?: string;
    centerColor?: string;
    /** Flecha; sin valor, ámbar (--wheel-pointer-color). */
    pointerColor?: string;
    /** Luces animadas del aro y del centro; sin valor, ámbar (--wheel-light-color). */
    lightColor?: string;
};

/** Opciones más el tema visual completo del momento en que se guardó. */
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

/** Ids de los temas y preajustes de ejemplo que el usuario ha borrado. */
export const HIDDEN_DEFAULTS_STORAGE_KEY = 'spinly-hidden-defaults';

export const DEFAULT_SEGMENT_COLOR = '#6366f1';

const seg = (color: string, backgroundImage?: string): WheelSegmentStyle => (
    backgroundImage ? { color, backgroundImage } : { color }
);

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

/** Estilo del sector `index` ciclando la paleta, sin expandir el tema guardado. */
export function segmentForIndex(
    theme: WheelTheme | null | undefined,
    index: number,
    fallbackColor = DEFAULT_SEGMENT_COLOR
): WheelSegmentStyle {
    const segs = theme?.segments ?? [];
    if (segs.length === 0) return { color: fallbackColor };
    return copySegment(segs[index % segs.length], fallbackColor);
}

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

/** Opciones leídas de storage o de la nube: solo nombre (acotado), id y color; se descartan las vacías. */
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

export function clonePreset(p: WheelPreset): WheelPreset {
    return {
        ...p,
        options: p.options.map((o) => ({ ...o })),
        theme: cloneTheme(p.theme),
        tags: p.tags ? [...p.tags] : [],
    };
}
// Lo que llega de storage o de Supabase no es de fiar: colores solo hex e imágenes solo
// data:image raster (nada de SVG con scripts ni URLs externas).
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpeg|webp|gif|avif);base64,/i;

const hexOrUndefined = (value: unknown): string | undefined =>
    typeof value === 'string' && HEX_COLOR.test(value) ? value : undefined;

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
            // Un color inválido cae al de por defecto en vez de invalidar el tema entero.
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

export function cloneTheme(t: WheelTheme): WheelTheme {
    return { ...t, segments: t.segments.map((s) => copySegment(s, s.color)) };
}

function mkPresetOptions(names: string[], prefix: string): WheelOption[] {
    return names.map((name, i) => ({
        id: `${prefix}-opt-${i}`,
        name,
        color: 'indigo',
    }));
}

function defaultThemeById(id: string): WheelTheme {
    return DEFAULT_THEMES.find((theme) => theme.id === id) ?? DEFAULT_THEMES[0];
}

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

