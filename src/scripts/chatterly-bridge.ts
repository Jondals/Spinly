/**
 * Talks to the Chatterly that opened or framed Spinly. It only does something when Spinly was opened from
 * Chatterly (a window or a frame opened with ?chatterly=<origin of Chatterly>): it says hello, telling whether the person
 * is signed in, reports results (a spin of the wheel or a tournament champion) so Chatterly can post them
 * in a chat, and, when opened with &link=1, hands over the names and colors of the person's themes and presets
 * so Chatterly can use them in its own wheels. Messages go only to that origin, never to "*", and nothing is
 * received from Chatterly.
 */
import { readLocalData } from './account-data';
import { hasStoredSession } from './supabaseClient';
import { DEFAULT_PRESETS, DEFAULT_THEMES, HIDDEN_DEFAULTS_STORAGE_KEY, type WheelTheme } from '../types/theme-types';

/** A result worth sharing: the winner of a wheel spin or the champion of a tournament. */
export type BridgeResult = {
    kind: 'wheel' | 'tournament';
    /** Tournament name ('' for the wheel). */
    title: string;
    /** Options of the wheel, or the podium of the tournament (best first). */
    names: string[];
    winner: string;
};

/** The window that opened this one, or the page that frames it (Chatterly shows Spinly in a frame). */
function chatterlyWindow(): Window | null {
    if (window.opener) return window.opener as Window;
    return window.parent !== window ? window.parent : null;
}

/** Origin of the Chatterly that opened or framed this page; null when Spinly was opened normally. */
function chatterlyOrigin(): string | null {
    try {
        const raw = new URLSearchParams(window.location.search).get('chatterly');
        if (!raw || !chatterlyWindow()) return null;
        const url = new URL(raw);
        const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
        return url.protocol === 'https:' || local ? url.origin : null;
    } catch {
        return null;
    }
}

/** Sends one message to the Chatterly window, if there is one. */
function send(message: Record<string, unknown>): void {
    const origin = chatterlyOrigin();
    if (!origin) return;
    try {
        (chatterlyWindow() as Window).postMessage({ source: 'spinly', ...message }, origin);
    } catch {
        // Chatterly was closed: nothing to tell.
    }
}

/** Ids of the sample themes and presets the person deleted. */
function hiddenDefaults(): string[] {
    try {
        const raw: unknown = JSON.parse(localStorage.getItem(HIDDEN_DEFAULTS_STORAGE_KEY) ?? '[]');
        return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
    } catch {
        return [];
    }
}

/** A theme reduced to what Chatterly draws: its colors (no images). */
function slimTheme(theme: WheelTheme) {
    return {
        name: theme.name,
        segments: theme.segments.map((segment) => segment.color),
        border: theme.borderColor,
        center: theme.centerColor,
        pointer: theme.pointerColor,
        light: theme.lightColor,
    };
}

/** The themes and presets of this browser (the sample ones that were not deleted and the person's own), reduced to names and colors. */
function buildProfile() {
    const hidden = hiddenDefaults();
    const saved = readLocalData();
    const themes = [...DEFAULT_THEMES.filter((theme) => !hidden.includes(theme.id)), ...saved.themes];
    const presets = [...DEFAULT_PRESETS.filter((preset) => !hidden.includes(preset.id)), ...saved.presets];
    return {
        themes: themes.map(slimTheme),
        presets: presets.map((preset) => ({
            name: preset.name,
            options: preset.options.map((option) => ({ name: option.name, color: option.color })),
            theme: slimTheme(preset.theme),
        })),
    };
}

/** Whether Chatterly opened this window to link the account. */
function isLinking(): boolean {
    return new URLSearchParams(window.location.search).get('link') === '1';
}

/** Says hello to Chatterly, with whether the person is signed in to Spinly. Call once at startup. */
export function startChatterlyBridge(): void {
    const signedIn = hasStoredSession();
    send({ type: 'hello', signedIn });
    if (isLinking() && window.opener) {
        // The window was opened only to link the account: hand the themes and presets over and go away.
        send({ type: 'profile', signedIn, profile: buildProfile() });
        window.setTimeout(() => window.close(), 600);
    }
}

/** Tells Chatterly the result of a spin or a tournament. */
export function reportResult(result: BridgeResult): void {
    send({ type: 'result', result });
}
