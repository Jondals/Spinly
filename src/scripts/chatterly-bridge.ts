/**
 * Talks to the Chatterly that opened or framed Spinly. It only does something when Spinly was opened from
 * Chatterly (a window or a frame opened with ?chatterly=<origin of Chatterly>): it says hello, telling whether the person
 * is signed in, and reports results (a spin of the wheel or a tournament champion) so Chatterly can post them
 * in a chat. Messages go only to that origin, never to "*", and nothing is received from Chatterly.
 */
import { hasStoredSession } from './supabaseClient';

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

/** A spin that somebody else started: the same options and the same landing angle, so everybody sees the same result. */
export type RemoteSpin = {
    options: { name: string; color: string }[];
    /** Final angle of the disc in degrees. */
    rotation: number;
    winner: string;
};

/** Plain text of at most `max` characters ('' for anything that is not a string). */
function text(value: unknown, max: number): string {
    return typeof value === 'string' ? value.slice(0, max) : '';
}

/** Checks a spin that arrived from Chatterly; returns null when it is not usable. */
function readRemoteSpin(raw: unknown): RemoteSpin | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const record = raw as Record<string, unknown>;
    if (!Array.isArray(record.options) || typeof record.rotation !== 'number' || !Number.isFinite(record.rotation)) return null;
    const options = (record.options as unknown[]).slice(0, 25).map((item) => {
        const entry = (item ?? {}) as Record<string, unknown>;
        return { name: text(entry.name, 20), color: text(entry.color, 16) };
    });
    const winner = text(record.winner, 20);
    return options.length > 0 && winner ? { options, rotation: record.rotation, winner } : null;
}

/** Listens to Chatterly (only to the window and origin that framed or opened this page) for spins to replay. */
function listenToChatterly(): void {
    window.addEventListener('message', (event: MessageEvent) => {
        const origin = chatterlyOrigin();
        if (!origin || event.origin !== origin || event.source !== chatterlyWindow()) return;
        const data = event.data as { source?: string; type?: string; spin?: unknown } | null;
        if (!data || data.source !== 'chatterly' || data.type !== 'remote-spin') return;
        const spin = readRemoteSpin(data.spin);
        if (spin) window.dispatchEvent(new CustomEvent('chatterly-remote-spin', { detail: spin }));
    });
}

/** Tells Chatterly that a spin started here (so the others in a call can watch the same spin). */
export function reportSpin(spin: RemoteSpin): void {
    send({ type: 'spin', spin });
}

/** Says hello to Chatterly, with whether the person is signed in to Spinly. Call once at startup. */
export function startChatterlyBridge(): void {
    listenToChatterly();
    send({ type: 'hello', signedIn: hasStoredSession() });
}

/** Tells Chatterly the result of a spin or a tournament. */
export function reportResult(result: BridgeResult): void {
    send({ type: 'result', result });
}
