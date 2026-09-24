import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import { LanguageProvider } from './Components/i18n/LanguageProvider';
import { mergeMusicLibraries, sanitizeMusicLibrary } from './scripts/music-library';
import { readMusic, readPulse, setPulseSource } from './scripts/music-pulse';
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

// Servidor de la comunidad simulado. Funciones planas y no jest.fn: CRA activa
// resetMocks y borraría sus implementaciones entre tests.
const author = { username: 'ana', avatar_url: null };
const sharedTheme = (id: string): WheelTheme => ({ ...DEFAULT_THEMES[1], id, name: `Shared ${id}` });
const sharedPreset = (id: string): WheelPreset => ({ ...DEFAULT_PRESETS[1], id, name: `Shared ${id}` });
const mockServer = {
    themes: [] as Array<{ id: string; authorId: string }>,
    presets: [] as Array<{ id: string; authorId: string }>,
    updates: [] as Array<{ table: string; id: string; name: string }>,
    deletes: [] as Array<{ table: string; id: string }>,
};

// Sesión simulada: una cuenta con contraseña por defecto; los tests de invitado la ponen a null.
const mockAuth = { session: { userId: 'me', isAnonymous: false } as { userId: string; isAnonymous: boolean } | null };
jest.mock('./hooks/useSessionUserId', () => ({
    useAccountSession: () => mockAuth.session,
    useSessionUserId: () => mockAuth.session?.userId ?? null,
}));

