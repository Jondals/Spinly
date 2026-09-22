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
    {
        id: 'theme-sunset',
        name: 'Sunset Horizon',
        description: 'Degradados crepusculares ámbar, ciruela & cobre vivo.',
        styleTag: 'WARM GRADIENTS',
        category: 'ATMOSFÉRICO',
        segments: [
            seg('#7c2d12'),
            seg('#c2410c'),
            seg('#f59e0b'),
            seg('#fb7185'),
            seg('#881337'),
        ],
        borderColor: '#1c0a00',
        centerColor: '#1c0a00',
        pointerColor: '#ffffff',
    },
    {
        id: 'theme-emerald',
        name: 'Emerald Glow',
        description: 'Verde esmeralda, jade bio-digital & menta sobre ónix.',
        styleTag: 'RADIANTE ORGÁNICO',
        category: 'LUMINISCENTE',
        segments: [
            seg('#064e3b'),
            seg('#059669'),
            seg('#34d399'),
            seg('#065f46'),
            seg('#a7f3d0'),
        ],
        borderColor: '#022c22',
        centerColor: '#022c22',
        pointerColor: '#ffffff',
    },
    {
        id: 'theme-light',
        name: 'Spinly Light',
        description: 'Minimalismo puro, platino de estudio & grafito suave.',
        styleTag: 'STUDIO ARCHITECTURE',
        category: 'MONOCROMO',
        segments: [
            seg('#f8fafc'),
            seg('#e2e8f0'),
            seg('#cbd5e1'),
            seg('#94a3b8'),
            seg('#64748b'),
        ],
        borderColor: '#334155',
        centerColor: '#ffffff',
        pointerColor: '#6366f1',
    },
];

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
export function sanitizeTheme(raw: unknown): WheelTheme | null {
    if (!raw || typeof raw !== 'object') return null;
    const t = raw as Partial<WheelTheme> & { segments?: Array<Record<string, unknown>> };
    if (typeof t.id !== 'string' || typeof t.name !== 'string') return null;
    if (!Array.isArray(t.segments) || t.segments.length === 0) return null;
    const segments: WheelSegmentStyle[] = t.segments
        .filter((s) => s && typeof s === 'object')
        .map((s) => ({
            color: typeof s['color'] === 'string' ? (s['color'] as string) : DEFAULT_SEGMENT_COLOR,
            ...(typeof s['backgroundImage'] === 'string' ? { backgroundImage: s['backgroundImage'] as string } : {}),
        }))
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

export const DEFAULT_PRESETS: WheelPreset[] = [
    {
        id: 'default-preset-cena',
        name: 'Cena de Viernes',
        options: mkPresetOptions(['Pizza Night', 'Sushi', 'Burgers', 'Tacos'], 'cena'),
        theme: cloneTheme(DEFAULT_THEMES[1] as WheelTheme),
        updatedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
        tags: ['Equipo'],
    },
    {
        id: 'default-preset-juegos',
        name: 'Juegos de Mesa',
        options: mkPresetOptions(['Catan', 'Carcassonne', 'Dixit', 'Azul', 'Ticket to Ride', 'Pandemic', 'Splendor', 'Codenames'], 'juegos'),
        theme: cloneTheme(DEFAULT_THEMES[0] as WheelTheme),
        updatedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
        tags: [],
    },
    {
        id: 'default-preset-decisiones',
        name: 'Decisiones Rápidas',
        options: mkPresetOptions(['Sí', 'No', 'Quizás', 'Vuelve a tirar'], 'decisiones'),
        theme: cloneTheme(DEFAULT_THEMES[2] as WheelTheme),
        updatedAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
        tags: ['Frecuente'],
    },
    {
        id: 'default-preset-turnos',
        name: 'Asignación de Turnos',
        options: mkPresetOptions(['Ana', 'Bruno', 'Carla', 'Diego', 'Elena', 'Fede'], 'turnos'),
        theme: cloneTheme(DEFAULT_THEMES[3] as WheelTheme),
        updatedAt: Date.now() - 9 * 24 * 60 * 60 * 1000,
        tags: ['Equipo', 'Scrum'],
    },
];


