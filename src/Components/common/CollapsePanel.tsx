/**
 * CollapsePanel: the accordion form used to create or edit themes and presets.
 */
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
    /** In place of the card being edited: it mounts already open and fades in. */
    inline?: boolean;
    children: ReactNode;
}

// Must match the .spinly-collapse transition (shared.css).
const EXPAND_MS = 260;

/**
 * Accordion form below the cards (create) or in place of a card (edit, `inline`). While closed it stays
 * mounted but `inert` (no focus, hidden from screen readers) so folding can be animated too. Enter in a
 * single-line field submits the form.
 */
function CollapsePanel({ id, open, title, hint, submitLabel, submitDisabled = false, onSubmit, onClose, inline = false, children }: CollapsePanelProps) {
    const { t } = useTranslation();
    const rootRef = useRef<HTMLDivElement>(null);

    // It lives below the cards: when it opens it may be outside the panel's scroll, so it is brought into view.
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

    /** Escape closes the form; Enter in a single-line field submits it. */
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
