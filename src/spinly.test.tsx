import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import { LanguageProvider } from './Components/i18n/LanguageProvider';
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

jest.mock('./hooks/useSessionUserId', () => ({ useSessionUserId: () => 'me' }));

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

const renderApp = () => render(<LanguageProvider><App /></LanguageProvider>);

const storedActiveTheme = (): WheelTheme => JSON.parse(localStorage.getItem(ACTIVE_THEME_STORAGE_KEY) ?? 'null');

beforeEach(() => {
    localStorage.clear();
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

    test('el sonido se puede silenciar y la preferencia se recuerda', () => {
        renderApp();
        const toggle = screen.getByRole('button', { name: 'Wheel sounds' });
        expect(toggle).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute('aria-pressed', 'false');
        expect(localStorage.getItem('spinly-sound')).toBe('off');
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

            fireEvent.click(screen.getByRole('button', { name: 'Wheel sounds' }));
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

    test('"Usar" un preset conserva su id y no lo duplica', async () => {
        await openCommunity('Presets');
        const use = await screen.findByRole('button', { name: 'Use preset Shared p1' });
        fireEvent.click(use);
        fireEvent.click(use);
        expect(await screen.findByTitle('1 downloaded / 2 available')).toBeInTheDocument();
        const stored = JSON.parse(localStorage.getItem(PRESETS_STORAGE_KEY) ?? '[]') as WheelPreset[];
        expect(stored.filter((preset) => preset.id === 'p1')).toHaveLength(1);
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

    test('editar en la nube reutiliza el formulario y actualiza la misma fila', async () => {
        const { container } = await openCommunity('Presets');
        fireEvent.click(await screen.findByRole('button', { name: 'Edit Shared p2 in the cloud' }));

        const panel = container.querySelector('#presets-form') as HTMLElement;
        expect(panel).toHaveClass('spinly-collapse--open');
        const name = within(panel).getByPlaceholderText('Preset name') as HTMLInputElement;
        expect(name.value).toBe('Shared p2');

        fireEvent.change(name, { target: { value: 'Renombrado' } });
        fireEvent.click(within(panel).getByRole('button', { name: 'Update in the cloud' }));
        await waitFor(() => expect(mockServer.updates).toEqual([{ table: 'shared_presets', id: 'p2', name: 'Renombrado' }]));
        expect(JSON.parse(localStorage.getItem(PRESETS_STORAGE_KEY) ?? '[]')).toHaveLength(0);
        await settle();
    });
});
