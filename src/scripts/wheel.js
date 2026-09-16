const COLORS = {
    indigo: 'var(--item-indigo)',
    coral: 'var(--item-coral)',
    amber: 'var(--item-amber)',
    teal: 'var(--item-teal)',
    pink: 'var(--item-pink)',
    violet: 'var(--item-violet)',
    sky: 'var(--item-sky)',
    mint: 'var(--item-mint)'
};

const LIGHT_COLORS = ['coral', 'amber', 'teal', 'pink', 'violet', 'sky', 'mint'];

export const SPIN_DURATION = 4200;

export function getWheelBackground(options) {
    if (options.length === 0) {
        return undefined;
    }

    if (options.length === 1) {
        return COLORS[options[0].color];
    }

    const segmentAngle = 360 / options.length;

    return `conic-gradient(${
        options.map((option, index) => {
            const start = index * segmentAngle;
            const end = (index + 1) * segmentAngle;
            const color = COLORS[option.color] || 'var(--wheel-color-dark)';
            return `${color} ${start}deg ${end}deg`;
        }).join(', ')
    })`;
}

export function spinWheel(options, rotation) {
    const segmentAngle = 360 / options.length;
    const randomIndex = Math.floor(Math.random() * options.length);
    const randomOffset = Math.random() * segmentAngle;
    const extraTurns = 5 + Math.floor(Math.random() * 3);
    const targetAngle = 360 - (randomIndex * segmentAngle + randomOffset);
    const currentAngle = rotation % 360;
    const delta = (360 - currentAngle + targetAngle) % 360;

    return {
        rotation: rotation + delta + extraTurns * 360,
        winner: options[randomIndex].name
    };
}

export function getLabelTransform(index, total) {
    const segmentAngle = 360 / total;
    const angle = index * segmentAngle + segmentAngle / 2;
    return `rotate(${angle}deg)`;
}

export function isLightColor(color) {
    return LIGHT_COLORS.includes(color);
}