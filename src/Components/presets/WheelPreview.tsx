import type { CSSProperties } from 'react';
import { getWheelBackground } from '../../scripts/wheel';
import { ensureSegments, type WheelPreset } from '../../types/theme-types';

interface WheelPreviewProps {
    preset: WheelPreset;
    /** Tamaño mayor para las tarjetas de la comunidad. */
    large?: boolean;
}

/**
 * Miniatura de la ruleta del preajuste: sus opciones con los colores de su tema, el aro y la
 * flecha en su color. Mismo reparto de sectores que la ruleta real (getWheelBackground).
 * Las imágenes de los sectores no se dibujan: a este tamaño solo aportarían peso.
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
