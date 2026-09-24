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
    // Editor de ruleta: ajustes de las opciones.
    sliders: {
        body: (
            <>
                <path d="M20 7h-9M14 17H5" />
                <circle cx="17" cy="17" r="3" />
                <circle cx="7" cy="7" r="3" />
            </>
        ),
        strokeWidth: 1.75,
    },
    // Preajustes: configuraciones guardadas.
    bookmark: {
        body: <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" />,
        strokeWidth: 1.75,
    },
    // Temas: el aspecto visual.
    palette: {
        body: (
            <>
                <path d="M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4.5-4.5 4.5H15a2 2 0 0 0-1.5 3.3c.4.5.5 1.2.1 1.7-.4.3-1 .5-1.6.5Z" />
                <circle cx="13.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                <circle cx="17.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
                <circle cx="8.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
                <circle cx="6.5" cy="12.5" r="1" fill="currentColor" stroke="none" />
            </>
        ),
        strokeWidth: 1.75,
    },
    plus: { body: <path d="M12 5v14M5 12h14" />, strokeWidth: 2.5 },
    search: { body: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></> },
    close: { body: <path d="M18 6 6 18M6 6l12 12" /> },
    check: { body: <path d="M20 6 9 17l-5-5" />, strokeWidth: 2.5 },
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
    shieldAlert: {
        body: (
            <>
                <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                <path d="M12 8v4M12 16h.01" />
            </>
        ),
    },
    eye: {
        body: (
            <>
                <path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0" />
                <circle cx="12" cy="12" r="3" />
            </>
        ),
    },
    eyeOff: {
        body: (
            <>
                <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c4.97 0 8.72 3.34 9.94 6.65a1 1 0 0 1 0 .7 10.8 10.8 0 0 1-1.44 2.49M14.08 14.16a3 3 0 0 1-4.24-4.24M17.48 17.5A10.75 10.75 0 0 1 2.06 12.35a1 1 0 0 1 0-.7 10.8 10.8 0 0 1 4.45-5.14" />
                <path d="m2 2 20 20" />
            </>
        ),
    },
    logout: {
        body: (
            <>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="m16 17 5-5-5-5M21 12H9" />
            </>
        ),
    },
    github: {
        body: (
            <>
                <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                <path d="M9 18c-4.51 2-5-2-7-2" />
            </>
        ),
        strokeWidth: 1.75,
    },
    arrowUpRight: { body: <path d="M7 7h10v10M7 17 17 7" /> },
    music: { body: <><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></> },
    listMusic: { body: <><path d="M21 15V6" /><circle cx="18.5" cy="15.5" r="2.5" /><path d="M12 12H3M16 6H3M12 18H3" /></> },
    pause: { body: <><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></> },
    skipBack: { body: <><path d="M19 20 9 12l10-8v16Z" /><path d="M5 19V5" /></> },
    skipForward: { body: <><path d="m5 4 10 8-10 8V4Z" /><path d="M19 5v14" /></> },
    upload: { body: <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /> },
    chevronUp: { body: <path d="m18 15-6-6-6 6" /> },
    cloud: {
        body: <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />,
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
        body: (
            <>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </>
        ),
        strokeWidth: 1.75,
    },
    moon: {
        body: <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />,
        strokeWidth: 1.75,
    },
    user: {
        body: (
            <>
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
            </>
        ),
        strokeWidth: 1.75,
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
