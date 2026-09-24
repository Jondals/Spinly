import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import Icon from './Icon';
import { useTranslation } from '../i18n/LanguageProvider';

interface CollapsePanelProps {
    id: string;
    open: boolean;
    title: string;
    hint?: string;
    submitLabel: string;
    submitDisabled?: boolean;
    onSubmit: () => void;
    onClose: () => void;
    /** En el sitio de la tarjeta que se edita: se monta ya abierto y entra con un fundido. */
    inline?: boolean;
    children: ReactNode;
}

// Debe coincidir con la transición de .spinly-collapse (shared.css).
const EXPAND_MS = 260;

/**
 * Formulario en acordeón bajo las tarjetas (crear) o en el sitio de una tarjeta (editar,
 * `inline`). Cerrado queda montado pero `inert` (sin foco ni lector de pantalla) para poder
 * animar también el plegado. Enter en un campo de una línea envía el formulario.
 */
function CollapsePanel({ id, open, title, hint, submitLabel, submitDisabled = false, onSubmit, onClose, inline = false, children }: CollapsePanelProps) {
    const { t } = useTranslation();
    const rootRef = useRef<HTMLDivElement>(null);

    // Vive bajo las tarjetas: al abrir puede quedar fuera del scroll del panel.
    useEffect(() => {
        if (!open) return undefined;
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

    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
        }
        if (event.key === 'Enter' && event.target instanceof HTMLInputElement && !submitDisabled) onSubmit();
    };

    return (
        <div
            id={id}
            ref={rootRef}
            className={`spinly-collapse${open ? ' spinly-collapse--open' : ''}${inline ? ' spinly-collapse--inline' : ''}`}
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
                            <Icon name="close" size={14} />
                        </button>
                    </div>
                    {hint && <p className="spinly-collapse-hint">{hint}</p>}
                    {children}
                    <div className="spinly-collapse-actions">
                        <button type="button" className="spinly-action-btn spinly-btn-primary" onClick={onSubmit} disabled={submitDisabled}>
                            {submitLabel}
                        </button>
                        <button type="button" className="spinly-action-btn" onClick={onClose}>
                            {t('common', 'cancel')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default CollapsePanel;
