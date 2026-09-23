import { useTranslation } from '../lib/i18n';

interface CommunityCountBadgeProps {
    downloaded: number;
    available: number;
    className?: string;
}

// Badge de la vista Comunidad (Themes y Presets): "X downloaded / Y available".
// Dos líneas apiladas para no robar ancho al título del panel (320px en escritorio).
function CommunityCountBadge({ downloaded, available, className = '' }: CommunityCountBadgeProps) {
    const { t } = useTranslation();
    return (
        <span
            className={`spinly-badge spinly-badge--stack ${className}`.trim()}
            title={t('common', 'communityCount', { x: downloaded, y: available })}
        >
            <span>{t('common', 'communityDownloaded', { x: downloaded })} /</span>{' '}
            <span>{t('common', 'communityAvailable', { y: available })}</span>
        </span>
    );
}

export default CommunityCountBadge;
