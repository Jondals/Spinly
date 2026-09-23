import React, { useEffect, useRef } from 'react';
import { useTranslation } from '../lib/i18n';

interface CollapsePanelProps {
    id: string;
    open: boolean;
    title: string;
    onClose: () => void;
    children: React.ReactNode;
}

// Duración de la animación de despliegue (debe coincidir con .spinly-collapse en shared.css)
const EXPAND_MS = 260;

// Panel desplegable (acordeón) compartido por "+ Nuevo" (Presets) y
// "Guardar tema actual" (Themes): siempre DEBAJO de la lista de tarjetas.
// Cerrado queda `inert` (ni foco ni lector de pantalla) pero montado, para
// que la altura pueda animarse también al plegar.
function CollapsePanel({ id, open, title, onClose, children }: CollapsePanelProps) {
    const { t } = useTranslation();
    const rootRef = useRef<HTMLDivElement>(null);

    // Al abrir: foco en el primer campo (sin saltos) y el panel entra en vista,
    // porque vive bajo las tarjetas y puede quedar fuera del scroll del panel.
    useEffect(() => {
        if (!open) return;
        const focusTimer = window.setTimeout(() => {
            rootRef.current?.querySelector<HTMLElement>('input, textarea')?.focus({ preventScroll: true });
        }, 10);
        const scrollTimer = window.setTimeout(() => {
            rootRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }, EXPAND_MS);
        return () => {
            window.clearTimeout(focusTimer);
            window.clearTimeout(scrollTimer);
        };
    }, [open]);

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
        }
    };

    return (
        <div
            id={id}
            ref={rootRef}
            className={`spinly-collapse${open ? ' spinly-collapse--open' : ''}`}
            aria-hidden={!open}
            inert={!open}
            onKeyDown={handleKeyDown}
        >
            <div className="spinly-collapse-inner">
                <div className="spinly-collapse-panel spinly-panel-card">
                    <div className="spinly-collapse-head">
                        <p className="spinly-collapse-title">{title}</p>
                        <button
                            type="button"
                            className="spinly-collapse-close"
                            onClick={onClose}
                            aria-label={t('common', 'close')}
                            title={t('common', 'close')}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24" aria-hidden="true">
                                <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
                            </svg>
                        </button>
                    </div>
                    {children}
                </div>
            </div>
        </div>
    );
}

export default CollapsePanel;
