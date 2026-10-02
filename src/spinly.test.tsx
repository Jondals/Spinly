/**
 * UI and integration tests of the whole app, rendered with Testing Library. Supabase, the community, the
 * account services and the music engine are mocked, so everything runs offline in jsdom.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import { LanguageProvider } from './Components/i18n/LanguageProvider';
import { mergeMusicLibraries, sanitizeMusicLibrary } from './scripts/music-library';
import { readMusic, readPulse, setPulseSource } from './scripts/music-pulse';
import { BeatTracker } from './scripts/beat-analysis';
import { fitImageToSector, getImageBox, getSectorAngles, normalizeDegrees, randomSegmentColor, SPIN_DURATION, WHEEL_VIEWBOX } from './scripts/wheel';
import {
    ACTIVE_THEME_STORAGE_KEY,
    DEFAULT_PRESETS,
    DEFAULT_THEMES,
    IMAGE_FIT_LIMITS,
    PRESETS_STORAGE_KEY,
    THEMES_STORAGE_KEY,
    cloneTheme,
    ensureSegments,
    sanitizeImageFit,
    sanitizePreset,
    sanitizeTheme,
    type WheelPreset,
    type WheelTheme,
} from './types/theme-types';

const TEXTURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// Mocked community server. Plain functions rather than jest.fn: CRA enables resetMocks, which would wipe
// their implementations between tests.
const author = { username: 'ana', avatar_url: null };
/** A community theme with the given id. */
const sharedTheme = (id: string): WheelTheme => ({ ...DEFAULT_THEMES[1], id, name: `Shared ${id}` });
/** A community preset with the given id. */
const sharedPreset = (id: string): WheelPreset => ({ ...DEFAULT_PRESETS[1], id, name: `Shared ${id}` });
const mockServer = {
    themes: [] as Array<{ id: string; authorId: string }>,
    presets: [] as Array<{ id: string; authorId: string }>,
    updates: [] as Array<{ table: string; id: string; name: string }>,
    deletes: [] as Array<{ table: string; id: string }>,
};

// Mocked session: a password account by default; guest tests set it to null.
const mockAuth = { session: { userId: 'me', isAnonymous: false } as { userId: string; isAnonymous: boolean } | null };
jest.mock('./hooks/useSessionUserId', () => ({
    useAccountSession: () => mockAuth.session,
    useSessionUserId: () => mockAuth.session?.userId ?? null,
}));

// Mocked account services: no network. validatePassword is the real one.
const mockAccount = {
    profile: null as { id: string; username: string; avatar_url: string | null } | null,
    calls: [] as string[],
    signInResult: null as unknown,
    reloads: 0,
    // What the cloud returns at startup with a session (null: the account has no data yet).
    remote: null as unknown,
};
jest.mock('./scripts/profile', () => ({
    ...jest.requireActual('./scripts/profile'),
    getCurrentSession: async () => null,
    onAuthChange: () => () => undefined,
    fetchProfile: async () => ({ ok: true, data: mockAccount.profile }),
    createAccount: async () => {
        mockAccount.calls.push('createAccount');
        return { ok: true, data: { id: 'me', username: 'ana', avatar_url: null } };
    },
    signInWithUsername: async () => {
        mockAccount.calls.push('signIn');
        return mockAccount.signInResult;
    },
    signOut: async () => {
        mockAccount.calls.push('signOut');
        return { ok: true, data: true };
    },
}));
jest.mock('./scripts/account-data', () => ({
    ...jest.requireActual('./scripts/account-data'),
    fetchAccountData: async () => ({ ok: true, data: mockAccount.remote }),
    saveAccountData: async () => ({ ok: true, data: 1 }),
    adoptAccountData: async () => ({ ok: true, data: true }),
    reloadApp: () => { mockAccount.reloads += 1; },
}));
jest.mock('./scripts/supabaseClient', () => ({
    ...jest.requireActual('./scripts/supabaseClient'),
    isSupabaseConfigured: true,
}));

jest.mock('./scripts/community', () => ({
    fetchCommunityThemes: async () => ({
        ok: true,
        data: mockServer.themes.map(({ id, authorId }) => ({ theme: sharedTheme(id), author, authorId })),
    }),
    fetchCommunityPresets: async () => ({
        ok: true,
        data: mockServer.presets.map(({ id, authorId }) => ({ preset: sharedPreset(id), author, authorId })),
    }),
    shareTheme: async () => ({ ok: true, data: true }),
    sharePreset: async () => ({ ok: true, data: true }),
    updateSharedTheme: async (id: string, theme: WheelTheme) => {
        mockServer.updates.push({ table: 'shared_themes', id, name: theme.name });
        return { ok: true, data: true };
    },
    updateSharedPreset: async (id: string, preset: WheelPreset) => {
        mockServer.updates.push({ table: 'shared_presets', id, name: preset.name });
        return { ok: true, data: true };
    },
    deleteSharedTheme: async (id: string) => {
        mockServer.deletes.push({ table: 'shared_themes', id });
        mockServer.themes = mockServer.themes.filter((row) => row.id !== id);
        return { ok: true, data: true };
    },
    deleteSharedPreset: async (id: string) => {
        mockServer.deletes.push({ table: 'shared_presets', id });
        mockServer.presets = mockServer.presets.filter((row) => row.id !== id);
        return { ok: true, data: true };
    },
}));

// Mocked music: jsdom has neither Web Audio nor IndexedDB. It records what plays and what is uploaded.
const mockMusic = {
    played: [] as string[],
    files: new Map<string, Blob>(),
    cloud: new Map<string, Blob>(),
    uploads: [] as string[],
    cloudDeletes: [] as string[],
};
jest.mock('./scripts/music-engine', () => ({
    createMusicEngine: () => ({
        playBuiltin: (id: string) => { mockMusic.played.push(`builtin:${id}`); },
        playFile: async () => {
            mockMusic.played.push('file');
            return true;
        },
        pause: () => { mockMusic.played.push('pause'); },
        resume: async () => {
            mockMusic.played.push('resume');
            return true;
        },
        setVolume: () => undefined,
        bands: () => ({ bass: 0, mid: 0, high: 0, pitch: 0.5 }),
        live: () => null,
        clock: () => null,
        analyze: async () => null,
        onEnded: () => undefined,
        dispose: () => undefined,
    }),
}));
jest.mock('./scripts/music-files', () => ({
    readTrackFile: async (id: string) => mockMusic.files.get(id) ?? null,
    saveTrackFile: async (id: string, file: Blob) => {
        mockMusic.files.set(id, file);
        return true;
    },
    deleteTrackFile: async (id: string) => { mockMusic.files.delete(id); },
    clearTrackFiles: async () => { mockMusic.files.clear(); },
    uploadTrackFile: async (_uid: string, id: string, file: Blob) => {
        mockMusic.uploads.push(id);
        mockMusic.cloud.set(id, file);
        return { ok: true, data: true };
    },
    downloadTrackFile: async (_uid: string, id: string) => {
        const file = mockMusic.cloud.get(id);
        return file ? { ok: true, data: file } : { ok: false, error: { en: 'missing', es: 'falta' } };
    },
    deleteCloudTrackFile: async (_uid: string, id: string) => {
        mockMusic.cloudDeletes.push(id);
        return { ok: true, data: true };
    },
}));

/** Renders the whole app with its language provider. */
const renderApp = () => render(<LanguageProvider><App /></LanguageProvider>);

/** The active theme as saved in localStorage. */
const storedActiveTheme = (): WheelTheme => JSON.parse(localStorage.getItem(ACTIVE_THEME_STORAGE_KEY) ?? 'null');

beforeEach(() => {
    localStorage.clear();
    // Signing out marks the account switch, and the reload (mocked here) undoes it.
    (jest.requireActual('./scripts/account-data') as typeof import('./scripts/account-data')).endAccountSwitch();
    mockMusic.played = [];
    mockMusic.files.clear();
    mockMusic.cloud.clear();
    mockMusic.uploads = [];
    mockMusic.cloudDeletes = [];
    mockAuth.session = { userId: 'me', isAnonymous: false };
    mockAccount.profile = null;
    mockAccount.calls = [];
    mockAccount.signInResult = null;
    mockAccount.reloads = 0;
    mockAccount.remote = null;
    mockServer.themes = [{ id: 't1', authorId: 'me' }, { id: 't2', authorId: 'other' }, { id: 't3', authorId: 'other' }];
    mockServer.presets = [{ id: 'p1', authorId: 'other' }, { id: 'p2', authorId: 'me' }];
    mockServer.updates = [];
    mockServer.deletes = [];
});

