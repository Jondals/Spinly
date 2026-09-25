// Pantalla de carga de public/index.html: se pinta con el HTML, antes que el JS, y la retira la
// app ya montada. Espera un mínimo para que la animación de entrada se vea entera.
const SPLASH_ID = 'spinly-splash';
// Desde el inicio de la navegación: la ruleta del logo acaba de girar y la flecha y el nombre llegan
// hacia 0,95 s, ya con la salida empezando. Más larga, Lighthouse la cuenta como carga lenta.
const MIN_VISIBLE_MS = 850;
const REDUCED_MOTION_MIN_MS = 300;
// Coincide con la transición de salida de .spinly-splash--out (public/index.html): un iris que se
// cierra sobre el logo y deja ver la app, ya pintada y quieta.
const EXIT_MS = 900;
// Lo anota el script de index.html: la pantalla de carga sale una vez por pestaña.
const SEEN_KEY = 'spinly-splash';

/** Entrar o salir de la cuenta es como abrir la app de nuevo: la próxima carga vuelve a mostrar
    la pantalla de carga (una recarga normal, no). */
export function replaySplashOnNextLoad(): void {
    try {
        sessionStorage.removeItem(SEEN_KEY);
    } catch {
        // Sin sessionStorage el script tampoco pudo anotarla: saldrá igualmente.
    }
}

export function hideSplash(): void {
    const splash = document.getElementById(SPLASH_ID);
    // StrictMode monta dos veces en desarrollo: la salida solo se programa una.
    if (!splash || splash.dataset.leaving) return;
    splash.dataset.leaving = 'true';
    // Recarga o cambio de cuenta: el script de index.html ya la ocultó, solo queda quitarla.
    if (document.documentElement.classList.contains('spinly-splash-seen')) {
        splash.remove();
        return;
    }
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    const wait = Math.max(0, (reduced ? REDUCED_MOTION_MIN_MS : MIN_VISIBLE_MS) - performance.now());
    window.setTimeout(() => {
        splash.classList.add('spinly-splash--out');
        window.setTimeout(() => splash.remove(), EXIT_MS + 60);
    }, wait);
}
