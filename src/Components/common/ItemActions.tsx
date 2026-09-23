import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { useTranslation } from '../i18n/LanguageProvider';

interface ItemActionsProps {
    itemName: string;
    onShare?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
    // Editar y Borrar actúan sobre la fila de la nube.
    cloud?: boolean;
    editing?: boolean;
    busy?: boolean;
}

// Ventana para confirmar el borrado en la nube con un segundo clic.
const CONFIRM_MS = 3000;

// La tarjeta reserva a la derecha el hueco de las acciones que se van a pintar.
export function countItemActions(props: Pick<ItemActionsProps, 'onShare' | 'onEdit' | 'onDelete'>): number {
    return [props.onShare, props.onEdit, props.onDelete].filter(Boolean).length;
}

// Borrar en la nube es irreversible, así que pide un segundo clic.
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
                    <Icon name="share" size={12} />
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
                    <Icon name="edit" size={12} />
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
                    <Icon name={armed ? 'trash' : 'close'} size={12} />
                </button>
            )}
        </div>
    );
}

export default ItemActions;