describe('theme and preset model', () => {
    test('cloning and expanding sectors keeps the textures', () => {
        const theme = { id: 't', name: 'T', segments: [{ color: '#6366f1', backgroundImage: TEXTURE }, { color: '#a78bfa' }] };
        expect(cloneTheme(theme).segments[0].backgroundImage).toBe(TEXTURE);
        const expanded = ensureSegments(theme.segments, 5);
        expect(expanded.map((segment) => Boolean(segment.backgroundImage))).toEqual([true, false, true, false, true]);
    });

    test('a preset survives the localStorage JSON round trip with its textures', () => {
        const preset = sanitizePreset(JSON.parse(JSON.stringify({
            id: 'p', name: 'P', updatedAt: 1, tags: [],
            options: [{ id: 'o', name: 'Alpha', color: 'indigo' }],
            theme: { id: 't', name: 'T', segments: [{ color: '#6366f1', backgroundImage: TEXTURE }] },
        })));
        expect(preset?.theme.segments[0].backgroundImage).toBe(TEXTURE);
        expect(preset?.options[0].name).toBe('Alpha');
    });

    test('sanitizeTheme only accepts hex colors and raster data: images', () => {
        const clean = sanitizeTheme({
            id: 'x', name: 'X',
            segments: [
                { color: '#ffffff', backgroundImage: TEXTURE },
                { color: 'red', backgroundImage: 'javascript:alert(1)' },
                { color: '#000000', backgroundImage: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' },
            ],
        });
        expect(clean?.segments[0].backgroundImage).toBe(TEXTURE);
        expect(clean?.segments[1]).toEqual({ color: '#6366f1' });
        expect(clean?.segments[2].backgroundImage).toBeUndefined();
    });

    test('the image fit is clamped, cloned, and dropped without an image', () => {
        expect(sanitizeImageFit({ x: 9, y: -9, scale: 99, rotate: 999 })).toEqual({
            x: IMAGE_FIT_LIMITS.maxOffset, y: -IMAGE_FIT_LIMITS.maxOffset, scale: IMAGE_FIT_LIMITS.maxScale, rotate: IMAGE_FIT_LIMITS.maxRotate,
        });
        expect(sanitizeImageFit('basura')).toBeUndefined();

        const fit = { x: 0.1, y: 0.2, scale: 1.5, rotate: 45 };
        const clean = sanitizeTheme({ id: 't', name: 'T', segments: [{ color: '#111111', backgroundImage: TEXTURE, imageFit: fit }, { color: '#222222', imageFit: fit }] });
        expect(clean?.segments[0].imageFit).toEqual(fit);
        expect(clean?.segments[1].imageFit).toBeUndefined();
        expect(cloneTheme(clean!).segments[0].imageFit).not.toBe(clean!.segments[0].imageFit);
    });
});

describe('wheel geometry', () => {
    test('without a fit the image covers the wheel; with one it moves, scales and rotates', () => {
        expect(getImageBox(undefined)).toEqual({ x: 0, y: 0, width: WHEEL_VIEWBOX, height: WHEEL_VIEWBOX, transform: undefined });
        expect(getImageBox({ x: 0.25, y: -0.1, scale: 0.5, rotate: 30 }, 400))
            .toEqual({ x: 200, y: 60, width: 200, height: 200, transform: 'rotate(30 300 160)' });
    });

    test('fitting to the sector covers the whole sector and is upright when it wins', () => {
        const count = 4;
        const index = 1;
        const fit = fitImageToSector(index, count);
        const { start, end, mid } = getSectorAngles(index, count);
        expect(fit.rotate).toBeCloseTo(normalizeDegrees(mid));

        const half = (fit.scale * WHEEL_VIEWBOX) / 2;
        const cx = WHEEL_VIEWBOX / 2 + fit.x * WHEEL_VIEWBOX;
        const cy = WHEEL_VIEWBOX / 2 + fit.y * WHEEL_VIEWBOX;
        const r = WHEEL_VIEWBOX / 2;
        for (let deg = start; deg <= end; deg += 5) {
            const rad = ((deg - 90) * Math.PI) / 180;
            expect(Math.hypot(r + r * Math.cos(rad) - cx, r + r * Math.sin(rad) - cy)).toBeLessThanOrEqual(half + 1e-6);
        }
        expect(fitImageToSector(0, 1)).toEqual({ x: 0, y: 0, scale: 1, rotate: 0 });
    });

    test('the random color is hsl(h, 70%, 55%) and differs from the previous sector', () => {
        expect(randomSegmentColor(undefined, () => 0)).toBe('#dd3c3c');
        expect(randomSegmentColor('#dd3c3c', () => 0)).not.toBe('#dd3c3c');
    });
});

describe('wheel and editor', () => {
    test('adding an option creates a sector with its own color', () => {
        const { container } = renderApp();
        const before = container.querySelectorAll('.option-swatch').length;
        fireEvent.click(screen.getByRole('button', { name: 'Add option' }));
        const swatches = container.querySelectorAll<HTMLElement>('.option-swatch');
        expect(swatches).toHaveLength(before + 1);
        expect(swatches[before].style.backgroundColor).not.toBe('');
    });

    test('at the minimum of 2 options nothing can be removed and every sector keeps its color', () => {
        const { container } = renderApp();
        fireEvent.click(screen.getByRole('button', { name: 'Add option' }));
        /** Colors of the option swatches, in order. */
        const colors = () => Array.from(container.querySelectorAll<HTMLElement>('.option-swatch')).map((el) => el.style.backgroundColor);
        while (container.querySelectorAll('.option-swatch').length > 2) {
            fireEvent.click(screen.getByRole('button', { name: 'Remove option 1' }));
        }
        const kept = colors();
        expect(new Set(kept).size).toBe(2);

        const remove = screen.getByRole('button', { name: 'Remove option 1' });
        expect(remove).toBeDisabled();
        fireEvent.click(remove);
        expect(colors()).toEqual(kept);
        expect(storedActiveTheme().segments.map((segment) => segment.color)).toHaveLength(2);
    });

    test('the result shows in a dialog outside the wheel and closes with Escape', async () => {
        jest.useFakeTimers();
        try {
            const { container } = renderApp();
            fireEvent.click(screen.getByRole('button', { name: 'SPIN WHEEL' }));
            act(() => { jest.advanceTimersByTime(SPIN_DURATION + 50); });

            const dialog = await screen.findByRole('dialog');
            expect(container.querySelector('.Wheel')?.contains(dialog)).toBe(false);
            expect(within(dialog).getByText('WINNER')).toBeInTheDocument();

            fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
            expect(screen.queryByRole('dialog')).toBeNull();
        } finally {
            jest.useRealTimers();
        }
    });

    test('uploading an image opens the fit editor and Apply saves it centred on its sector', async () => {
        renderApp();
        const file = new File([Uint8Array.from([137, 80, 78, 71])], 'foto.png', { type: 'image/png' });
        fireEvent.change(screen.getByLabelText('Image file for option 2'), { target: { files: [file] } });

        const dialog = await screen.findByRole('dialog', { name: 'Adjust image' });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));

        await waitFor(() => expect(storedActiveTheme().segments[1].backgroundImage).toMatch(/^data:image\/png;base64,/));
        const count = storedActiveTheme().segments.length;
        expect(storedActiveTheme().segments[1].imageFit).toEqual(fitImageToSector(1, count));
    });

    /** Opens a color picker from its trigger and types a hex value into it. */
    const pickColor = async (trigger: string, hex: string) => {
        fireEvent.click(screen.getByRole('button', { name: trigger }));
        const input = await screen.findByLabelText('Color in hex');
        fireEvent.change(input, { target: { value: hex } });
        fireEvent.keyDown(input, { key: 'Enter' });
        fireEvent.keyDown(input, { key: 'Escape' });
    };
    /** A CSS variable set on <html>. */
    const rootVar = (name: string) => document.documentElement.style.getPropertyValue(name);

    test('the pointer and the wheel open their own color pickers (pointer and lights)', async () => {
        renderApp();
        await pickColor('Change the pointer color', '#22c55e');
        expect(rootVar('--wheel-pointer-color')).toBe('#22c55e');
        expect(storedActiveTheme().pointerColor).toBe('#22c55e');

        await pickColor('Change the lights color', '#7c3aed');
        expect(rootVar('--wheel-light-color')).toBe('#7c3aed');
        expect(storedActiveTheme().lightColor).toBe('#7c3aed');
        expect(storedActiveTheme().pointerColor).toBe('#22c55e');
    });

    test('the eyedropper picks a color from the screen; cancelling changes nothing and keeps the picker open', async () => {
        const results: Array<() => Promise<{ sRGBHex: string }>> = [
            async () => ({ sRGBHex: 'rgb(255, 0, 0)' }),
            async () => { throw new DOMException('The user canceled the selection.', 'AbortError'); },
        ];
        class FakeEyeDropper {
            open = () => (results.shift() as () => Promise<{ sRGBHex: string }>)();
        }
        const win = window as unknown as { EyeDropper?: unknown };
        win.EyeDropper = FakeEyeDropper;
        try {
            renderApp();
            fireEvent.click(screen.getByRole('button', { name: 'Change the pointer color' }));
            const dropper = await screen.findByRole('button', { name: 'Pick a color from anywhere on the screen' });

            await act(async () => { fireEvent.click(dropper); });
            expect(rootVar('--wheel-pointer-color')).toBe('#ff0000');
            expect(screen.getByLabelText('Color in hex')).toHaveValue('#ff0000');

            await act(async () => { fireEvent.click(dropper); });
            expect(rootVar('--wheel-pointer-color')).toBe('#ff0000');
            expect(screen.getByRole('dialog', { name: 'Custom color picker' })).toBeInTheDocument();
        } finally {
            delete win.EyeDropper;
        }
    });

    test('without EyeDropper or screen capture (mobile) the eyedropper picks from an image', async () => {
        renderApp();
        fireEvent.click(screen.getByRole('button', { name: 'Change the pointer color' }));
        const dropper = await screen.findByRole('button', { name: 'Pick a color from an image or screenshot' });
        expect(dropper).toBeEnabled();
        const input = document.querySelector<HTMLInputElement>('.cpicker-file');
        expect(input).toHaveAttribute('accept', 'image/*');
        const opened: string[] = [];
        input?.addEventListener('click', () => opened.push('file'));
        fireEvent.click(dropper);
        expect(opened).toEqual(['file']);
    });

    test('without EyeDropper but with screen capture (Firefox, Safari) it asks what to capture; cancelling closes nothing', async () => {
        let requests = 0;
        const nav = navigator as unknown as { mediaDevices?: unknown };
        const win = window as unknown as { isSecureContext?: boolean };
        const originalSecure = win.isSecureContext;
        nav.mediaDevices = {
            getDisplayMedia: async () => {
                requests += 1;
                throw new DOMException('Permission denied', 'NotAllowedError');
            },
        };
        Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
        try {
            renderApp();
            fireEvent.click(screen.getByRole('button', { name: 'Change the pointer color' }));
            const dropper = await screen.findByRole('button', { name: 'Pick a color from the screen: choose the screen, window or tab to capture' });
            await act(async () => { fireEvent.click(dropper); });
            expect(requests).toBe(1);
            expect(dropper).toBeEnabled();
            expect(screen.getByRole('dialog', { name: 'Custom color picker' })).toBeInTheDocument();
        } finally {
            delete nav.mediaDevices;
            Object.defineProperty(window, 'isSecureContext', { value: originalSecure, configurable: true });
        }
    });

    test('the wheel remembers its options; the 4 defaults only appear the first time', () => {
        const first = renderApp();
        expect(first.container.querySelectorAll('.option-swatch')).toHaveLength(4);
        fireEvent.click(screen.getByRole('button', { name: 'Remove option 1' }));
        fireEvent.click(screen.getByRole('button', { name: 'Remove option 1' }));
        const names = screen.getAllByLabelText(/^Option name/).map((input) => (input as HTMLInputElement).value);
        first.unmount();

        const second = renderApp();
        expect(second.container.querySelectorAll('.option-swatch')).toHaveLength(2);
        expect(screen.getAllByLabelText(/^Option name/).map((input) => (input as HTMLInputElement).value)).toEqual(names);
    });

    test('editing an option selects its name, so typing replaces it', () => {
        renderApp();
        const input = screen.getByDisplayValue('Option 1') as HTMLInputElement;
        fireEvent.focus(input);
        expect([input.selectionStart, input.selectionEnd]).toEqual([0, 'Option 1'.length]);
    });

    test('the default limit is 14 and it can go up to 25', () => {
        renderApp();
        /** The option limit button. */
        const limitButton = () => screen.getByTitle('Click to edit the limit');
        expect(limitButton()).toHaveTextContent('14');
        for (let i = 0; i < 12; i++) fireEvent.click(screen.getByRole('button', { name: 'Add option' }));
        expect(screen.getByRole('button', { name: 'Add option' })).toBeDisabled();

        fireEvent.click(limitButton());
        const input = screen.getByLabelText('Option limit (max 25)');
        fireEvent.change(input, { target: { value: '99' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(limitButton()).toHaveTextContent('25');
        expect(screen.getByRole('button', { name: 'Add option' })).toBeEnabled();

        // Only two digits in the field.
        fireEvent.click(limitButton());
        const field = screen.getByLabelText('Option limit (max 25)');
        fireEvent.change(field, { target: { value: '1a23' } });
        expect(field).toHaveValue('12');
        fireEvent.keyDown(field, { key: 'Escape' });
    });

    test('when editing the limit the first digit replaces the value; later ones are appended', () => {
        renderApp();
        fireEvent.click(screen.getByTitle('Click to edit the limit'));
        const field = screen.getByLabelText('Option limit (max 25)');
        expect(field).toHaveValue('14');
        // The caret is at the end: what is typed arrives after "14" and only the new digit is kept.
        fireEvent.change(field, { target: { value: '142' } });
        expect(field).toHaveValue('2');
        fireEvent.change(field, { target: { value: '20' } });
        expect(field).toHaveValue('20');
        fireEvent.keyDown(field, { key: 'Enter' });
        expect(screen.getByTitle('Click to edit the limit')).toHaveTextContent('20');
    });

    test('the limit goes back to 14 on every visit, unless the wheel already has more options', () => {
        const first = renderApp();
        fireEvent.click(screen.getByTitle('Click to edit the limit'));
        const input = screen.getByLabelText('Option limit (max 25)');
        fireEvent.change(input, { target: { value: '20' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(screen.getByTitle('Click to edit the limit')).toHaveTextContent('20');
        first.unmount();

        renderApp();
        expect(screen.getByTitle('Click to edit the limit')).toHaveTextContent('14');
    });

    test('pointer and light colors are saved in themes and presets', async () => {
        renderApp();
        await pickColor('Change the pointer color', '#22c55e');
        await pickColor('Change the lights color', '#7c3aed');

        fireEvent.click(screen.getByRole('button', { name: 'Presets' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Create new preset' }));
        fireEvent.change(screen.getByPlaceholderText('Preset name'), { target: { value: 'Colores' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));
        const preset = (JSON.parse(localStorage.getItem(PRESETS_STORAGE_KEY) ?? '[]') as WheelPreset[])[0];
        expect(preset.theme).toMatchObject({ pointerColor: '#22c55e', lightColor: '#7c3aed' });

        fireEvent.click(screen.getByRole('button', { name: 'Themes' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Save the current visual theme locally' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save theme' }));
        const theme = (JSON.parse(localStorage.getItem(THEMES_STORAGE_KEY) ?? '[]') as WheelTheme[])[0];
        expect(theme).toMatchObject({ pointerColor: '#22c55e', lightColor: '#7c3aed' });
    });

    test('tournament mode: set up from the wheel options, played and won by a champion', async () => {
        renderApp();
        // The language shows its code next to the flag.
        expect(screen.getByRole('button', { name: /Cambiar a español/ })).toHaveTextContent('EN');
        fireEvent.click(screen.getByRole('button', { name: 'Tournament' }));
        // The participants come from the wheel.
        expect(await screen.findByDisplayValue('Option 1')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Option 4')).toBeInTheDocument();
        // Every rule is in view: best of 1 for every duel and the final.
        fireEvent.change(screen.getByRole('spinbutton', { name: 'Every duel' }), { target: { value: '1' } });
        fireEvent.change(screen.getByRole('spinbutton', { name: 'The final' }), { target: { value: '1' } });
        fireEvent.click(screen.getByRole('checkbox', { name: 'Referee mode (force wins)' }));
        fireEvent.click(screen.getByRole('button', { name: /START TOURNAMENT/ }));

        expect(await screen.findByRole('tab', { name: 'Bracket' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('button', { name: /SPIN DUEL/ })).toBeEnabled();
        expect(screen.getByText(/Semifinals · Duel 1 of 3/)).toBeInTheDocument();
        // Three duels decided by the referee: two semifinals and the final.
        for (let duel = 0; duel < 3; duel++) {
            fireEvent.click(screen.getAllByRole('button', { name: /^Give to / })[0]);
        }
        expect(await screen.findByText('CHAMPION')).toBeInTheDocument();
        const saved = JSON.parse(localStorage.getItem('spinly-tournament') ?? 'null') as { events: unknown[] } | null;
        expect(saved?.events).toHaveLength(3);
        // The history lists the referee's decisions.
        fireEvent.click(screen.getByRole('button', { name: 'View bracket' }));
        fireEvent.click(screen.getByRole('tab', { name: 'History' }));
        expect(screen.getAllByText(/Referee gives the duel to/)).toHaveLength(3);
    });

    test('tournament setup: styles fill in the rules and the preview shows the pairings', async () => {
        renderApp();
        fireEvent.click(screen.getByRole('button', { name: 'Tournament' }));
        await screen.findByDisplayValue('Option 1');
        fireEvent.click(screen.getByRole('button', { name: /Epic/ }));
        expect(screen.getByRole('spinbutton', { name: 'Every duel' })).toHaveValue(5);
        expect(screen.getByRole('spinbutton', { name: 'The final' })).toHaveValue(7);
        expect(screen.getByRole('checkbox', { name: 'Third place match' })).toBeChecked();
        expect(screen.getByText('First to 3 points wins · 5 spins at most')).toBeInTheDocument();
        // Changing a rule by hand turns it into "Custom"; best of goes up to 10 and no further.
        fireEvent.click(screen.getByRole('button', { name: 'Every duel: one spin fewer' }));
        expect(screen.getByRole('spinbutton', { name: 'Every duel' })).toHaveValue(4);
        expect(screen.getByText('Custom')).toBeInTheDocument();
        fireEvent.change(screen.getByRole('spinbutton', { name: 'The final' }), { target: { value: '10' } });
        expect(screen.getByRole('button', { name: 'The final: one spin more' })).toBeDisabled();
        expect(screen.getByText('First to 6 points wins · 11 spins at most')).toBeInTheDocument();
        // With list order, the first round shows before starting: 1 against 4 and 2 against 3.
        fireEvent.click(screen.getByRole('radio', { name: /List order/ }));
        const preview = screen.getByText('First round').parentElement as HTMLElement;
        expect(within(preview).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Option 1vsOption 4', 'Option 2vsOption 3']);
        expect(screen.getByText('4 participants · 4 duels · final best of 10')).toBeInTheDocument();
        // The fixed field adds a participant with the typed name and empties itself.
        fireEvent.change(screen.getByRole('textbox', { name: 'New participant name' }), { target: { value: 'Tacos' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
        expect(screen.getByDisplayValue('Tacos')).toBeInTheDocument();
        expect(screen.getByRole('textbox', { name: 'New participant name' })).toHaveValue('');
        expect(screen.getByText('5 participants · 5 duels · final best of 10')).toBeInTheDocument();
    });

    test('applying a theme sets its own pointer and light colors', async () => {
        renderApp();
        await pickColor('Change the pointer color', '#22c55e');
        fireEvent.click(screen.getByRole('button', { name: 'Themes' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Apply theme Neon Nights' }));
        expect(rootVar('--wheel-pointer-color')).toBe(DEFAULT_THEMES[1].pointerColor);
        expect(rootVar('--wheel-light-color')).toBe(DEFAULT_THEMES[1].lightColor);
        expect(storedActiveTheme()).toMatchObject({ pointerColor: '#22d3ee', lightColor: '#f472b6' });
    });

    test('the effects volume is set in the playlist: 0 mutes them and it is remembered', async () => {
        renderApp();
        // On desktop there is no mute button: the volume lives in the playlist mixer.
        expect(screen.queryByRole('button', { name: 'Sounds' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Open playlist' }));
        const slider = await screen.findByRole('slider', { name: 'Sound effects volume' });
        expect(slider).toHaveValue('1');
        fireEvent.change(slider, { target: { value: '0.4' } });
        expect(localStorage.getItem('spinly-sound-volume')).toBe('0.4');
        fireEvent.change(slider, { target: { value: '0' } });
        expect(localStorage.getItem('spinly-sound')).toBe('off');
        // Muting keeps the volume: raising it again brings the sounds back.
        expect(localStorage.getItem('spinly-sound-volume')).toBe('0.4');
        fireEvent.change(slider, { target: { value: '0.7' } });
        expect(localStorage.getItem('spinly-sound')).toBe('on');
    });

    test('buttons play a sound unless muted, even when their icon changes', async () => {
        const played: number[] = [];
        const param = { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined };
        class FakeAudioContext {
            state = 'running';
            currentTime = 0;
            destination = {};
            resume = async () => undefined;
            createGain = () => ({ gain: param, connect: (node: unknown) => node });
            createOscillator = () => ({
                type: 'sine',
                frequency: param,
                connect: (node: unknown) => node,
                start: () => played.push(1),
                stop: () => undefined,
            });
        }
        const original = window.AudioContext;
        window.AudioContext = FakeAudioContext as unknown as typeof AudioContext;
        try {
            renderApp();
            fireEvent.click(screen.getByRole('button', { name: 'Presets' }));
            await screen.findByRole('button', { name: 'Create new preset' });
            expect(played.length).toBeGreaterThan(0);

            // The flag is replaced when the language changes: the click must still play.
            played.length = 0;
            fireEvent.click(screen.getByRole('button', { name: /Cambiar a español/ }).querySelector('svg *') as Element);
            expect(played.length).toBeGreaterThan(0);
            fireEvent.click(screen.getByRole('button', { name: /Switch to English/ }));

            fireEvent.click(screen.getByRole('button', { name: 'Open playlist' }));
            fireEvent.change(await screen.findByRole('slider', { name: 'Sound effects volume' }), { target: { value: '0' } });
            played.length = 0;
            fireEvent.click(screen.getByRole('button', { name: 'Wheel Editor' }));
            expect(played).toHaveLength(0);
        } finally {
            window.AudioContext = original;
        }
    });

    test('each option\'s handle reorders it (also with the arrow keys)', () => {
        renderApp();
        /** Names of the options in the editor, in order. */
        const names = () => screen.getAllByLabelText(/^Option name/).map((input) => (input as HTMLInputElement).value);
        const [first, second] = names();
        fireEvent.keyDown(screen.getByRole('button', { name: /^Move option 1/ }), { key: 'ArrowDown' });
        expect(names().slice(0, 2)).toEqual([second, first]);
    });

    test('loading a preset restores its textures on the wheel and in the editor', async () => {
        const preset: WheelPreset = {
            id: 'con-textura', name: 'Preset con textura', updatedAt: Date.now(), tags: [],
            options: [{ id: 'a', name: 'Uno', color: 'indigo' }, { id: 'b', name: 'Dos', color: 'indigo' }],
            theme: { id: 'tt', name: 'TT', segments: [{ color: '#6366f1', backgroundImage: TEXTURE }, { color: '#a78bfa' }] },
        };
        localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify([preset]));
        const { container } = renderApp();
        expect(container.querySelector('.wheel-img-layer')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Presets' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Load preset Preset con textura' }));
        expect(container.querySelector('.wheel-img-layer image')?.getAttribute('href')).toBe(TEXTURE);

        fireEvent.click(screen.getByRole('button', { name: 'Wheel Editor' }));
        expect(container.querySelectorAll('.option-item--has-img')).toHaveLength(1);
    });

    test('odds show at most two decimals with each language\'s separator', () => {
        renderApp();
        fireEvent.click(screen.getByRole('button', { name: 'Remove option 4' }));
        expect(screen.getByText('Each option has a 33.33% chance (3 options).')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Cambiar a español/ }));
        expect(screen.getByText('Cada opción tiene un 33,33% de probabilidad (3 opciones).')).toBeInTheDocument();
    });

    test('right click does not open the browser menu, except in text fields', () => {
        renderApp();
        // fireEvent returns false when the event is cancelled with preventDefault.
        expect(fireEvent.contextMenu(screen.getByRole('button', { name: 'Presets' }))).toBe(false);
        expect(fireEvent.contextMenu(document.body)).toBe(false);
        expect(fireEvent.contextMenu(screen.getAllByLabelText(/^Option name/)[0])).toBe(true);
    });

    test('the author credit can be hidden and stays hidden', async () => {
        const first = renderApp();
        expect(screen.getByRole('link', { name: /Developed by\s*Jondals/ })).toHaveAttribute('href', 'https://github.com/Jondals');
        fireEvent.click(screen.getByRole('button', { name: 'Hide credit' }));
        await waitFor(() => expect(screen.queryByRole('link', { name: /Jondals/ })).not.toBeInTheDocument());
        first.unmount();

        renderApp();
        expect(screen.queryByRole('link', { name: /Jondals/ })).not.toBeInTheDocument();
    });
});

describe('language', () => {
    test('the header flag and the drawer selector change the language', () => {
        renderApp();
        fireEvent.click(screen.getByRole('button', { name: /Cambiar a español/ }));
        expect(screen.getByRole('button', { name: 'Editor de ruleta' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'EDITOR DE RULETA' })).toBeInTheDocument();
        expect(document.documentElement.lang).toBe('es');

        const english = screen.getByRole('radio', { name: 'English' });
        expect(english).toHaveAttribute('aria-checked', 'false');
        fireEvent.click(english);
        expect(screen.getByRole('button', { name: 'Wheel Editor' })).toBeInTheDocument();
    });
});

describe('community', () => {
    /** The list reloads after every write: waiting for it avoids updates outside act(). */
    const settle = () => waitFor(() => expect(screen.queryByText('Loading community…')).toBeNull());

    /** Opens a panel's Community view and waits for it to load. */
    const openCommunity = async (section: 'Themes' | 'Presets') => {
        const view = renderApp();
        fireEvent.click(screen.getByRole('button', { name: section }));
        fireEvent.click(await screen.findByRole('tab', { name: 'Community' }));
        await settle();
        return view;
    };

    test('the theme counter compares downloaded and available items by id', async () => {
        localStorage.setItem(THEMES_STORAGE_KEY, JSON.stringify([sharedTheme('t2')]));
        await openCommunity('Themes');
        expect(await screen.findByTitle('1 downloaded / 3 available')).toHaveTextContent('1/3 Downloaded');

        fireEvent.click(await screen.findByRole('button', { name: 'Download theme Shared t1' }));
        expect(await screen.findByTitle('2 downloaded / 3 available')).toBeInTheDocument();
        await settle();
    });

    test('a downloaded theme is not downloaded again: the saved copy is applied, with its changes', async () => {
        const local = { ...sharedTheme('t2'), name: 'Mi versión de t2', pointerColor: '#123456' };
        localStorage.setItem(THEMES_STORAGE_KEY, JSON.stringify([local]));
        await openCommunity('Themes');
        expect(screen.queryByRole('button', { name: 'Download theme Shared t2' })).toBeNull();
        fireEvent.click(await screen.findByRole('button', { name: 'Apply theme Shared t2, already downloaded' }));
        expect(await screen.findByText('"Mi versión de t2" was already downloaded.')).toBeInTheDocument();
        expect(storedActiveTheme()).toMatchObject({ id: 't2', name: 'Mi versión de t2', pointerColor: '#123456' });
        const stored = JSON.parse(localStorage.getItem(THEMES_STORAGE_KEY) ?? '[]') as WheelTheme[];
        expect(stored).toEqual([local]);
    });

    test('"Use" keeps a preset\'s id; the second time it uses the saved copy without downloading it', async () => {
        await openCommunity('Presets');
        const use = await screen.findByRole('button', { name: 'Use preset Shared p1' });
        fireEvent.click(use);
        expect(await screen.findByTitle('1 downloaded / 2 available')).toBeInTheDocument();
        const first = JSON.parse(localStorage.getItem(PRESETS_STORAGE_KEY) ?? '[]') as WheelPreset[];

        fireEvent.click(use);
        expect(await screen.findByText('"Shared p1" was already downloaded.')).toBeInTheDocument();
        const second = JSON.parse(localStorage.getItem(PRESETS_STORAGE_KEY) ?? '[]') as WheelPreset[];
        expect(second).toEqual(first);
        expect(second.filter((preset) => preset.id === 'p1')).toHaveLength(1);
    });

    test('cloud edit and delete only appear on the user\'s own rows', async () => {
        await openCommunity('Themes');
        expect(await screen.findByRole('button', { name: 'Edit Shared t1 in the cloud' })).toBeInTheDocument();
        for (const other of ['t2', 't3']) {
            expect(screen.queryByRole('button', { name: `Edit Shared ${other} in the cloud` })).toBeNull();
            expect(screen.queryByRole('button', { name: `Delete Shared ${other} from the cloud` })).toBeNull();
        }
    });

    test('cloud delete asks for a second click and updates the list and the counter', async () => {
        await openCommunity('Themes');
        fireEvent.click(await screen.findByRole('button', { name: 'Delete Shared t1 from the cloud' }));
        expect(mockServer.deletes).toHaveLength(0);
        fireEvent.click(screen.getByRole('button', { name: 'Click again to delete Shared t1 from the cloud' }));

        await waitFor(() => expect(mockServer.deletes).toEqual([{ table: 'shared_themes', id: 't1' }]));
        await waitFor(() => expect(screen.queryByText('Shared t1')).toBeNull());
        expect(await screen.findByTitle('0 downloaded / 2 available')).toBeInTheDocument();
        await settle();
    });

    test('preset cards show their tags, not their options', async () => {
        const preset: WheelPreset = {
            ...sharedPreset('rgb'),
            name: 'RGB',
            tags: ['red', 'green', 'blue'],
            options: [{ id: 'a', name: 'Rojo', color: 'indigo' }, { id: 'b', name: 'Verde', color: 'indigo' }],
        };
        localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify([preset]));
        renderApp();
        fireEvent.click(screen.getByRole('button', { name: 'Presets' }));
        const card = (await screen.findByText('RGB')).closest('li') as HTMLElement;
        const chips = Array.from(card.querySelectorAll('.presets-presets-chips > .presets-presets-chip')).map((chip) => chip.textContent);
        expect(chips).toEqual(['red', 'green', 'blue']);
        expect(within(card).queryByText('Rojo')).toBeNull();
    });

    test('cloud edit opens the form in place of the card and updates the same row', async () => {
        const { container } = await openCommunity('Presets');
        fireEvent.click(await screen.findByRole('button', { name: 'Edit Shared p2 in the cloud' }));

        // The edited card is replaced by the form, inside the list rather than at the end.
        const panel = container.querySelector('#presets-form-edit') as HTMLElement;
        expect(panel).toHaveClass('spinly-collapse--open');
        expect(panel.closest('.presets-presets-grid')).not.toBeNull();
        expect(container.querySelector('#presets-form')).not.toHaveClass('spinly-collapse--open');
        expect(screen.queryByRole('button', { name: 'Use preset Shared p2' })).toBeNull();
        const name = within(panel).getByPlaceholderText('Preset name') as HTMLInputElement;
        expect(name.value).toBe('Shared p2');

        fireEvent.change(name, { target: { value: 'Renombrado' } });
        fireEvent.click(within(panel).getByRole('button', { name: 'Update in the cloud' }));
        await waitFor(() => expect(mockServer.updates).toEqual([{ table: 'shared_presets', id: 'p2', name: 'Renombrado' }]));
        expect(JSON.parse(localStorage.getItem(PRESETS_STORAGE_KEY) ?? '[]')).toHaveLength(0);
        await settle();
    });
});

describe('account', () => {
    const actualAccountData = jest.requireActual('./scripts/account-data') as typeof import('./scripts/account-data');
    /** Opens the profile menu. */
    const openProfile = async () => {
        fireEvent.click(screen.getByRole('button', { name: /^(Open profile|Profile of)/ }));
        return screen.findByRole('dialog', { name: 'User profile' });
    };

    test('creating an account requires a strong password, without the username and repeated identically', async () => {
        mockAuth.session = null;
        renderApp();
        const menu = await openProfile();
        const weak = 'The password is not secure enough: it needs at least 10 characters with lowercase, uppercase, a number and a symbol, and it cannot contain your username.';
        /** Submits the create-account form. */
        const submit = () => fireEvent.submit(within(menu).getByRole('button', { name: 'Create account' }));
        /** Types the password and its repetition. */
        const type = (pass: string, repeat = pass) => {
            fireEvent.change(within(menu).getByLabelText('Password'), { target: { value: pass } });
            fireEvent.change(within(menu).getByLabelText('Repeat the password'), { target: { value: repeat } });
        };
        fireEvent.change(within(menu).getByLabelText('Username'), { target: { value: 'marta' } });

        type('suficiente1');
        const rules = within(menu).getByRole('list', { name: 'Password requirements' });
        expect(within(rules).getByText('An uppercase letter').parentElement).not.toHaveClass('spinly-profile-rule--ok');
        expect(within(rules).getByText('A number').parentElement).toHaveClass('spinly-profile-rule--ok');
        submit();
        expect(await within(menu).findByText(weak)).toBeInTheDocument();

        type('Marta#2024xx');
        expect(within(rules).getByText(`Doesn't include "marta"`).parentElement).not.toHaveClass('spinly-profile-rule--ok');
        submit();
        expect(await within(menu).findByText(weak)).toBeInTheDocument();

        type('Segura#2024x', 'Segura#2024y');
        submit();
        expect(await within(menu).findByText('The passwords do not match.')).toBeInTheDocument();
        expect(mockAccount.calls).toEqual([]);

        type('Segura#2024x');
        submit();
        await waitFor(() => expect(mockAccount.calls).toEqual(['createAccount']));
    });

    test('password requirements: length, lowercase, uppercase, digit, symbol and no username', () => {
        const { passwordChecks, validatePassword } = jest.requireActual('./scripts/profile') as typeof import('./scripts/profile');
        expect(passwordChecks('abc', 'ana')).toEqual({ length: false, lower: true, upper: false, digit: false, symbol: false, noName: true });
        expect(Object.values(passwordChecks('Lluvia#Roja77', 'ana')).every(Boolean)).toBe(true);
        expect(passwordChecks('Ana-Secreta#1', 'ANA').noName).toBe(false);
        expect(validatePassword('Lluvia#Roja77', 'ana')).toBeNull();
        expect(validatePassword('lluvia#roja77', 'ana')).not.toBeNull();
        expect(validatePassword('A#1' + 'b'.repeat(80))).not.toBeNull();
    });

    test('a passwordless profile offers to set one and cannot sign out (it would be lost)', async () => {
        mockAuth.session = { userId: 'me', isAnonymous: true };
        mockAccount.profile = { id: 'me', username: 'ana', avatar_url: null };
        renderApp();
        await screen.findByRole('button', { name: 'Profile of ana' });
        const menu = await openProfile();
        expect(within(menu).getByRole('button', { name: 'Create password' })).toBeInTheDocument();
        expect(within(menu).queryByRole('button', { name: 'Sign out' })).toBeNull();
    });

    test('wrong credentials: a generic error and nothing reloads', async () => {
        mockAuth.session = null;
        mockAccount.signInResult = { ok: false, error: { en: 'Wrong username or password.', es: 'Usuario o contraseña incorrectos.' } };
        renderApp();
        const menu = await openProfile();
        fireEvent.click(within(menu).getByRole('tab', { name: 'Sign in' }));
        fireEvent.change(within(menu).getByLabelText('Username'), { target: { value: 'nadie' } });
        fireEvent.change(within(menu).getByLabelText('Password'), { target: { value: 'loquesea123' } });
        fireEvent.submit(within(menu).getByRole('button', { name: 'Sign in' }));
        expect(await within(menu).findByText('Wrong username or password.')).toBeInTheDocument();
        expect(mockAccount.reloads).toBe(0);

        // After the third failure in a row, a pause before trying again.
        for (let attempt = 2; attempt <= 3; attempt++) {
            fireEvent.change(within(menu).getByLabelText('Password'), { target: { value: 'Otra#prueba1' } });
            fireEvent.submit(within(menu).getByRole('button', { name: 'Sign in' }));
            await waitFor(() => expect(mockAccount.calls).toHaveLength(attempt));
        }
        expect(await within(menu).findByText('Too many attempts. Wait 5 s and try again.')).toBeInTheDocument();
        expect(within(menu).getByRole('button', { name: 'Sign in' })).toBeDisabled();
    });

    test('signing out leaves the app as on a first visit but keeps the language', async () => {
        mockAccount.profile = { id: 'me', username: 'ana', avatar_url: null };
        mockMusic.files.set('cancion-0001', new Blob(['x']));
        sessionStorage.setItem('spinly-splash', '1');
        localStorage.setItem('spinly-lang', 'es');
        localStorage.setItem(THEMES_STORAGE_KEY, JSON.stringify([sharedTheme('t2')]));
        localStorage.setItem('spinly-options', JSON.stringify([{ id: 'a', name: 'A', color: 'indigo' }, { id: 'b', name: 'B', color: 'coral' }]));
        renderApp();
        fireEvent.click(await screen.findByRole('button', { name: 'Perfil de ana' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
        await waitFor(() => expect(mockAccount.reloads).toBe(1));
        expect(mockAccount.calls).toEqual(['signOut']);
        expect(localStorage.getItem(THEMES_STORAGE_KEY)).toBeNull();
        expect(localStorage.getItem('spinly-options')).toBeNull();
        expect(localStorage.getItem('spinly-lang')).toBe('es');
        expect(localStorage.getItem('spinly-music')).toBeNull();
        expect(mockMusic.files.size).toBe(0);
        // Like a first visit: the next load shows the splash screen again.
        expect(sessionStorage.getItem('spinly-splash')).toBeNull();
    });

    test('without a session there are no permanent warnings: downloading works and sharing warns when tried', async () => {
        mockAuth.session = null;
        localStorage.setItem(THEMES_STORAGE_KEY, JSON.stringify([{ ...sharedTheme('mio'), name: 'Mío' }]));
        renderApp();
        fireEvent.click(screen.getByRole('button', { name: 'Themes' }));
        expect(await screen.findByRole('button', { name: 'Share Mío with the community' })).toBeInTheDocument();
        expect(screen.queryByText(/Sign in/)).toBeNull();
        fireEvent.click(await screen.findByRole('tab', { name: 'Community' }));
        expect(await screen.findByRole('button', { name: 'Download theme Shared t1' })).toBeInTheDocument();
    });

    test('sample themes and presets can be deleted and do not come back on reload', async () => {
        const first = renderApp();
        fireEvent.click(screen.getByRole('button', { name: 'Themes' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Delete Neon Nights' }));
        await waitFor(() => expect(screen.queryByText('Neon Nights')).toBeNull());
        first.unmount();

        renderApp();
        fireEvent.click(screen.getByRole('button', { name: 'Themes' }));
        expect(await screen.findByText('Obsidian Flow')).toBeInTheDocument();
        expect(screen.queryByText('Neon Nights')).toBeNull();
    });

    test('at startup cloud data is only applied when it really changed (no needless remount)', async () => {
        const accountData = jest.requireActual('./scripts/account-data') as typeof import('./scripts/account-data');
        accountData.setAppRemount(() => { mockAccount.reloads += 1; });
        try {
            const options = [{ id: 'a', name: 'A', color: 'indigo' }, { id: 'b', name: 'B', color: 'coral' }];
            localStorage.setItem('spinly-options', JSON.stringify(options));
            // A first visit without a session leaves in storage what the app saves at startup.
            mockAuth.session = null;
            renderApp().unmount();
            mockAuth.session = { userId: 'me', isAnonymous: false };
            // The last upload finished with the tab closed: the cloud is "newer" but identical.
            localStorage.setItem('spinly-account-sync', JSON.stringify({ uid: 'me', updatedAt: 1 }));
            mockAccount.remote = accountData.sanitizeAccountData({ ...accountData.readLocalData(), music: null, updatedAt: 5 });
            const first = renderApp();
            await waitFor(() => expect(JSON.parse(localStorage.getItem('spinly-account-sync') ?? '{}').updatedAt).toBe(5));
            expect(mockAccount.reloads).toBe(0);
            first.unmount();

            // Another device changed the options: those are applied.
            mockAccount.remote = accountData.sanitizeAccountData({ ...accountData.readLocalData(), options: [...options, { id: 'c', name: 'C', color: 'teal' }], updatedAt: 9 });
            renderApp();
            await waitFor(() => expect(mockAccount.reloads).toBe(1));
            expect(JSON.parse(localStorage.getItem('spinly-options') ?? '[]')).toHaveLength(3);
        } finally {
            accountData.setAppRemount(null);
        }
    });

    test('account data is sanitized and on sign-in the guest\'s data is added without duplicates', () => {
        const clean = actualAccountData.sanitizeAccountData({
            updatedAt: 5,
            options: [{ name: 'A' }, { name: 'B' }, { name: 42 }],
            activeTheme: { id: 'x', name: 'X', segments: [{ color: 'javascript:alert(1)' }] },
            wheelLimit: 999,
            themes: [sharedTheme('t1'), { basura: true }],
            presets: 'no es una lista',
        });
        expect(clean?.options.map((option) => option.name)).toEqual(['A', 'B']);
        expect(clean?.activeTheme?.segments[0].color).toBe('#6366f1');
        expect(clean?.wheelLimit).toBe(25);
        expect(clean?.themes.map((theme) => theme.id)).toEqual(['t1']);
        expect(clean?.presets).toEqual([]);

        const account = { ...clean!, themes: [sharedTheme('t1')] };
        const guest = { ...clean!, themes: [{ ...sharedTheme('t1'), name: 'versión invitado' }, sharedTheme('t2')] };
        const merged = actualAccountData.mergeGuestData(account, guest);
        expect(merged.themes.map((theme) => [theme.id, theme.name])).toEqual([['t1', 'Shared t1'], ['t2', 'Shared t2']]);
    });
});

describe('music', () => {
    /** A fake audio file. */
    const song = (name: string, type = 'audio/mpeg') => new File(['audio'], name, { type });

    /** Opens the playlist. The panel loads on demand: it waits for it to be painted, not just the dialog. */
    const openPlaylist = async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Open playlist' }));
        const panel = await screen.findByRole('dialog', { name: 'Playlist' });
        await within(panel).findByRole('button', { name: 'Upload songs' });
        return panel;
    };

    /** Uploads files through the playlist's file input. */
    const upload = async (panel: HTMLElement, ...files: File[]) => {
        fireEvent.change(within(panel).getByLabelText('Upload songs'), { target: { files } });
        await within(panel).findByRole('button', { name: `Play ${files[files.length - 1].name.replace(/\.[^.]+$/, '')}` });
    };

    let canPlay: jest.SpyInstance;
    beforeEach(() => {
        canPlay = jest.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('maybe');
    });
    afterEach(() => canPlay.mockRestore());

    test('no built-in songs: the playlist starts empty and the music button leads to uploading', async () => {
        renderApp();
        fireEvent.click(screen.getByRole('button', { name: 'Open playlist' }));
        const panel = await screen.findByRole('dialog', { name: 'Playlist' });
        expect(await within(panel).findByText(/Your playlist is empty/)).toBeInTheDocument();
        expect(within(panel).getByRole('button', { name: 'Play' })).toBeDisabled();
        expect(mockMusic.played).toEqual([]);
    });

    test('uploading songs: they are validated, added to the playlist, saved to the account and removable', async () => {
        renderApp();
        const panel = await openPlaylist();
        const big = new File(['x'], 'Enorme.mp3', { type: 'audio/mpeg' });
        Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
        fireEvent.change(within(panel).getByLabelText('Upload songs'), { target: { files: [song('notas.txt', 'text/plain'), big] } });
        expect(await within(panel).findByText('"Enorme" is over 10 MB.')).toBeInTheDocument();
        expect(mockMusic.files.size).toBe(0);

        await upload(panel, song('Mi canción.mp3', ''));
        await waitFor(() => expect(mockMusic.uploads).toHaveLength(1));
        const [id] = mockMusic.uploads;
        expect(JSON.parse(localStorage.getItem('spinly-music') ?? '{}').playlist).toEqual([{ id, name: 'Mi canción', mime: 'audio/mpeg', size: 5 }]);
        expect(localStorage.getItem('spinly-music-pending')).toBeNull();

        fireEvent.click(within(panel).getByRole('button', { name: 'Remove Mi canción from the playlist' }));
        await waitFor(() => expect(mockMusic.cloudDeletes).toEqual([id]));
        expect(mockMusic.files.has(id)).toBe(false);
        expect(await within(panel).findByText(/Your playlist is empty/)).toBeInTheDocument();
    });

    test('playback: play, pause and resume, skip tracks and reorder', async () => {
        renderApp();
        const panel = await openPlaylist();
        await upload(panel, song('Uno.mp3'), song('Dos.ogg', 'audio/ogg'), song('Tres.wav', 'audio/wav'));

        fireEvent.click(screen.getByRole('button', { name: 'Play music' }));
        await waitFor(() => expect(mockMusic.played).toEqual(['file']));
        expect(within(panel).getByRole('button', { name: 'Play Uno' })).toHaveAttribute('aria-current', 'true');
        expect(localStorage.getItem('spinly-music-on')).toBe('on');

        fireEvent.click(screen.getByRole('button', { name: 'Pause music' }));
        expect(mockMusic.played).toEqual(['file', 'pause']);
        expect(localStorage.getItem('spinly-music-on')).toBe('off');
        // Turning it back on resumes the same song instead of starting another one.
        fireEvent.click(screen.getByRole('button', { name: 'Play music' }));
        await waitFor(() => expect(mockMusic.played).toEqual(['file', 'pause', 'resume']));

        fireEvent.click(within(panel).getByRole('button', { name: 'Next track' }));
        await waitFor(() => expect(within(panel).getByRole('button', { name: 'Play Dos' })).toHaveAttribute('aria-current', 'true'));

        fireEvent.keyDown(within(panel).getByRole('button', { name: /^Move Tres/ }), { key: 'ArrowUp' });
        expect(within(panel).getAllByRole('button', { name: /^Play [A-Z]/ }).map((button) => button.getAttribute('aria-label'))).toEqual(['Play Uno', 'Play Tres', 'Play Dos']);
        expect(JSON.parse(localStorage.getItem('spinly-music') ?? '{}').playlist.map((track: { name: string }) => track.name)).toEqual(['Uno', 'Tres', 'Dos']);
    });

    test('without a session the song stays on the device and uploads after signing in', async () => {
        mockAuth.session = null;
        const first = renderApp();
        const panel = await openPlaylist();
        await upload(panel, song('Invitado.ogg', 'audio/ogg'));
        expect(await within(panel).findByText(/"Invitado" added\. It is saved on this device/)).toBeInTheDocument();
        expect(mockMusic.uploads).toEqual([]);
        expect(JSON.parse(localStorage.getItem('spinly-music-pending') ?? '[]')).toHaveLength(1);
        first.unmount();

        mockAuth.session = { userId: 'me', isAnonymous: false };
        renderApp();
        await waitFor(() => expect(mockMusic.uploads).toHaveLength(1));
        expect(localStorage.getItem('spinly-music-pending')).toBeNull();
    });

    /** The engine's real-time tracker, fed with the given onset strength. */
    const liveTracker = (onset: () => number) => {
        const tracker = new BeatTracker();
        return (analysis: number, at: number) => {
            tracker.push(analysis, onset());
            const predicted = tracker.beatAt(at);
            return predicted && predicted.beat >= 0 ? predicted : null;
        };
    };

    /**
     * Synthetic song at 120 BPM (a beat every 500 ms, the bar starting on the first one) with the given band
     * levels. With `grid`, the prior analysis is ready; without it, only the real-time tracker runs.
     */
    const fakeSong = ({ mid = 0.1, high = 0.05, grid = true, bass = true, period = 0.5 }: { mid?: number; high?: number; grid?: boolean; bass?: boolean; period?: number } = {}) => {
        let songTime = 0;
        const beats = Array.from({ length: 200 }, (_, i) => i * period);
        setPulseSource({
            bands: () => ({ bass: bass && songTime % period < 0.06 ? 0.8 : 0.15, mid, high, pitch: 0.5 }),
            live: liveTracker(() => (bass && songTime % period < 0.016 ? 5 : 0.1)),
            clock: () => ({ audible: songTime, analysis: songTime }),
            grid: () => (grid ? { beats, bpm: 60 / period, downbeat: 0 } : null),
        });
        return {
            advance: (ms: number) => {
                songTime += ms / 1000;
            },
        };
    };

    test('the pulse lands on every beat, stronger on the first beat of a bar, and fades without music', () => {
        // A clock ahead of the real one: other tests already read the pulse with performance.now().
        let time = performance.now() + 1e6;
        const song = fakeSong();
        /** Reads the music state ms milliseconds into the song. */
        const at = (ms: number) => {
            for (let t = 0; t < ms; t += 4) {
                song.advance(4);
                time += 4;
                readMusic(time);
            }
            return readMusic(time);
        };
        at(3992);
        // 4 s: first beat of a bar (the ninth beat); half a beat later, almost off.
        const bar = at(8);
        expect(bar.downbeat).toBe(true);
        expect(bar.sinceBeat).toBeLessThan(20);
        const middle = at(250);
        expect(middle.pulse).toBeLessThan(bar.pulse / 3);
        const second = at(250);
        expect(second.downbeat).toBe(false);
        expect(second.pulse).toBeLessThan(bar.pulse);
        expect(second.pulse).toBeGreaterThan(middle.pulse * 2);
        setPulseSource(null);
        for (let i = 0; i < 60; i++) {
            time += 16;
            readPulse(time);
        }
        expect(readPulse(time + 16)).toBeLessThan(0.01);
    });

    test('the pulse adapts to the tempo: dry in a fast song, long in a slow one', () => {
        let time = performance.now() + 1.5e6;
        // Pulse 120 ms after the fifth bar's first beat (at 4 beats per bar, beat 8).
        const pulseAfterBeat = (period: number) => {
            const song = fakeSong({ period });
            const target = 8 * period + 0.12;
            for (let t = 0; t < target * 1000; t += 4) {
                song.advance(4);
                time += 4;
                readMusic(time);
            }
            return readMusic(time).pulse;
        };
        const fast = pulseAfterBeat(0.33);
        const slow = pulseAfterBeat(0.9);
        expect(slow).toBeGreaterThan(fast * 1.8);
        setPulseSource(null);
    });

    test('music reports the beats, the tempo and a pattern based on how it sounds', () => {
        let time = performance.now() + 2e6;
        /** Plays a fake song with the given levels and returns the pattern it picks. */
        const play = (mid: number, high: number) => {
            const song = fakeSong({ mid, high });
            for (let i = 0; i < 375; i++) {
                song.advance(16);
                time += 16;
                readMusic(time);
            }
            return readMusic(time);
        };
        const bassy = play(0.06, 0.02);
        // 6 s at 120 BPM: the beats from 0 to 6 s, both included.
        expect(bassy.beats).toBe(13);
        expect(bassy.beatMs).toBe(500);
        expect(bassy.pattern).toBe('rings');
        expect(play(0.7, 0.67).pattern).toBe('sparkle');
        expect(play(0.52, 0.04).pattern).toBe('spin');
        setPulseSource(null);
    });

    test('the pattern changes every four bars, right on the first beat of a bar, with a crossfade', () => {
        let time = performance.now() + 3e6;
        const song = fakeSong({ mid: 0.5 });
        const changes: { beats: number; downbeat: boolean; changed: boolean }[] = [];
        let blend = 1;
        let pattern = readMusic(time).pattern;
        for (let t = 0; t < 30000; t += 16) {
            song.advance(16);
            time += 16;
            const frame = readMusic(time);
            // A change: the crossfade starts over.
            if (frame.patternBlend < blend) changes.push({ beats: frame.beats, downbeat: frame.downbeat, changed: frame.pattern !== pattern });
            blend = frame.patternBlend;
            pattern = frame.pattern;
        }
        // The first one on the bar after 2.2 s (at 4 s, the ninth beat); then every 16 beats (8 s at 120 BPM),
        // always on the first beat of a bar and to a different effect.
        expect(changes.map((change) => change.beats)).toEqual([9, 25, 41, 57]);
        expect(changes.every((change) => change.downbeat)).toBe(true);
        expect(changes.slice(1).every((change) => change.changed)).toBe(true);
        setPulseSource(null);
    });

    test('without prior analysis, the real-time tracker locks onto the beat and keeps it through a silence', () => {
        let time = performance.now() + 4e6;
        let hits = true;
        let songTime = 0;
        setPulseSource({
            bands: () => ({ bass: hits && songTime % 0.5 < 0.06 ? 0.8 : 0.15, mid: 0.1, high: 0.05, pitch: 0.5 }),
            live: liveTracker(() => (hits && songTime % 0.5 < 0.016 ? 5 : 0.1)),
            clock: () => ({ audible: songTime, analysis: songTime }),
            grid: () => null,
        });
        /** Advances the fake song to ms milliseconds. */
        const run = (ms: number) => {
            for (let t = 0; t < ms; t += 16) {
                songTime += 0.016;
                time += 16;
                readMusic(time);
            }
            return readMusic(time);
        };
        const locked = run(6000);
        expect(Math.abs(locked.beatMs - 500)).toBeLessThan(10);
        // The clock keeps pace with the song: what is shown (one frame, 16 ms, ahead of what is heard) lines
        // up with the beat. Circular distance within the 500 ms beat.
        const offPhase = (frame: { sinceBeat: number }) => {
            const d = Math.abs(frame.sinceBeat - (((songTime + 0.016) % 0.5) * 1000));
            return Math.min(d, 500 - d);
        };
        expect(offPhase(locked)).toBeLessThan(25);
        hits = false;
        const before = locked.beats;
        const silent = run(3000);
        expect(silent.beats - before).toBe(6);
        expect(offPhase(silent)).toBeLessThan(25);
        setPulseSource(null);
    });

    test('playlists from the account or storage are sanitized and the guest\'s songs are added on sign-in', () => {
        /** A playlist track. */
        const track = (id: string, name = 'Canción') => ({ id, name, mime: 'audio/mpeg', size: 1000 });
        const clean = sanitizeMusicLibrary({
            playlist: [
                // Built-in tracks from older versions no longer exist.
                { kind: 'builtin', builtin: 'neon', id: 'builtin-neon' },
                track('../../otra-carpeta'),
                { ...track('cancion-0001'), kind: 'upload' },
                track('cancion-0001', 'duplicada'),
                { ...track('cancion-0002'), mime: 'text/html' },
                { ...track('cancion-0003'), size: 50 * 1024 * 1024 },
            ],
        });
        expect(clean?.playlist).toEqual([track('cancion-0001')]);
        expect(sanitizeMusicLibrary('basura')).toBeNull();

        const guest = sanitizeMusicLibrary({ playlist: [track('cancion-0001', 'del invitado'), track('cancion-0009', 'Nueva')] });
        const merged = mergeMusicLibraries(clean!, guest!);
        expect(merged.playlist.map((item) => [item.id, item.name])).toEqual([['cancion-0001', 'Canción'], ['cancion-0009', 'Nueva']]);
        const accountData = jest.requireActual('./scripts/account-data') as typeof import('./scripts/account-data');
        expect(accountData.sanitizeAccountData({ music: clean })?.music).toEqual(clean);
    });
});
