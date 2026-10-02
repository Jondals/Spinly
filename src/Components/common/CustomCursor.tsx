/**
 * CustomCursor: replaces the mouse cursor with a dot and a trailing ring (mouse only, never on touch).
 */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import '../../css/Cursor.css';

// Clickable elements: the ring grows over them. Same list as the one that hides the system cursor (Cursor.css).
const INTERACTIVE = 'a[href], button:not(:disabled), [role="button"]:not([aria-disabled="true"]), [role="tab"], label, summary, select, input[type="checkbox"], input[type="radio"], input[type="range"], input[type="color"]';
// Mouse only: touch screens have no cursor to replace.
const FINE_POINTER = '(hover: hover) and (pointer: fine)';
const ACTIVE_CLASS = 'spinly-cursor';
// Time (ms) for the ring to catch up with the pointer: a short trail without feeling laggy.
const FOLLOW_MS = 70;
// Maximum stretch of the ring in the direction of movement, and the lag (px) at which it is reached.
const MAX_STRETCH = 0.22;
const STRETCH_AT_PX = 120;
// What is under a still pointer can change too (a button gets enabled, a dialog opens), so it is rechecked.
const RECHECK_MS = 300;
const RIPPLE_MS = 480;

/** Rounds to physical pixels (with display scaling, 1 CSS px is not 1 real pixel). */
const snap = (value: number): number => {
    const ratio = window.devicePixelRatio || 1;
    return Math.round(value * ratio) / ratio;
};

/**
 * Custom cursor: a dot that follows the mouse instantly and a ring that chases it with a short trail,
 * stretches with speed, grows over clickable things and sends a ripple on press. Where the page uses a
 * meaningful cursor (text, drag, eyedropper, not-allowed) it steps aside and leaves the system one.
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

        /** Toggles a state class on the cursor layer. */
        const setFlag = (name: 'native' | 'hover' | 'down' | 'away', on: boolean) =>
            layer.classList.toggle(`spinly-cursor-layer--${name}`, on);

        /** Checks the element under the pointer: the custom cursor only shows where the system one is hidden (cursor: none in Cursor.css). */
        const inspect = (el: Element | null) => {
            const custom = el !== null && getComputedStyle(el).cursor === 'none';
            setFlag('native', !custom);
            setFlag('hover', el !== null && custom && el.closest(INTERACTIVE) !== null);
        };

        /** Animation frame: moves the dot, eases the ring towards it and stretches it with the lag. */
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
            // 2D transforms on real screen pixels: crisp, with no separate layer and no half pixels.
            dot.style.transform = `translate(${snap(pos.x)}px, ${snap(pos.y)}px)`;
            const ringAt = `translate(${snap(trail.x)}px, ${snap(trail.y)}px)`;
            // At rest it does not stretch: without rotation or scaling the ring is drawn cleanly.
            ring.style.transform = stretch > 0.005 ? `${ringAt} rotate(${Math.atan2(dy, dx)}rad) scale(${1 + stretch}, ${1 - stretch})` : ringAt;
            if (lag > 0.1) frame = requestAnimationFrame(render);
            else lastTime = 0;
        };

        /** Requests an animation frame if none is pending. */
        const schedule = () => {
            if (!frame) frame = requestAnimationFrame(render);
        };

        /** Hides the custom cursor and gives the system one back. */
        const deactivate = () => {
            active = false;
            root.classList.remove(ACTIVE_CLASS);
            setFlag('away', true);
        };

        /** Tracks the mouse (and hides the custom cursor for touch input). */
        const onMove = (event: PointerEvent) => {
            if (event.pointerType === 'touch' || !fineQuery.matches) {
                setFlag('away', true);
                return;
            }
            pos.x = event.clientX;
            pos.y = event.clientY;
            // It turns on with the first movement: before that, the mouse position is unknown.
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

        /** Press: shrinks the ring and sends a ripple. */
        const onDown = (event: PointerEvent) => {
            if (!active || event.pointerType === 'touch') return;
            setFlag('down', true);
            if (reducedQuery.matches || layer.classList.contains('spinly-cursor-layer--native') || typeof ripple.animate !== 'function') return;
            const at = `translate(${snap(event.clientX)}px, ${snap(event.clientY)}px)`;
            ripple.animate(
                [
                    { transform: `${at} scale(0.5)`, opacity: 0.6 },
                    { transform: `${at} scale(1.9)`, opacity: 0 },
                ],
                { duration: RIPPLE_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
            );
        };

        /** Release: restores the ring and checks what is under the pointer now. */
        const onUp = () => {
            setFlag('down', false);
            if (active) inspect(document.elementFromPoint(pos.x, pos.y));
        };

        /** Hides the cursor when the mouse leaves the window. */
        const onWindowOut = (event: MouseEvent) => {
            if (!event.relatedTarget) setFlag('away', true);
        };

        const recheck = window.setInterval(() => {
            if (active && !document.hidden) inspect(document.elementFromPoint(pos.x, pos.y));
        }, RECHECK_MS);

        /** Turns off when the device stops having a fine pointer (e.g. a tablet switching modes). */
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

    // In body rather than inside the app: no stacking context can put it below a dialog.
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
