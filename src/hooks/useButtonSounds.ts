/**
 * useButtonSounds: plays a short synthesized sound on every button click of the app.
 */
import { useEffect } from 'react';
import { playUi, type UiSound } from '../scripts/sound';

const CLICKABLE = 'button, [role="button"]';
const REMOVE = '.spinly-card-action--danger, .remove-option-button, .option-img-remove, .spinly-imgadj-remove';
const NAV = '.button-menu, [role="tab"], [role="radio"]';

/** Picks the sound of a button. data-sound sets it explicitly; "none" mutes it (e.g. Spin, which already has its ticks). */
function soundFor(element: HTMLElement): UiSound | null {
    const explicit = element.dataset.sound;
    if (explicit) return explicit === 'none' ? null : (explicit as UiSound);
    if (element.matches(REMOVE)) return 'remove';
    if (element.matches(NAV)) return 'nav';
    if (element.matches('.spinly-btn-primary')) return 'confirm';
    return 'tap';
}

/**
 * A single listener on document for every button of the app, including those in portal dialogs. It
 * runs in the bubble phase, after React's handlers, so turning sound on with its button already plays
 * that same click. The button is looked up in composedPath() rather than with target.closest(): React
 * has already re-rendered and the clicked node (e.g. the language flag) may have left the DOM.
 */
export function useButtonSounds() {
    useEffect(() => {
        /** Plays the sound of the clicked button, if any. */
        const onClick = (event: MouseEvent) => {
            const target = event.composedPath().find(
                (node): node is HTMLElement => node instanceof HTMLElement && node.matches(CLICKABLE),
            );
            if (!target || target.matches(':disabled, [aria-disabled="true"]')) return;
            const kind = soundFor(target);
            if (kind) playUi(kind);
        };
        document.addEventListener('click', onClick);
        return () => document.removeEventListener('click', onClick);
    }, []);
}
