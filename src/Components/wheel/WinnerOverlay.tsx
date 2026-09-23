import { useId, useRef } from 'react';
import Icon from '../common/Icon';
import Modal from '../common/Modal';
import { useTranslation } from '../i18n/LanguageProvider';

interface WinnerOverlayProps {
    winner: string;
    onClose: () => void;
    onSpinAgain: () => void;
}

/** Resultado del giro sobre un fondo desenfocado; "Girar de nuevo" cierra y lanza otro giro. */
function WinnerOverlay({ winner, onClose, onSpinAgain }: WinnerOverlayProps) {
    const { t } = useTranslation();
    const titleId = useId();
    const spinAgainRef = useRef<HTMLButtonElement>(null);

    return (
        <Modal
            labelledBy={titleId}
            onClose={onClose}
            backdropClassName="wheel-overlay"
            className="wheel-overlay-card"
            initialFocus={spinAgainRef}
            outside={(
                <button
                    type="button"
                    className="wheel-overlay-close"
                    onClick={onClose}
                    aria-label={t('wheel', 'closeResult')}
                    title={t('wheel', 'closeResult')}
                >
                    <Icon name="close" />
                </button>
            )}
        >
            <span className="wheel-overlay-badge spinly-badge">
                <Icon name="trophy" size={12} />
                {t('wheel', 'winnerBadge')}
            </span>
            <p id={titleId} className="wheel-overlay-name">{winner}</p>
            <button ref={spinAgainRef} type="button" className="wheel-overlay-spin spinly-btn-primary" data-sound="none" onClick={onSpinAgain}>
                <Icon name="spin" className="wheel-spin-icon" />
                {t('wheel', 'spinAgain')}
            </button>
        </Modal>
    );
}

export default WinnerOverlay;
