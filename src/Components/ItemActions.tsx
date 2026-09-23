import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../lib/i18n';

interface ItemActionsProps {
    itemName: string;
    onShare?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
    // Tarjeta propia en la Comunidad: Editar/Borrar actúan sobre la NUBE
    cloud?: boolean;
    editing?: boolean;
    busy?: boolean;
}

// Ventana para confirmar el borrado en la nube (segundo clic)
const CONFIRM_MS = 3000;

// Número de acciones que pintará ItemActions: la tarjeta reserva ese hueco a la derecha
export function countItemActions(props: Pick<ItemActionsProps, 'onShare' | 'onEdit' | 'onDelete'>): number {
    return [props.onShare, props.onEdit, props.onDelete].filter(Boolean).length;
}

// Acciones de tarjeta ÚNICAS para Themes y Presets (mismos iconos, orden y comportamiento):
// Compartir → Editar → Borrar, siempre visibles (también en táctil), esquina superior derecha.
// Borrar en la nube es irreversible: pide un segundo clic (confirmación) antes de ejecutarse.
function ItemActions({ itemName, onShare, onEdit, onDelete, cloud = false, editing = false, busy = false }: ItemActionsProps) {
    const { t } = useTranslation();
    const [armed, setArmed] = useState(false);
    const armTimer = useRef<number | null>(null);

    useEffect(() => () => {
        if (armTimer.current !== null) window.clearTimeout(armTimer.current);
    }, []);

    const handleDelete = () => {
        if (!onDelete) return;
        if (!cloud) {
            onDelete();
            return;
        }
        if (armed) {
            if (armTimer.current !== null) window.clearTimeout(armTimer.current);
            setArmed(false);
            onDelete();
            return;
        }
        setArmed(true);
        armTimer.current = window.setTimeout(() => setArmed(false), CONFIRM_MS);
    };

    const deleteLabel = armed
        ? t('common', 'confirmDeleteCloud', { name: itemName })
        : cloud ? t('common', 'deleteCloudAria', { name: itemName }) : t('common', 'deleteAria', { name: itemName });

    return (
        <div className="spinly-card-actions">
            {onShare && (
                <button
                    type="button"
                    className="spinly-card-action"
                    onClick={onShare}
                    disabled={busy}
                    aria-label={t('common', 'shareAria', { name: itemName })}
                    title={t('common', 'shareCloud')}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                        <polyline points="16 16 12 12 8 16" />
                        <line x1="12" y1="12" x2="12" y2="21" />
                        <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                    </svg>
                </button>
            )}
            {onEdit && (
                <button
                    type="button"
                    className={`spinly-card-action${editing ? ' spinly-card-action--active' : ''}`}
                    onClick={onEdit}
                    disabled={busy}
                    aria-pressed={editing}
                    aria-label={cloud ? t('common', 'editCloudAria', { name: itemName }) : t('common', 'editAria', { name: itemName })}
                    title={cloud ? t('common', 'editCloud') : t('common', 'edit')}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                </button>
            )}
            {onDelete && (
                <button
                    type="button"
                    className={`spinly-card-action spinly-card-action--danger${armed ? ' spinly-card-action--armed' : ''}`}
                    onClick={handleDelete}
                    disabled={busy}
                    aria-label={deleteLabel}
                    title={armed ? t('common', 'confirmDeleteCloud', { name: itemName }) : cloud ? t('common', 'deleteCloud') : t('common', 'delete')}
                >
                    {armed ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6M14 11v6" />
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24" aria-hidden="true">
                            <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
                        </svg>
                    )}
                </button>
            )}
        </div>
    );
}

export default ItemActions;
