const OPTION_COLORS = [
    'blue',
    'orange',
    'purple',
    'white'
];

export function createOption(name, index) {
    return {
        id: crypto.randomUUID(), 
        name,
        color: OPTION_COLORS[index % OPTION_COLORS.length]
    };
}

export function createDefaultOptions() {
    return [
        createOption('Pizza', 0),
        createOption('Sushi', 1),
        createOption('Tacos', 2),
        createOption('Pasta', 3)
    ];
}

export function addOption(options) {
    return [ ...options, createOption(`Opción ${options.length + 1}`, options.length)];
}

export function removeOption(options, id) {
    return options.filter(option => option.id !== id);
}

export function updateOption(options, id, name) {
    return options.map(option => option.id === id ? { ...option, name } : option);
}