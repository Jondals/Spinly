import React, { useEffect, useState } from 'react';

interface AvatarProps {
    src?: string | null;
    alt?: string;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

// Avatar reutilizable (Header + galerías): foto si existe, si no —o si la URL falla—
// placeholder neutro. Nunca inventa fotos ni muestra imágenes rotas.
function Avatar({ src, alt = '', size = 'md', className = '' }: AvatarProps) {
    const [failed, setFailed] = useState(false);

    // Una URL nueva (p. ej. foto recién subida) vuelve a intentar cargar la imagen.
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
            aria-label={alt || 'Sin foto de perfil'}
        >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 1.8c-3.6 0-7.2 1.8-7.2 4.2v1.5h14.4v-1.5c0-2.4-3.6-4.2-7.2-4.2Z" />
            </svg>
        </span>
    );
}

export default Avatar;