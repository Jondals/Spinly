/**
 * Splash screen of public/index.html: it is painted with the HTML, before the JS, and removed by the
 * app once mounted. It waits a minimum time so the entry animation is seen in full.
 */
const SPLASH_ID = 'spinly-splash';
// From the start of navigation: the logo wheel has just finished turning and the pointer and the name
// arrive around 0.95 s, as the exit starts. Any longer and Lighthouse counts it as a slow load.
const MIN_VISIBLE_MS = 850;
const REDUCED_MOTION_MIN_MS = 300;
// Matches the exit transition of .spinly-splash--out (public/index.html): an iris that closes over the
// logo and reveals the app, already painted and still.
const EXIT_MS = 900;
// Written by index.html's inline script: the splash is shown once per tab.
const SEEN_KEY = 'spinly-splash';

/** Signing in or out is like opening the app again: the next load shows the splash again (a normal
    reload does not). */
export function replaySplashOnNextLoad(): void {
    try {
        sessionStorage.removeItem(SEEN_KEY);
    } catch {
        // Without sessionStorage the script could not record it either: it will show anyway.
    }
}

/** Removes the splash: after its minimum time and exit animation, or right away if it was already seen. */
export function hideSplash(): void {
    const splash = document.getElementById(SPLASH_ID);
    // StrictMode mounts twice in development: the exit is scheduled only once.
    if (!splash || splash.dataset.leaving) return;
    splash.dataset.leaving = 'true';
    // Reload or account switch: index.html's script already hid it, it only has to be removed.
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
