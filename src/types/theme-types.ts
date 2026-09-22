import { MAX_OPTION_LENGTH, MAX_WHEEL_OPTIONS } from '../scripts/option-wheel';
import type { WheelOption } from '../scripts/option-wheel';

export { MAX_WHEEL_OPTIONS };

// ── Visual-only ──────────────────────────────────────────────
// WheelSegmentStyle es SOLO visual: color + imagen/textura de fondo.
// No incluye label/nombre: los nombres viven en WheelOption (Wheel editor)
// y en WheelPreset.options.
export type WheelSegmentStyle = {
    color: string;
    backgroundImage?: string;
};

// Theme = SOLO visual. No toca nombres ni número de opciones.
export type WheelTheme = {
    id: string;
    name: string;
    description?: string;
    styleTag?: string;
    category?: string;
    segments: WheelSegmentStyle[];
    borderColor?: string;
    centerColor?: string;
    pointerColor?: string;
};

// Preset = TODO: contenido (opciones) + tema visual completo del momento.
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
        const s = segments[i % len];
        out.push({
            color: s?.color ?? fallbackColor,
            backgroundImage: s?.backgroundImage,
        });
    }
    return out;
}

// Visual del sector i ciclando la paleta (sin expandir el tema guardado).
export function segmentForIndex(
    theme: WheelTheme | null | undefined,
    index: number,
    fallbackColor = DEFAULT_SEGMENT_COLOR
): WheelSegmentStyle {
    const segs = theme?.segments ?? [];
    if (segs.length === 0) return { color: fallbackColor };
    const s = segs[index % segs.length];
    return { color: s?.color ?? fallbackColor, backgroundImage: s?.backgroundImage };
}

export function timeAgo(updatedAt: number): string {
    const diff = Date.now() - updatedAt;
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'ahora mismo';
    if (min < 60) return `hace ${min}min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h}h`;
    const d = Math.floor(h / 24);
    if (d < 30) return `hace ${d}d`;
    const m = Math.floor(d / 30);
        if (m < 12) return `hace ${m} mes`;
    return `hace ${Math.floor(m / 12)}a`;
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
        borderColor: '#0b0f19',
        centerColor: '#0b0f19',
        pointerColor: '#818cf8',
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
        borderColor: '#0b0f19',
        centerColor: '#0b0f19',
        pointerColor: '#ffffff',
    },
];

// Sunset Horizon, Emerald Glow y Spinly Light se retiraron temporalmente
// (fase de iteración). Viven en el historial de git por si se recuperan.

// Limpia un preset leído de storage: valida opciones y tema.
export function sanitizePreset(raw: unknown): WheelPreset | null {
    if (!raw || typeof raw !== 'object') return null;
    const p = raw as Partial<WheelPreset>;
    if (typeof p.id !== 'string' || typeof p.name !== 'string') return null;
    if (!Array.isArray(p.options) || p.options.length === 0) return null;
    const theme = sanitizeTheme(p.theme);
    if (!theme) return null;
    const options: WheelOption[] = (p.options as Array<Record<string, unknown>>)
        .filter((o) => o && typeof o === 'object' && typeof o['name'] === 'string')
        .map((o, i) => ({
            id: typeof o['id'] === 'string' ? (o['id'] as string) : `${p.id}-opt-${i}`,
            name: String(o['name']).slice(0, MAX_OPTION_LENGTH),
            color: typeof o['color'] === 'string' ? (o['color'] as string) : 'indigo',
        }))
        .filter((o) => o.name.length > 0);
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

export function clonePreset(p: WheelPreset): WheelPreset {
    return {
        ...p,
        options: p.options.map((o) => ({ ...o })),
        theme: cloneTheme(p.theme),
        tags: p.tags ? [...p.tags] : [],
    };
}
// Sanitización de datos que pueden venir de localStorage o de Supabase (defensa en profundidad):
// colores solo hex saneado y imágenes solo data:image raster segura (sin svg con scripts ni URLs externas).
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpeg|webp|gif|avif);base64,/i;

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
            // Color inválido → fallback al color por defecto (nunca se pierde el tema entero)
            const color = typeof rawColor === 'string' && HEX_COLOR.test(rawColor)
                ? rawColor
                : DEFAULT_SEGMENT_COLOR;
            const backgroundImage = typeof rawImage === 'string' && SAFE_DATA_IMAGE.test(rawImage)
                ? rawImage
                : undefined;
            return backgroundImage ? { color, backgroundImage } : { color };
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
        borderColor: typeof t.borderColor === 'string' ? t.borderColor : undefined,
        centerColor: typeof t.centerColor === 'string' ? t.centerColor : undefined,
        pointerColor: typeof t.pointerColor === 'string' ? t.pointerColor : undefined,
    };
}

export function cloneTheme(t: WheelTheme): WheelTheme {
    return { ...t, segments: t.segments.map((s) => ({ ...s })) };
}

function mkPresetOptions(names: string[], prefix: string): WheelOption[] {
    return names.map((name, i) => ({
        id: `${prefix}-opt-${i}`,
        name,
        color: 'indigo',
    }));
}

// Referencia por ID (no por índice) para no romper si cambia el orden de DEFAULT_THEMES.
function defaultThemeById(id: string): WheelTheme {
    return DEFAULT_THEMES.find((theme) => theme.id === id) ?? DEFAULT_THEMES[0];
}

// Solo 2 presets de ejemplo de momento (fase de iteración).
export const DEFAULT_PRESETS: WheelPreset[] = [
    {
        id: 'default-preset-cena',
        name: 'Cena de Viernes',
        options: mkPresetOptions(['Pizza Night', 'Sushi', 'Burgers', 'Tacos'], 'cena'),
        theme: cloneTheme(defaultThemeById('theme-neon')),
        updatedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
        tags: ['Equipo'],
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

// "Decisiones Rápidas" y "Asignación de Turnos" se retiraron temporalmente
// (fase de iteración). Viven en el historial de git por si se recuperan.


