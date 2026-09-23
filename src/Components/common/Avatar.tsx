import { useEffect, useState } from 'react';
import Icon from './Icon';
import { useTranslation } from '../i18n/LanguageProvider';

interface AvatarProps {
    src?: string | null;
    alt?: string;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

// Si no hay foto o la URL falla se muestra un placeholder, nunca una imagen rota.
function Avatar({ src, alt = '', size = 'md', className = '' }: AvatarProps) {
    const { t } = useTranslation();
    const [failed, setFailed] = useState(false);

    // Una URL nueva (foto recién subida) vuelve a intentarlo.
    useEffect(() => {
        setFailed(false);
    }, [src]);

    const classes = ['spinly-avatar', `spinly-avatar--${size}`, className].filter(Boolean).join(' ');

    if (src && !failed) {
        return <img src={src} alt={alt} className={classes} onError={() => setFailed(true)} />;
    }

    return (
        <span
            className={`${classes} spinly-avatar--placeholder`}
            role="img"
            aria-label={alt || t('common', 'noPhoto')}
        >
            <Icon name="user" size={24} />
        </span>
    );
}

export default Avatar;