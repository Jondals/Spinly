import { useLayoutEffect, useRef, useState } from 'react';
import type { WheelOption } from '../scripts/option-wheel';
import { useTranslation } from '../lib/i18n';

interface OptionChipsProps {
    options: WheelOption[];
}

// Sin medidas reales (primer pintado / entorno sin layout): máximo 3 chips + "+N"
const fallbackCount = (total: number): number => (total <= 4 ? total : 3);

// Chips de opciones de un preset en UNA sola fila: se muestran tantos como caben
// (medidos en una capa invisible) y el resto se colapsa en un chip final "+N más".
// Se recalcula al cambiar el ancho de la tarjeta (ResizeObserver).
function OptionChips({ options }: OptionChipsProps) {
    const { t } = useTranslation();
    const rowRef = useRef<HTMLDivElement>(null);
    const measureRef = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(() => fallbackCount(options.length));
    const total = options.length;
    const moreSample = t('presets', 'more', { n: total });
    const namesKey = options.map((option) => option.name).join('\u0000');

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
            // Reserva el hueco del chip "+N" y mete chips mientras quepan
            let used = moreNode.offsetWidth;
            let count = 0;
            for (const width of widths) {
                if (used + gap + width > available) break;
                used += gap + width;
                count += 1;
            }
            // Al menos uno (se recorta con ellipsis si el nombre es larguísimo)
            setVisible(Math.max(1, count));
        };

        compute();
        if (typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(compute);
        observer.observe(row);
        return () => observer.disconnect();
    }, [namesKey, moreSample, total]);

    const hidden = total - visible;

    return (
        <div className="presets-presets-chips" ref={rowRef}>
            {options.slice(0, visible).map((option) => (
                <span key={option.id} className="presets-presets-chip">{option.name}</span>
            ))}
            {hidden > 0 && (
                <span className="presets-presets-chip presets-presets-chip--more">{t('presets', 'more', { n: hidden })}</span>
            )}
            {/* Capa de medida: todos los chips + un "+N" de muestra, invisibles y fuera del flujo */}
            <div className="presets-presets-chips-measure" ref={measureRef} aria-hidden="true">
                {options.map((option) => (
                    <span key={option.id} className="presets-presets-chip">{option.name}</span>
                ))}
                <span className="presets-presets-chip presets-presets-chip--more">{moreSample}</span>
            </div>
        </div>
    );
}

export default OptionChips;
