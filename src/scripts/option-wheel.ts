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

export function createDefaultOptions(): WheelOption[] {
    return [
        createOption('Option 0', 0),
        createOption('Option 1', 1),
        createOption('Option 2', 2),
        createOption('Option 3', 3),
    ];
}

export function addOption(options: WheelOption[], limit: number = MAX_WHEEL_OPTIONS): WheelOption[] {
    const max = Number.isFinite(limit) ? limit : MAX_WHEEL_OPTIONS;
    if (options.length >= max) return options;
    return [...options, createOption(`Opción ${options.length + 1}`, options.length)];
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
