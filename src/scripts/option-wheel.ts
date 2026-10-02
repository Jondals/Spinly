/**
 * Wheel options: the model of an option and the pure helpers that add, rename, remove and reorder them.
 */

export type WheelOption = {
    id: string;
    name: string;
    color: string;
    image?: string;
};

// Palette colors handed to new options, in turn.
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
/** Absolute cap on options; each user's limit is chosen between MIN_OPTIONS and this one. */
export const MAX_WHEEL_OPTIONS = 25;
/** Initial limit until the user changes it in the editor. */
export const DEFAULT_WHEEL_LIMIT = 14;
export const MIN_OPTIONS = 2;

/** A new option with a unique id and the next palette color. */
export function createOption(name: string, index: number): WheelOption {
    return {
        id: crypto.randomUUID(),
        name,
        color: OPTION_COLORS[index % OPTION_COLORS.length] ?? 'indigo',
    };
}

/** The four options of a brand new wheel ("Option 1" … "Option 4"). */
export function createDefaultOptions(label = 'Option'): WheelOption[] {
    return [0, 1, 2, 3].map((index) => createOption(`${label} ${index + 1}`, index));
}

/** Appends a numbered option, unless the wheel is already at its limit. */
export function addOption(options: WheelOption[], limit: number = MAX_WHEEL_OPTIONS, label = 'Option'): WheelOption[] {
    const max = Number.isFinite(limit) ? limit : MAX_WHEEL_OPTIONS;
    if (options.length >= max) return options;
    return [...options, createOption(`${label} ${options.length + 1}`, options.length)];
}

/**
 * Translates only untouched default names; anything the user typed is left alone.
 * Returns the same array when nothing changes, to avoid re-renders.
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

/** Removes an option, keeping at least MIN_OPTIONS. */
export function removeOption(options: WheelOption[], id: string): WheelOption[] {
    if (options.length <= MIN_OPTIONS) return options;
    return options.filter((option) => option.id !== id);
}

/** Renames an option (trimmed to MAX_OPTION_LENGTH). */
export function updateOption(options: WheelOption[], id: string, name: string): WheelOption[] {
    const trimmedName = name.slice(0, MAX_OPTION_LENGTH);
    return options.map((option) => (option.id === id ? { ...option, name: trimmedName } : option));
}

/** Moves an option from one index to another. */
export function reorderOptions(options: WheelOption[], fromIndex: number, toIndex: number): WheelOption[] {
    if (fromIndex === toIndex) return options;
    const updated = [...options];
    const [moved] = updated.splice(fromIndex, 1);
    if (moved === undefined) return options;
    updated.splice(toIndex, 0, moved);
    return updated;
}
