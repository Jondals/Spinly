const OPTION_COLORS = [
    'indigo',
    'coral',
    'amber',
    'teal',
    'pink',
    'violet',
    'sky',
    'mint'
];

export const MAX_OPTION_LENGTH = 20;
export const MAX_OPTIONS = 10;
export const MIN_OPTIONS = 2;

export function createOption(name, index) {
    return {
        id: crypto.randomUUID(),
        name,
        color: OPTION_COLORS[index % OPTION_COLORS.length]
    };
}

export function createDefaultOptions() {
    return [
        createOption('Option 0', 0),
        createOption('Option 1', 1),
        createOption('Option 2', 2),
        createOption('Option 3', 3)
    ];
}

export function addOption(options) {
    if (options.length >= MAX_OPTIONS) return options;
    return [...options, createOption(`Opción ${options.length + 1}`, options.length)];
}

export function removeOption(options, id) {
    if (options.length <= MIN_OPTIONS) return options;
    return options.filter(option => option.id !== id);
}

export function updateOption(options, id, name) {
    const trimmedName = name.slice(0, MAX_OPTION_LENGTH);
    return options.map(option => option.id === id ? { ...option, name: trimmedName } : option);
}

export function reorderOptions(options, fromIndex, toIndex) {
    if (fromIndex === toIndex) return options;
    const updated = [...options];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    return updated;
}