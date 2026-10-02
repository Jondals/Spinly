/**
 * ItemActions: the share / edit / delete buttons on theme and preset cards.
 */
import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { useTranslation } from '../i18n/LanguageProvider';

interface ItemActionsProps {
    itemName: string;
    onShare?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
    // Edit and Delete act on the cloud row.
    cloud?: boolean;
    editing?: boolean;
    busy?: boolean;
}

// Time window to confirm a cloud delete with a second click.
const CONFIRM_MS = 3000;

/** How many actions a card shows, so it can reserve that much room on its right. */
export function countItemActions(props: Pick<ItemActionsProps, 'onShare' | 'onEdit' | 'onDelete'>): number {
    return [props.onShare, props.onEdit, props.onDelete].filter(Boolean).length;
}

/** The action buttons of a card. Deleting from the cloud cannot be undone, so it asks for a second click. */
function ItemActions({ itemName, onShare, onEdit, onDelete, cloud = false, editing = false, busy = false }: ItemActionsProps) {
    const { t } = useTranslation();
    const [armed, setArmed] = useState(false);
    const armTimer = useRef<number | null>(null);

    useEffect(() => () => {
        if (armTimer.current !== null) window.clearTimeout(armTimer.current);
    }, []);

    /** Deletes right away locally; in the cloud the first click arms the button and the second one deletes. */
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
