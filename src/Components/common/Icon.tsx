import type { ReactNode } from 'react';

type IconDef = {     /** stroke: iconos de línea (currentColor). fill: sólidos. own: el dibujo trae sus colores. */
    body: ReactNode;
    viewBox?: string;
    paint?: 'stroke' | 'fill' | 'own';
    strokeWidth?: number;
    fit?: 'slice';
};

const defineIcons = <T extends Record<string, IconDef>>(icons: T): T => icons;

const ICONS = defineIcons({
    wheel: {
        body: (
            <>
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
                <path d="M12 3v8.5M12 12l7.8 4.5M12 12L4.2 7.5" />
            </>
        ),
    },
    presets: {
        body: (
            <>
                <rect x="3" y="4" width="18" height="4" rx="1" />
                <rect x="3" y="10" width="18" height="4" rx="1" />
                <rect x="3" y="16" width="18" height="4" rx="1" />
            </>
        ),
    },
    themes: {
        body: (
            <>
                <circle cx="12" cy="12" r="9" />
                <circle cx="8" cy="10" r="1" fill="currentColor" stroke="none" />
                <circle cx="12" cy="8" r="1" fill="currentColor" stroke="none" />
                <circle cx="16" cy="10" r="1" fill="currentColor" stroke="none" />
                <path d="M12 21a9 9 0 0 1 0-18 9 9 0 0 1 5 1.5c1.5.8 1 3-.6 3H14a4 4 0 0 0 0 8h1c1.5 0 2 1.6 1 2.7A8.6 8.6 0 0 1 12 21Z" />
            </>
        ),
    },
    plus: { body: <path d="M12 5v14M5 12h14" />, strokeWidth: 2.5 },
    search: { body: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></> },
    close: { body: <path d="M18 6 6 18M6 6l12 12" /> },
    share: {
        body: (
            <>
                <path d="m16 16-4-4-4 4M12 12v9" />
                <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
            </>
        ),
    },
    edit: { body: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></> },
    trash: {
        body: (
            <>
                <path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </>
        ),
    },
    image: {
        body: (
            <>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="m21 15-5-5L5 21" />
            </>
        ),
    },
    play: { body: <path d="M6 3l14 9-14 9Z" /> },
    eyedropper: {
        body: (
            <>
                <path d="m14.5 5.5 4 4" />
                <path d="M16.2 3.8a2.5 2.5 0 0 1 3.5 3.5l-2.2 2.2-3.5-3.5Z" />
                <path d="M13.3 6.7 5 15v4h4l8.3-8.3" />
            </>
        ),
    },
    download: { body: <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /> },
    save: {
        body: (
            <>
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
                <path d="M17 21v-8H7v8M7 3v5h8" />
            </>
        ),
    },
    spin: {
        body: (
            <>
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                <path d="M8 16H3v5" />
            </>
        ),
        strokeWidth: 2.2,
    },
    shieldCheck: {
        body: (
            <>
                <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                <path d="m9 12 2 2 4-4" />
            </>
        ),
    },
    trophy: {
        body: (
            <>
                <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0Z" />
                <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
            </>
        ),
    },
    soundOn: {
        body: (
            <>
                <path d="M11 5 6 9H2v6h4l5 4V5Z" />
                <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
            </>
        ),
    },
    soundOff: {
        body: (
            <>
                <path d="M11 5 6 9H2v6h4l5 4V5Z" />
                <path d="m22 9-6 6M16 9l6 6" />
            </>
        ),
    },
    sun: {
        paint: 'fill',
        body: <path d="M12 19a1 1 0 0 1 .993.883L13 20v1a1 1 0 0 1-1.993.117L11 21v-1a1 1 0 0 1 1-1m6.313-2.09.094.083.7.7a1 1 0 0 1-1.32 1.497l-.094-.083-.7-.7a1 1 0 0 1 1.218-1.567zm-11.306.083a1 1 0 0 1 .083 1.32l-.083.094-.7.7a1 1 0 0 1-1.497-1.32l.083-.094.7-.7a1 1 0 0 1 1.414 0M4 11a1 1 0 0 1 .117 1.993L4 13H3a1 1 0 0 1-.117-1.993L3 11zm17 0a1 1 0 0 1 .117 1.993L21 13h-1a1 1 0 0 1-.117-1.993L20 11zM6.213 4.81l.094.083.7.7a1 1 0 0 1-1.32 1.497l-.094-.083-.7-.7A1 1 0 0 1 6.11 4.74zm12.894.083a1 1 0 0 1 .083 1.32l-.083.094-.7.7a1 1 0 0 1-1.497-1.32l.083-.094.7-.7a1 1 0 0 1 1.414 0M12 2a1 1 0 0 1 .993.883L13 3v1a1 1 0 0 1-1.993.117L11 4V3a1 1 0 0 1 1-1m0 5a5 5 0 1 1-4.995 5.217L7 12l.005-.217A5 5 0 0 1 12 7" />,
    },
    moon: {
        paint: 'fill',
        body: <path d="M12 1.992a10 10 0 1 0 9.236 13.838c.341-.82-.476-1.644-1.298-1.31a6.5 6.5 0 0 1-6.864-10.787l.077-.08c.551-.63.113-1.653-.758-1.653h-.266l-.068-.006z" />,
    },
    user: {
        paint: 'fill',
        body: <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 1.8c-3.6 0-7.2 1.8-7.2 4.2v1.5h14.4v-1.5c0-2.4-3.6-4.2-7.2-4.2Z" />,
    },
    flagEs: {
        paint: 'own',
        viewBox: '0 0 30 20',
        fit: 'slice',
        body: (
            <>
                <rect width="30" height="20" fill="#aa151b" />
                <rect y="5" width="30" height="10" fill="#f1bf00" />
            </>
        ),
    },
    flagGb: {
        paint: 'own',
        viewBox: '0 0 60 30',
        fit: 'slice',
        body: (
            <>
                <rect width="60" height="30" fill="#012169" />
                <path d="M0 0l60 30M60 0 0 30" stroke="#ffffff" strokeWidth="6" />
                <path d="M0 0l60 30M60 0 0 30" stroke="#c8102e" strokeWidth="2" />
                <path d="M30 0v30M0 15h60" stroke="#ffffff" strokeWidth="10" />
                <path d="M30 0v30M0 15h60" stroke="#c8102e" strokeWidth="6" />
            </>
        ),
    },
    pointer: {
        paint: 'own',
        viewBox: '0 0 36 40',
        body: (
            <>
                <path className="wheel-pointer-body" d="M6 3h24c3.2 0 5.1 3.5 3.4 6.2L20.7 34.7a3.1 3.1 0 0 1-5.4 0L2.6 9.2C.9 6.5 2.8 3 6 3Z" />
                <path className="wheel-pointer-shine" d="M9.5 7h17L18 23.5Z" />
            </>
        ),
    },
});

export type IconName = keyof typeof ICONS;

interface IconProps {
    name: IconName;
    size?: number;
    className?: string;
}

/** Iconos decorativos (aria-hidden): el nombre accesible lo pone siempre el control que los contiene. */
function Icon({ name, size = 16, className }: IconProps) {
    const icon: IconDef = ICONS[name];
    const paint = icon.paint ?? 'stroke';
    const paintProps = paint === 'stroke'
        ? { fill: 'none', stroke: 'currentColor', strokeWidth: icon.strokeWidth ?? 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
        : { fill: paint === 'fill' ? 'currentColor' : 'none' };
    return (
        <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className={className} {...paintProps} height={size} preserveAspectRatio={icon.fit ? 'xMidYMid slice' : undefined} viewBox={icon.viewBox ?? '0 0 24 24'} width={size} focusable="false">{icon.body}</svg>
    );
}

export default Icon;
