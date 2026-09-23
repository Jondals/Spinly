import { useEffect } from 'react';
import { playUi, type UiSound } from '../scripts/sound';

const CLICKABLE = 'button, [role="button"]';
const REMOVE = '.spinly-card-action--danger, .remove-option-button, .option-img-remove, .spinly-imgadj-remove';
const NAV = '.button-menu, [role="tab"], [role="radio"]';

/** data-sound fija el sonido de un botón; "none" lo silencia (p. ej. Girar, que ya tiene los tics). */
function soundFor(element: HTMLElement): UiSound | null {
    const explicit = element.dataset.sound;
    if (explicit) return explicit === 'none' ? null : (explicit as UiSound);
    if (element.matches(REMOVE)) return 'remove';
    if (element.matches(NAV)) return 'nav';
    if (element.matches('.spinly-btn-primary')) return 'confirm';
    return 'tap';
}

/**
 * Un único listener en document para todos los botones de la app, también los de diálogos
 * en portal. Va en fase de burbuja, después de los handlers de React: al activar el sonido
 * con su botón, ese mismo clic ya suena. El botón se busca en composedPath() y no con
 * target.closest(): React ya ha re-renderizado y el nodo pulsado (p. ej. la bandera del
 * idioma) puede haber salido del DOM.
 */
export function useButtonSounds() {
    useEffect(() => {
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
