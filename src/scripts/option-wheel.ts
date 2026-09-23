export type WheelOption = {
    id: string;
    name: string;
    color: string;
    image?: string;
};

const OPTION_COLORS: string[] = [
    'indigo',
    'coral',
    'amber',
    'teal',
    'pink',
    'violet',
    'sky',
    'mint',
];

export const MAX_OPTION_LENGTH = 20;
export const MAX_WHEEL_OPTIONS = 25;
export const MIN_OPTIONS = 2;

export function createOption(name: string, index: number): WheelOption {
    return {
        id: crypto.randomUUID(),
        name,
        color: OPTION_COLORS[index % OPTION_COLORS.length] ?? 'indigo',
    };
}

export function createDefaultOptions(label = 'Option'): WheelOption[] {
    return [0, 1, 2, 3].map((index) => createOption(`${label} ${index + 1}`, index));
}

export function addOption(options: WheelOption[], limit: number = MAX_WHEEL_OPTIONS, label = 'Option'): WheelOption[] {
    const max = Number.isFinite(limit) ? limit : MAX_WHEEL_OPTIONS;
    if (options.length >= max) return options;
    return [...options, createOption(`${label} ${options.length + 1}`, options.length)];
}

/**
 * Traduce solo los nombres por defecto sin editar; lo escrito por el usuario no se toca.
 * Devuelve el mismo array si no hay cambios, para no provocar renders.
 */
export function relabelDefaultOptions(options: WheelOption[], knownLabels: readonly string[], label: string): WheelOption[] {
    const escaped = knownLabels.map((known) => known.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`^(?:${escaped.join('|')}) (\\d+)$`);
    let changed = false;
    const next = options.map((option) => {
        const match = pattern.exec(option.name);
        if (!match) return option;
        const renamed = `${label} ${match[1]}`;
        if (renamed === option.name) return option;
        changed = true;
        return { ...option, name: renamed };
    });
    return changed ? next : options;
}

export function removeOption(options: WheelOption[], id: string): WheelOption[] {
    if (options.length <= MIN_OPTIONS) return options;
    return options.filter((option) => option.id !== id);
}

export function updateOption(options: WheelOption[], id: string, name: string): WheelOption[] {
    const trimmedName = name.slice(0, MAX_OPTION_LENGTH);
    return options.map((option) => (option.id === id ? { ...option, name: trimmedName } : option));
}

export function reorderOptions(options: WheelOption[], fromIndex: number, toIndex: number): WheelOption[] {
    if (fromIndex === toIndex) return options;
    const updated = [...options];
    const [moved] = updated.splice(fromIndex, 1);
    if (moved === undefined) return options;
    updated.splice(toIndex, 0, moved);
    return updated;
}
