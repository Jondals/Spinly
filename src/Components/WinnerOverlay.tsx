import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../lib/i18n';

interface WinnerOverlayProps {
    winner: string;
    onClose: () => void;
    onSpinAgain: () => void;
}

// Resultado del giro como CAPA FLOTANTE: portal a <body> + position: fixed, así
// nunca entra en el flujo del documento (no desplaza ni mueve nada del layout)
// y no la recorta el overflow: hidden de la zona de la ruleta.
// Fondo desenfocado (backdrop-filter, con fallback opaco) y oscurecido.
// Cierre: "Spin Again" (cierra y vuelve a girar), Escape o clic fuera de la tarjeta,
// el mismo patrón que el resto de overlays de la app.
function WinnerOverlay({ winner, onClose, onSpinAgain }: WinnerOverlayProps) {
    const { t } = useTranslation();
    const titleId = useId();
    const spinAgainRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        spinAgainRef.current?.focus({ preventScroll: true });
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    return createPortal(
        <div
            className="wheel-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onPointerDown={(event) => {
                // Clic fuera de la tarjeta (sobre el fondo desenfocado) = cerrar
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <button
                type="button"
                className="wheel-overlay-close"
                onClick={onClose}
                aria-label={t('wheel', 'closeResult')}
                title={t('wheel', 'closeResult')}
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24" aria-hidden="true">
                    <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
                </svg>
            </button>
            <div className="wheel-overlay-card">
                <span className="wheel-overlay-badge spinly-badge">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0Z" />
                        <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
                    </svg>
                    {t('wheel', 'winnerBadge')}
                </span>
                <p id={titleId} className="wheel-overlay-name">{winner}</p>
                <button
                    ref={spinAgainRef}
                    type="button"
                    className="wheel-overlay-spin spinly-btn-primary"
                    onClick={onSpinAgain}
                >
                    <svg className="wheel-spin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                        <path d="M21 3v5h-5" />
                        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                        <path d="M8 16H3v5" />
                    </svg>
                    {t('wheel', 'spinAgain')}
                </button>
            </div>
        </div>,
        document.body,
    );
}

export default WinnerOverlay;
