// Pantalla de carga de public/index.html: se pinta con el HTML, antes que el JS, y la retira la
// app ya montada. Espera un mínimo para que la animación de entrada se vea entera.
const SPLASH_ID = 'spinly-splash';
// Desde el inicio de la navegación: la ruleta del logo acaba de girar y la flecha cae hacia 1,1 s.
const MIN_VISIBLE_MS = 1150;
const REDUCED_MOTION_MIN_MS = 300;
// Coincide con la transición de salida de .spinly-splash--out (public/index.html): un fundido
// lento que deja ver la app debajo, ya pintada y quieta.
const EXIT_MS = 900;

export function hideSplash(): void {
    const splash = document.getElementById(SPLASH_ID);
    // StrictMode monta dos veces en desarrollo: la salida solo se programa una.
    if (!splash || splash.dataset.leaving) return;
    splash.dataset.leaving = 'true';
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    const wait = Math.max(0, (reduced ? REDUCED_MOTION_MIN_MS : MIN_VISIBLE_MS) - performance.now());
    window.setTimeout(() => {
        splash.classList.add('spinly-splash--out');
        window.setTimeout(() => splash.remove(), EXIT_MS + 60);
    }, wait);
}
