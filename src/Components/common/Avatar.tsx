/**
 * Avatar: a profile photo with a placeholder fallback.
 */
import { useEffect, useState } from 'react';
import Icon from './Icon';
import { useTranslation } from '../i18n/LanguageProvider';

interface AvatarProps {
    src?: string | null;
    alt?: string;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

/** Shows the photo, or a placeholder when there is none or the URL fails: never a broken image. */
function Avatar({ src, alt = '', size = 'md', className = '' }: AvatarProps) {
    const { t } = useTranslation();
    const [failed, setFailed] = useState(false);

    // A new URL (a freshly uploaded photo) gets another try.
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