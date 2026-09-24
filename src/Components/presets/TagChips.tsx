import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from '../i18n/LanguageProvider';

interface TagChipsProps {
    tags: string[];
}

// Sin medidas reales (primer pintado o entorno sin layout).
const fallbackCount = (total: number): number => (total <= 4 ? total : 3);

/**
 * Etiquetas de un preajuste en una sola fila: se muestran las que caben, medidas en una capa
 * invisible, y el resto se agrupa en "+N". Se recalcula con ResizeObserver al cambiar el ancho.
 */
function TagChips({ tags }: TagChipsProps) {
    const { t } = useTranslation();
    const rowRef = useRef<HTMLDivElement>(null);
    const measureRef = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(() => fallbackCount(tags.length));
    const total = tags.length;
    const moreSample = t('presets', 'more', { n: total });
    const tagsKey = tags.join('\u0000');

    useLayoutEffect(() => {
        const row = rowRef.current;
        const measure = measureRef.current;
        if (!row || !measure) return undefined;

        const compute = () => {
            const available = row.clientWidth;
            const nodes = Array.from(measure.children) as HTMLElement[];
            const moreNode = nodes.pop();
            if (available <= 0 || !moreNode) {
                setVisible(fallbackCount(total));
                return;
            }
            const gap = parseFloat(getComputedStyle(measure).columnGap) || 0;
            const widths = nodes.map((node) => node.offsetWidth);
            const fullWidth = widths.reduce((sum, width, index) => sum + width + (index > 0 ? gap : 0), 0);
            if (fullWidth <= available) {
                setVisible(total);
                return;
            }
            let used = moreNode.offsetWidth;
            let count = 0;
            for (const width of widths) {
                if (used + gap + width > available) break;
                used += gap + width;
                count += 1;
            }
            // Siempre al menos una; si no cabe se recorta con ellipsis.
            setVisible(Math.max(1, count));
        };

        compute();
        if (typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(compute);
        observer.observe(row);
        return () => observer.disconnect();
    }, [tagsKey, moreSample, total]);

    if (total === 0) return null;
    const hidden = total - visible;

    return (
        <div className="presets-presets-chips" ref={rowRef}>
            {tags.slice(0, visible).map((tag, index) => (
                <span key={`${index}-${tag}`} className="presets-presets-chip">{tag}</span>
            ))}
            {hidden > 0 && (
                <span className="presets-presets-chip presets-presets-chip--more">{t('presets', 'more', { n: hidden })}</span>
            )}
            <div className="presets-presets-chips-measure" ref={measureRef} aria-hidden="true">
                {tags.map((tag, index) => (
                    <span key={`${index}-${tag}`} className="presets-presets-chip">{tag}</span>
                ))}
                <span className="presets-presets-chip presets-presets-chip--more">{moreSample}</span>
            </div>
        </div>
    );
}

export default TagChips;
