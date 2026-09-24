import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import '../../css/Cursor.css';

// Clicables: el anillo se agranda sobre ellos. Misma lista que la que oculta el cursor del sistema (Cursor.css).
const INTERACTIVE = 'a[href], button:not(:disabled), [role="button"]:not([aria-disabled="true"]), [role="tab"], label, summary, select, input[type="checkbox"], input[type="radio"], input[type="range"], input[type="color"]';
// Solo con ratón: en pantallas táctiles no hay cursor que sustituir.
const FINE_POINTER = '(hover: hover) and (pointer: fine)';
const ACTIVE_CLASS = 'spinly-cursor';
// Tiempo (ms) en que el anillo alcanza al puntero: estela corta, sin sensación de retraso.
const FOLLOW_MS = 70;
// Estiramiento máximo del anillo en la dirección del movimiento y el retraso (px) con el que se alcanza.
const MAX_STRETCH = 0.22;
const STRETCH_AT_PX = 120;
// Con el puntero quieto también cambia lo que hay debajo (un botón que se habilita, un diálogo que se abre).
const RECHECK_MS = 300;
const RIPPLE_MS = 480;

/**
 * Cursor propio: un punto que sigue al ratón al instante y un anillo que lo persigue con una
 * estela corta, se estira con la velocidad, crece sobre lo clicable y lanza una onda al pulsar.
 * Donde la página usa un cursor con significado (texto, arrastrar, cuentagotas, no permitido)
 * se retira y deja el del sistema.
 */
function CustomCursor() {
    const layerRef = useRef<HTMLDivElement>(null);
    const dotRef = useRef<HTMLDivElement>(null);
    const ringRef = useRef<HTMLDivElement>(null);
    const rippleRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const layer = layerRef.current;
        const dot = dotRef.current;
        const ring = ringRef.current;
        const ripple = rippleRef.current;
        const fineQuery = window.matchMedia?.(FINE_POINTER);
        if (!layer || !dot || !ring || !ripple || !fineQuery) return undefined;

        const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        const root = document.documentElement;
        const pos = { x: 0, y: 0 };
        const trail = { x: 0, y: 0 };
        let active = false;
        let frame = 0;
        let lastTime = 0;

        const setFlag = (name: 'native' | 'hover' | 'down' | 'away', on: boolean) =>
            layer.classList.toggle(`spinly-cursor-layer--${name}`, on);

        // Solo se ve donde el del sistema está oculto (cursor: none en Cursor.css).
        const inspect = (el: Element | null) => {
            const custom = el !== null && getComputedStyle(el).cursor === 'none';
            setFlag('native', !custom);
            setFlag('hover', el !== null && custom && el.closest(INTERACTIVE) !== null);
        };

        const render = (time: number) => {
            frame = 0;
            const dt = lastTime ? Math.min(time - lastTime, 64) : 16;
            lastTime = time;
            const follow = reducedQuery.matches ? 1 : 1 - Math.exp(-dt / FOLLOW_MS);
            trail.x += (pos.x - trail.x) * follow;
            trail.y += (pos.y - trail.y) * follow;
            const dx = pos.x - trail.x;
            const dy = pos.y - trail.y;
            const lag = Math.hypot(dx, dy);
            const stretch = Math.min(lag / STRETCH_AT_PX, 1) * MAX_STRETCH;
            dot.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
            ring.style.transform = `translate3d(${trail.x}px, ${trail.y}px, 0) rotate(${Math.atan2(dy, dx)}rad) scale(${1 + stretch}, ${1 - stretch})`;
            if (lag > 0.1) frame = requestAnimationFrame(render);
            else lastTime = 0;
        };

        const schedule = () => {
            if (!frame) frame = requestAnimationFrame(render);
        };

        const deactivate = () => {
            active = false;
            root.classList.remove(ACTIVE_CLASS);
            setFlag('away', true);
        };

        const onMove = (event: PointerEvent) => {
            if (event.pointerType === 'touch' || !fineQuery.matches) {
                setFlag('away', true);
                return;
            }
            pos.x = event.clientX;
            pos.y = event.clientY;
            // Se activa con el primer movimiento: antes no se sabe dónde está el ratón.
            if (!active) {
                active = true;
                trail.x = pos.x;
                trail.y = pos.y;
                root.classList.add(ACTIVE_CLASS);
            }
            setFlag('away', false);
            inspect(event.target instanceof Element ? event.target : null);
            schedule();
        };

        const onDown = (event: PointerEvent) => {
            if (!active || event.pointerType === 'touch') return;
            setFlag('down', true);
            if (reducedQuery.matches || layer.classList.contains('spinly-cursor-layer--native') || typeof ripple.animate !== 'function') return;
            const at = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`;
            ripple.animate(
                [
                    { transform: `${at} scale(0.5)`, opacity: 0.6 },
                    { transform: `${at} scale(1.9)`, opacity: 0 },
                ],
                { duration: RIPPLE_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
            );
        };

        const onUp = () => {
            setFlag('down', false);
            if (active) inspect(document.elementFromPoint(pos.x, pos.y));
        };

        const onWindowOut = (event: MouseEvent) => {
            if (!event.relatedTarget) setFlag('away', true);
        };

        const recheck = window.setInterval(() => {
            if (active && !document.hidden) inspect(document.elementFromPoint(pos.x, pos.y));
        }, RECHECK_MS);

        const onFineChange = () => {
            if (!fineQuery.matches) deactivate();
        };

        window.addEventListener('pointermove', onMove, { passive: true });
        window.addEventListener('pointerdown', onDown, { passive: true });
        window.addEventListener('pointerup', onUp, { passive: true });
        window.addEventListener('blur', deactivate);
        document.addEventListener('mouseout', onWindowOut);
        fineQuery.addEventListener?.('change', onFineChange);

        return () => {
            cancelAnimationFrame(frame);
            window.clearInterval(recheck);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerdown', onDown);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('blur', deactivate);
            document.removeEventListener('mouseout', onWindowOut);
            fineQuery.removeEventListener?.('change', onFineChange);
            root.classList.remove(ACTIVE_CLASS);
        };
    }, []);

    // En body y no dentro de la app: ningún contexto de apilamiento puede dejarlo por debajo de un diálogo.
    return createPortal(
        <div ref={layerRef} className="spinly-cursor-layer spinly-cursor-layer--away" aria-hidden="true">
            <div ref={rippleRef} className="spinly-cursor-ripple" />
            <div ref={ringRef} className="spinly-cursor-ring"><span /></div>
            <div ref={dotRef} className="spinly-cursor-dot"><span /></div>
        </div>,
        document.body,
    );
}

export default CustomCursor;