// Servicios de cuenta simulados: sin red. validatePassword es la real.
const mockAccount = {
    profile: null as { id: string; username: string; avatar_url: string | null } | null,
    calls: [] as string[],
    signInResult: null as unknown,
    reloads: 0,
    // Lo que devuelve la nube al arrancar con sesión (null: la cuenta aún no tiene datos).
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

// Música simulada: jsdom no tiene Web Audio ni IndexedDB. Registra lo que suena y lo que se sube.
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

const renderApp = () => render(<LanguageProvider><App /></LanguageProvider>);

const storedActiveTheme = (): WheelTheme => JSON.parse(localStorage.getItem(ACTIVE_THEME_STORAGE_KEY) ?? 'null');

beforeEach(() => {
    localStorage.clear();
    // Cerrar sesión marca el cambio de cuenta y lo deshace la recarga, que aquí es simulada.
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

describe('modelo de temas y presets', () => {
    test('clonar y expandir sectores conserva las texturas', () => {
        const theme = { id: 't', name: 'T', segments: [{ color: '#6366f1', backgroundImage: TEXTURE }, { color: '#a78bfa' }] };
        expect(cloneTheme(theme).segments[0].backgroundImage).toBe(TEXTURE);
        const expanded = ensureSegments(theme.segments, 5);
        expect(expanded.map((segment) => Boolean(segment.backgroundImage))).toEqual([true, false, true, false, true]);
    });

    test('un preset sobrevive al JSON de localStorage con sus texturas', () => {
        const preset = sanitizePreset(JSON.parse(JSON.stringify({
            id: 'p', name: 'P', updatedAt: 1, tags: [],
            options: [{ id: 'o', name: 'Alpha', color: 'indigo' }],
            theme: { id: 't', name: 'T', segments: [{ color: '#6366f1', backgroundImage: TEXTURE }] },
        })));
        expect(preset?.theme.segments[0].backgroundImage).toBe(TEXTURE);
        expect(preset?.options[0].name).toBe('Alpha');
    });

    test('sanitizeTheme solo admite colores hex e imágenes raster en data:', () => {
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

    test('el encaje de imagen se acota, se clona y desaparece sin imagen', () => {
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

describe('geometría de la ruleta', () => {
    test('sin encaje la imagen cubre la ruleta; con encaje se mueve, escala y gira', () => {
        expect(getImageBox(undefined)).toEqual({ x: 0, y: 0, width: WHEEL_VIEWBOX, height: WHEEL_VIEWBOX, transform: undefined });
        expect(getImageBox({ x: 0.25, y: -0.1, scale: 0.5, rotate: 30 }, 400))
            .toEqual({ x: 200, y: 60, width: 200, height: 200, transform: 'rotate(30 300 160)' });
    });

    test('centrar en el sector cubre el sector entero y queda derecha al ganar', () => {
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

    test('el color aleatorio es hsl(h, 70%, 55%) y se aleja del sector anterior', () => {
        expect(randomSegmentColor(undefined, () => 0)).toBe('#dd3c3c');
        expect(randomSegmentColor('#dd3c3c', () => 0)).not.toBe('#dd3c3c');
    });
});

describe('ruleta y editor', () => {
    test('añadir una opción crea un sector con color propio', () => {
        const { container } = renderApp();
        const before = container.querySelectorAll('.option-swatch').length;
        fireEvent.click(screen.getByRole('button', { name: 'Add option' }));
        const swatches = container.querySelectorAll<HTMLElement>('.option-swatch');
        expect(swatches).toHaveLength(before + 1);
        expect(swatches[before].style.backgroundColor).not.toBe('');
    });

    test('en el mínimo de 2 opciones no se puede eliminar y cada sector conserva su color', () => {
        const { container } = renderApp();
        fireEvent.click(screen.getByRole('button', { name: 'Add option' }));
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

    test('el resultado se muestra en un diálogo fuera de la ruleta y se cierra con Escape', async () => {
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

    test('subir una imagen abre el editor de encaje y Aplicar la guarda centrada en su sector', async () => {
        renderApp();
        const file = new File([Uint8Array.from([137, 80, 78, 71])], 'foto.png', { type: 'image/png' });
        fireEvent.change(screen.getByLabelText('Image file for option 2'), { target: { files: [file] } });

        const dialog = await screen.findByRole('dialog', { name: 'Adjust image' });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));

        await waitFor(() => expect(storedActiveTheme().segments[1].backgroundImage).toMatch(/^data:image\/png;base64,/));
        const count = storedActiveTheme().segments.length;
        expect(storedActiveTheme().segments[1].imageFit).toEqual(fitImageToSector(1, count));
    });

    const pickColor = async (trigger: string, hex: string) => {
        fireEvent.click(screen.getByRole('button', { name: trigger }));
        const input = await screen.findByLabelText('Color in hex');
        fireEvent.change(input, { target: { value: hex } });
        fireEvent.keyDown(input, { key: 'Enter' });
        fireEvent.keyDown(input, { key: 'Escape' });
    };
    const rootVar = (name: string) => document.documentElement.style.getPropertyValue(name);

    test('la flecha y la ruleta abren su propio selector de color (flecha y luces)', async () => {
        renderApp();
        await pickColor('Change the pointer color', '#22c55e');
        expect(rootVar('--wheel-pointer-color')).toBe('#22c55e');
        expect(storedActiveTheme().pointerColor).toBe('#22c55e');

        await pickColor('Change the lights color', '#7c3aed');
        expect(rootVar('--wheel-light-color')).toBe('#7c3aed');
        expect(storedActiveTheme().lightColor).toBe('#7c3aed');
        expect(storedActiveTheme().pointerColor).toBe('#22c55e');
    });

    test('la pipeta toma un color de la pantalla; cancelarla no cambia nada ni cierra el selector', async () => {
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

    test('sin EyeDropper ni captura de pantalla (móvil) la pipeta toma el color de una imagen', async () => {
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

    test('sin EyeDropper pero con captura de pantalla (Firefox, Safari) pide qué capturar; cancelar no cierra nada', async () => {
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

    test('la ruleta recuerda sus opciones; las 4 por defecto solo salen la primera vez', () => {
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

    test('el límite por defecto es 14 y se puede subir hasta 25', () => {
        renderApp();
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

        // Solo dos cifras en el campo.
        fireEvent.click(limitButton());
        const field = screen.getByLabelText('Option limit (max 25)');
        fireEvent.change(field, { target: { value: '1a23' } });
        expect(field).toHaveValue('12');
        fireEvent.keyDown(field, { key: 'Escape' });
    });

    test('al editar el límite la primera cifra sustituye al valor; después se escribe detrás', () => {
        renderApp();
        fireEvent.click(screen.getByTitle('Click to edit the limit'));
        const field = screen.getByLabelText('Option limit (max 25)');
        expect(field).toHaveValue('14');
        // El cursor está al final: lo tecleado llega detrás de "14" y se queda solo la cifra nueva.
        fireEvent.change(field, { target: { value: '142' } });
        expect(field).toHaveValue('2');
        fireEvent.change(field, { target: { value: '20' } });
        expect(field).toHaveValue('20');
        fireEvent.keyDown(field, { key: 'Enter' });
        expect(screen.getByTitle('Click to edit the limit')).toHaveTextContent('20');
    });

    test('el límite vuelve a 14 en cada visita, salvo que la ruleta ya tenga más opciones', () => {
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

    test('los colores de flecha y luces se guardan en temas y presets', async () => {
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

    test('aplicar un tema pone sus propios colores de flecha y luces', async () => {
        renderApp();
        await pickColor('Change the pointer color', '#22c55e');
        fireEvent.click(screen.getByRole('button', { name: 'Themes' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Apply theme Neon Nights' }));
        expect(rootVar('--wheel-pointer-color')).toBe(DEFAULT_THEMES[1].pointerColor);
        expect(rootVar('--wheel-light-color')).toBe(DEFAULT_THEMES[1].lightColor);
        expect(storedActiveTheme()).toMatchObject({ pointerColor: '#22d3ee', lightColor: '#f472b6' });
    });

    test('el volumen de los efectos se regula en la playlist: a 0 los apaga y se recuerda', async () => {
        renderApp();
        // En escritorio no hay botón de silenciar: el volumen vive en el mezclador de la playlist.
        expect(screen.queryByRole('button', { name: 'Sounds' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Open playlist' }));
        const slider = await screen.findByRole('slider', { name: 'Sound effects volume' });
        expect(slider).toHaveValue('1');
        fireEvent.change(slider, { target: { value: '0.4' } });
        expect(localStorage.getItem('spinly-sound-volume')).toBe('0.4');
        fireEvent.change(slider, { target: { value: '0' } });
        expect(localStorage.getItem('spinly-sound')).toBe('off');
        // Apagados no pierden el volumen: al subirlo de nuevo vuelven a sonar.
        expect(localStorage.getItem('spinly-sound-volume')).toBe('0.4');
        fireEvent.change(slider, { target: { value: '0.7' } });
        expect(localStorage.getItem('spinly-sound')).toBe('on');
    });

    test('los botones suenan salvo con el sonido silenciado, también si cambian su icono', async () => {
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

            // La bandera se sustituye al cambiar de idioma: el clic debe sonar igualmente.
            played.length = 0;
            fireEvent.click(screen.getByRole('button', { name: 'Cambiar a español' }).querySelector('svg *') as Element);
            expect(played.length).toBeGreaterThan(0);
            fireEvent.click(screen.getByRole('button', { name: 'Switch to English' }));

            fireEvent.click(screen.getByRole('button', { name: 'Open playlist' }));
            fireEvent.change(await screen.findByRole('slider', { name: 'Sound effects volume' }), { target: { value: '0' } });
            played.length = 0;
            fireEvent.click(screen.getByRole('button', { name: 'Wheel Editor' }));
            expect(played).toHaveLength(0);
        } finally {
            window.AudioContext = original;
        }
    });

    test('el asa de cada opción la reordena (también con las flechas del teclado)', () => {
        renderApp();
        const names = () => screen.getAllByLabelText(/^Option name/).map((input) => (input as HTMLInputElement).value);
        const [first, second] = names();
        fireEvent.keyDown(screen.getByRole('button', { name: /^Move option 1/ }), { key: 'ArrowDown' });
        expect(names().slice(0, 2)).toEqual([second, first]);
    });

    test('cargar un preset restaura las texturas en la ruleta y en el editor', async () => {
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

    test('la probabilidad se muestra con dos decimales como mucho y el separador de cada idioma', () => {
        renderApp();
        fireEvent.click(screen.getByRole('button', { name: 'Remove option 4' }));
        expect(screen.getByText('Each option has a 33.33% chance (3 options).')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Cambiar a español' }));
        expect(screen.getByText('Cada opción tiene un 33,33% de probabilidad (3 opciones).')).toBeInTheDocument();
    });

    test('el clic derecho no abre el menú del navegador, salvo en los campos de texto', () => {
        renderApp();
        // fireEvent devuelve false cuando el evento se cancela con preventDefault.
        expect(fireEvent.contextMenu(screen.getByRole('button', { name: 'Presets' }))).toBe(false);
        expect(fireEvent.contextMenu(document.body)).toBe(false);
        expect(fireEvent.contextMenu(screen.getAllByLabelText(/^Option name/)[0])).toBe(true);
    });

    test('la firma se puede ocultar y sigue oculta al volver', async () => {
        const first = renderApp();
        expect(screen.getByRole('link', { name: /Developed by\s*Jondals/ })).toHaveAttribute('href', 'https://github.com/Jondals');
        fireEvent.click(screen.getByRole('button', { name: 'Hide credit' }));
        await waitFor(() => expect(screen.queryByRole('link', { name: /Jondals/ })).not.toBeInTheDocument());
        first.unmount();

        renderApp();
        expect(screen.queryByRole('link', { name: /Jondals/ })).not.toBeInTheDocument();
    });
});

describe('idioma', () => {
    test('la bandera de la cabecera y el selector del drawer cambian el idioma', () => {
        renderApp();
        fireEvent.click(screen.getByRole('button', { name: 'Cambiar a español' }));
        expect(screen.getByRole('button', { name: 'Editor de ruleta' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'EDITOR DE RULETA' })).toBeInTheDocument();
        expect(document.documentElement.lang).toBe('es');

        const english = screen.getByRole('radio', { name: 'English' });
        expect(english).toHaveAttribute('aria-checked', 'false');
        fireEvent.click(english);
        expect(screen.getByRole('button', { name: 'Wheel Editor' })).toBeInTheDocument();
    });
});

describe('comunidad', () => {
    // La lista se recarga tras cada escritura: esperar a que termine evita actualizaciones fuera de act().
    const settle = () => waitFor(() => expect(screen.queryByText('Loading community…')).toBeNull());

    const openCommunity = async (section: 'Themes' | 'Presets') => {
        const view = renderApp();
        fireEvent.click(screen.getByRole('button', { name: section }));
        fireEvent.click(await screen.findByRole('tab', { name: 'Community' }));
        await settle();
        return view;
    };

    test('el contador de temas compara por id lo descargado con lo disponible', async () => {
        localStorage.setItem(THEMES_STORAGE_KEY, JSON.stringify([sharedTheme('t2')]));
        await openCommunity('Themes');
        expect(await screen.findByTitle('1 downloaded / 3 available')).toHaveTextContent('1/3 Downloaded');

        fireEvent.click(await screen.findByRole('button', { name: 'Download theme Shared t1' }));
        expect(await screen.findByTitle('2 downloaded / 3 available')).toBeInTheDocument();
        await settle();
    });

    test('un tema ya descargado no se descarga otra vez: se aplica la copia guardada, con sus cambios', async () => {
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

    test('"Usar" un preset conserva su id; la segunda vez usa la copia guardada sin descargarlo', async () => {
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

    test('editar y borrar en la nube solo aparece en las filas propias', async () => {
        await openCommunity('Themes');
        expect(await screen.findByRole('button', { name: 'Edit Shared t1 in the cloud' })).toBeInTheDocument();
        for (const other of ['t2', 't3']) {
            expect(screen.queryByRole('button', { name: `Edit Shared ${other} in the cloud` })).toBeNull();
            expect(screen.queryByRole('button', { name: `Delete Shared ${other} from the cloud` })).toBeNull();
        }
    });

    test('borrar en la nube pide un segundo clic y actualiza lista y contador', async () => {
        await openCommunity('Themes');
        fireEvent.click(await screen.findByRole('button', { name: 'Delete Shared t1 from the cloud' }));
        expect(mockServer.deletes).toHaveLength(0);
        fireEvent.click(screen.getByRole('button', { name: 'Click again to delete Shared t1 from the cloud' }));

        await waitFor(() => expect(mockServer.deletes).toEqual([{ table: 'shared_themes', id: 't1' }]));
        await waitFor(() => expect(screen.queryByText('Shared t1')).toBeNull());
        expect(await screen.findByTitle('0 downloaded / 2 available')).toBeInTheDocument();
        await settle();
    });

    test('las tarjetas de preajuste muestran sus etiquetas, no sus opciones', async () => {
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

    test('editar en la nube abre el formulario en el sitio de la tarjeta y actualiza la misma fila', async () => {
        const { container } = await openCommunity('Presets');
        fireEvent.click(await screen.findByRole('button', { name: 'Edit Shared p2 in the cloud' }));

        // La tarjeta editada se sustituye por el formulario, dentro de la lista y no al final.
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

describe('cuenta', () => {
    const actualAccountData = jest.requireActual('./scripts/account-data') as typeof import('./scripts/account-data');
    const openProfile = async () => {
        fireEvent.click(screen.getByRole('button', { name: /^(Open profile|Profile of)/ }));
        return screen.findByRole('dialog', { name: 'User profile' });
    };

    test('crear cuenta exige una contraseña segura, sin el nombre de usuario y repetida igual', async () => {
        mockAuth.session = null;
        renderApp();
        const menu = await openProfile();
        const weak = 'The password is not secure enough: it needs at least 10 characters with lowercase, uppercase, a number and a symbol, and it cannot contain your username.';
        const submit = () => fireEvent.submit(within(menu).getByRole('button', { name: 'Create account' }));
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

    test('requisitos de contraseña: longitud, minúscula, mayúscula, número, símbolo y sin el nombre', () => {
        const { passwordChecks, validatePassword } = jest.requireActual('./scripts/profile') as typeof import('./scripts/profile');
        expect(passwordChecks('abc', 'ana')).toEqual({ length: false, lower: true, upper: false, digit: false, symbol: false, noName: true });
        expect(Object.values(passwordChecks('Lluvia#Roja77', 'ana')).every(Boolean)).toBe(true);
        expect(passwordChecks('Ana-Secreta#1', 'ANA').noName).toBe(false);
        expect(validatePassword('Lluvia#Roja77', 'ana')).toBeNull();
        expect(validatePassword('lluvia#roja77', 'ana')).not.toBeNull();
        expect(validatePassword('A#1' + 'b'.repeat(80))).not.toBeNull();
    });

    test('un perfil sin contraseña ofrece crearla y no deja cerrar sesión (se perdería)', async () => {
        mockAuth.session = { userId: 'me', isAnonymous: true };
        mockAccount.profile = { id: 'me', username: 'ana', avatar_url: null };
        renderApp();
        await screen.findByRole('button', { name: 'Profile of ana' });
        const menu = await openProfile();
        expect(within(menu).getByRole('button', { name: 'Create password' })).toBeInTheDocument();
        expect(within(menu).queryByRole('button', { name: 'Sign out' })).toBeNull();
    });

    test('credenciales incorrectas: error genérico y no se recarga nada', async () => {
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

        // Al tercer fallo seguido, pausa antes de poder volver a intentarlo.
        for (let attempt = 2; attempt <= 3; attempt++) {
            fireEvent.change(within(menu).getByLabelText('Password'), { target: { value: 'Otra#prueba1' } });
            fireEvent.submit(within(menu).getByRole('button', { name: 'Sign in' }));
            await waitFor(() => expect(mockAccount.calls).toHaveLength(attempt));
        }
        expect(await within(menu).findByText('Too many attempts. Wait 5 s and try again.')).toBeInTheDocument();
        expect(within(menu).getByRole('button', { name: 'Sign in' })).toBeDisabled();
    });

    test('cerrar sesión deja la app como la primera vez pero conserva el idioma', async () => {
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
        // Como la primera vez: la próxima carga vuelve a mostrar la pantalla de carga.
        expect(sessionStorage.getItem('spinly-splash')).toBeNull();
    });

    test('sin sesión no hay avisos fijos: se puede descargar y compartir avisa al intentarlo', async () => {
        mockAuth.session = null;
        localStorage.setItem(THEMES_STORAGE_KEY, JSON.stringify([{ ...sharedTheme('mio'), name: 'Mío' }]));
        renderApp();
        fireEvent.click(screen.getByRole('button', { name: 'Themes' }));
        expect(await screen.findByRole('button', { name: 'Share Mío with the community' })).toBeInTheDocument();
        expect(screen.queryByText(/Sign in/)).toBeNull();
        fireEvent.click(await screen.findByRole('tab', { name: 'Community' }));
        expect(await screen.findByRole('button', { name: 'Download theme Shared t1' })).toBeInTheDocument();
    });

    test('los temas y preajustes de ejemplo se pueden borrar y no vuelven al recargar', async () => {
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

    test('al arrancar solo se aplican los datos de la nube si de verdad cambian (sin remontar por nada)', async () => {
        const accountData = jest.requireActual('./scripts/account-data') as typeof import('./scripts/account-data');
        accountData.setAppRemount(() => { mockAccount.reloads += 1; });
        try {
            const options = [{ id: 'a', name: 'A', color: 'indigo' }, { id: 'b', name: 'B', color: 'coral' }];
            localStorage.setItem('spinly-options', JSON.stringify(options));
            // Una primera visita sin sesión deja en storage lo que la app guarda al arrancar.
            mockAuth.session = null;
            renderApp().unmount();
            mockAuth.session = { userId: 'me', isAnonymous: false };
            // La última subida acabó con la pestaña cerrada: la nube es "más nueva" pero idéntica.
            localStorage.setItem('spinly-account-sync', JSON.stringify({ uid: 'me', updatedAt: 1 }));
            mockAccount.remote = accountData.sanitizeAccountData({ ...accountData.readLocalData(), music: null, updatedAt: 5 });
            const first = renderApp();
            await waitFor(() => expect(JSON.parse(localStorage.getItem('spinly-account-sync') ?? '{}').updatedAt).toBe(5));
            expect(mockAccount.reloads).toBe(0);
            first.unmount();

            // Otro dispositivo cambió las opciones: esas sí se aplican.
            mockAccount.remote = accountData.sanitizeAccountData({ ...accountData.readLocalData(), options: [...options, { id: 'c', name: 'C', color: 'teal' }], updatedAt: 9 });
            renderApp();
            await waitFor(() => expect(mockAccount.reloads).toBe(1));
            expect(JSON.parse(localStorage.getItem('spinly-options') ?? '[]')).toHaveLength(3);
        } finally {
            accountData.setAppRemount(null);
        }
    });

    test('los datos de la cuenta se sanean y al entrar se suman los del invitado sin duplicar', () => {
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

describe('música', () => {
    const song = (name: string, type = 'audio/mpeg') => new File(['audio'], name, { type });

    // El panel se carga bajo demanda: se espera a que esté pintado, no solo el diálogo.
    const openPlaylist = async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Open playlist' }));
        const panel = await screen.findByRole('dialog', { name: 'Playlist' });
        await within(panel).findByRole('button', { name: 'Upload songs' });
        return panel;
    };

    const upload = async (panel: HTMLElement, ...files: File[]) => {
        fireEvent.change(within(panel).getByLabelText('Upload songs'), { target: { files } });
        await within(panel).findByRole('button', { name: `Play ${files[files.length - 1].name.replace(/\.[^.]+$/, '')}` });
    };

    let canPlay: jest.SpyInstance;
    beforeEach(() => {
        canPlay = jest.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('maybe');
    });
    afterEach(() => canPlay.mockRestore());

    test('sin canciones de serie: la playlist empieza vacía y el botón de música lleva a subirlas', async () => {
        renderApp();
        fireEvent.click(screen.getByRole('button', { name: 'Open playlist' }));
        const panel = await screen.findByRole('dialog', { name: 'Playlist' });
        expect(await within(panel).findByText(/Your playlist is empty/)).toBeInTheDocument();
        expect(within(panel).getByRole('button', { name: 'Play' })).toBeDisabled();
        expect(mockMusic.played).toEqual([]);
    });

    test('subir canciones: se validan, entran en la playlist, se guardan en la cuenta y se pueden quitar', async () => {
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

    test('reproducir: encender, pausar y reanudar, pasar de canción y reordenar', async () => {
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
        // Volver a encenderla reanuda la misma canción en vez de empezar otra.
        fireEvent.click(screen.getByRole('button', { name: 'Play music' }));
        await waitFor(() => expect(mockMusic.played).toEqual(['file', 'pause', 'resume']));

        fireEvent.click(within(panel).getByRole('button', { name: 'Next track' }));
        await waitFor(() => expect(within(panel).getByRole('button', { name: 'Play Dos' })).toHaveAttribute('aria-current', 'true'));

        fireEvent.keyDown(within(panel).getByRole('button', { name: /^Move Tres/ }), { key: 'ArrowUp' });
        expect(within(panel).getAllByRole('button', { name: /^Play [A-Z]/ }).map((button) => button.getAttribute('aria-label'))).toEqual(['Play Uno', 'Play Tres', 'Play Dos']);
        expect(JSON.parse(localStorage.getItem('spinly-music') ?? '{}').playlist.map((track: { name: string }) => track.name)).toEqual(['Uno', 'Tres', 'Dos']);
    });

    test('sin sesión la canción se queda en el dispositivo y se sube al entrar en la cuenta', async () => {
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

    test('el pulso sube en cada golpe de graves y cae entre golpes; sin música se apaga', () => {
        let energy = 0.2;
        setPulseSource(() => ({ bass: energy, mid: 0.1, high: 0.05, pitch: 0.5 }));
        // Reloj propio por delante del real: otros tests ya leyeron el pulso con performance.now().
        let time = performance.now() + 1e6;
        const frame = () => {
            time += 16;
            return readPulse(time);
        };
        // Un segundo de base constante: el latido se asienta.
        for (let i = 0; i < 60; i++) frame();
        const calm = frame();
        energy = 0.8;
        const hit = frame();
        energy = 0.2;
        for (let i = 0; i < 20; i++) frame();
        const after = frame();
        expect(hit).toBeGreaterThan(calm + 0.4);
        expect(after).toBeLessThan(hit / 2);
        setPulseSource(null);
        for (let i = 0; i < 60; i++) frame();
        expect(frame()).toBeLessThan(0.01);
    });

    test('la música marca los golpes, el tempo y un patrón según cómo suena', () => {
        let time = performance.now() + 2e6;
        // Canción sintética a 120 BPM (un golpe cada 500 ms) durante 6 s, con el reparto de bandas dado.
        const play = (mid: number, high: number) => {
            let clock = 0;
            setPulseSource(() => ({ bass: clock % 500 < 60 ? 0.8 : 0.15, mid, high, pitch: 0.5 }));
            for (let i = 0; i < 375; i++) {
                clock += 16;
                time += 16;
                readMusic(time);
            }
            return readMusic(time);
        };
        const bassy = play(0.06, 0.02);
        expect(bassy.beats).toBeGreaterThanOrEqual(10);
        expect(bassy.beatMs).toBeGreaterThan(450);
        expect(bassy.beatMs).toBeLessThan(550);
        expect(bassy.pattern).toBe('rings');
        expect(play(0.7, 0.67).pattern).toBe('sparkle');
        expect(play(0.52, 0.04).pattern).toBe('spin');
        setPulseSource(null);
    });

    test('el patrón rota cada cuatro compases con fundido y la melodía marca sus notas y su altura', () => {
        let time = performance.now() + 3e6;
        let clock = 0;
        // 120 BPM con una melodía que entra en cada corchea (250 ms) y sube de grave a agudo en 6 s.
        setPulseSource(() => ({
            bass: clock % 500 < 60 ? 0.8 : 0.15,
            mid: clock % 250 < 90 ? 0.75 : 0.3,
            high: 0.1,
            pitch: Math.min(1, clock / 6000),
        }));
        const run = (ms: number) => {
            for (let t = 0; t < ms; t += 16) {
                clock += 16;
                time += 16;
                readMusic(time);
            }
            return readMusic(time);
        };
        const start = run(2000);
        const firstPattern = start.pattern;
        expect(start.notes).toBeGreaterThanOrEqual(5);
        const later = run(8600);
        // Tras 16 golpes (y al menos 7 s) cambia a otro efecto, y el cambio empieza fundido.
        expect(later.pattern).not.toBe(firstPattern);
        expect(later.previousPattern).toBe(firstPattern);
        expect(later.pitch).toBeGreaterThan(0.8);
        expect(later.notes).toBeGreaterThan(start.notes + 20);
        setPulseSource(null);
    });

    test('la playlist que llega de la cuenta o del storage se sanea y al entrar se suman las del invitado', () => {
        const track = (id: string, name = 'Canción') => ({ id, name, mime: 'audio/mpeg', size: 1000 });
        const clean = sanitizeMusicLibrary({
            playlist: [
                // Las pistas de serie de versiones anteriores ya no existen.
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
