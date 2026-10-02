/**
 * WheelPreview: a small thumbnail of a preset's wheel, used on preset cards.
 */
import type { CSSProperties } from 'react';
import { getWheelBackground } from '../../scripts/wheel';
import { ensureSegments, type WheelPreset } from '../../types/theme-types';

interface WheelPreviewProps {
    preset: WheelPreset;
    /** Bigger size for community cards. */
    large?: boolean;
}

/**
 * Thumbnail of the preset's wheel: its options in its theme colors, with the rim and the pointer in
 * their color. Same sector layout as the real wheel (getWheelBackground). Sector images are not drawn:
 * at this size they would only add weight.
 */
function WheelPreview({ preset, large = false }: WheelPreviewProps) {
    const count = Math.max(preset.options.length, 1);
    const colors = ensureSegments(preset.theme.segments, count).map((segment) => segment.color);
    const style = {
        background: getWheelBackground(preset.options, colors),
        '--preview-pointer': preset.theme.pointerColor ?? 'var(--wheel-pointer-color)',
    } as CSSProperties;
    return (
        <span className={`presets-presets-preview${large ? ' presets-presets-preview--lg' : ''}`} style={style} aria-hidden="true">
            <span className="presets-presets-preview-hub" />
        </span>
    );
}

export default WheelPreview;
