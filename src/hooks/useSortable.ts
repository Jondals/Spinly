import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';

const EDGE_PX = 48;
const SCROLL_STEP_PX = 12;

function scrollParent(element: HTMLElement | null): HTMLElement | null {
    for (let node = element?.parentElement ?? null; node; node = node.parentElement) {
        const { overflowY } = getComputedStyle(node);
        if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
    }
    return null;
}

/**
 * Reordenación de una lista vertical con eventos de puntero (ratón y táctil por igual;
 * el HTML5 drag and drop no existe en móvil) y con flechas desde el asa. El asa lleva
 * `touch-action: none` para que el dedo arrastre la fila en vez de desplazar la página.
 */
export function useSortable(onMove: (from: number, to: number) => void, rowClass = 'option-item') {
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [overIndex, setOverIndex] = useState<number | null>(null);
    const [offsetY, setOffsetY] = useState(0);
    const items = useRef<Array<HTMLElement | null>>([]);
    const startY = useRef(0);
    const startScroll = useRef(0);
    const scroller = useRef<HTMLElement | null>(null);

    const reset = () => {
        setDragIndex(null);
        setOverIndex(null);
        setOffsetY(0);
    };

    // Posición final = cuántas de las otras filas quedan por encima del puntero.
    // La fila arrastrada se excluye: se desplaza con el dedo y falsearía la cuenta.
    const targetIndex = (from: number, clientY: number): number =>
        items.current.filter((row, index): row is HTMLElement => {
            if (!row || index === from) return false;
            const rect = row.getBoundingClientRect();
            return clientY > rect.top + rect.height / 2;
        }).length;

    const autoScroll = (clientY: number) => {
        const area = scroller.current;
        if (!area) return;
        const rect = area.getBoundingClientRect();
        if (clientY < rect.top + EDGE_PX) area.scrollTop -= SCROLL_STEP_PX;
        else if (clientY > rect.bottom - EDGE_PX) area.scrollTop += SCROLL_STEP_PX;
    };

    const handleProps = (index: number, total: number) => ({
        onPointerDown: (event: PointerEvent<HTMLElement>) => {
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            scroller.current = scrollParent(items.current[index]);
            startY.current = event.clientY;
            startScroll.current = scroller.current?.scrollTop ?? 0;
            setDragIndex(index);
            setOverIndex(index);
        },
        onPointerMove: (event: PointerEvent<HTMLElement>) => {
            if (dragIndex === null) return;
            autoScroll(event.clientY);
            const scrolled = (scroller.current?.scrollTop ?? 0) - startScroll.current;
            setOffsetY(event.clientY - startY.current + scrolled);
            setOverIndex(targetIndex(dragIndex, event.clientY));
        },
        onPointerUp: () => {
            if (dragIndex !== null && overIndex !== null && overIndex !== dragIndex) onMove(dragIndex, overIndex);
            reset();
        },
        onPointerCancel: reset,
        onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
            const to = event.key === 'ArrowUp' ? index - 1 : event.key === 'ArrowDown' ? index + 1 : null;
            if (to === null) return;
            event.preventDefault();
            if (to >= 0 && to < total) onMove(index, to);
        },
    });

    const itemRef = (index: number) => (element: HTMLElement | null) => {
        items.current[index] = element;
    };

    /** Clases y estilo de la fila: la arrastrada sigue al puntero; la de destino marca dónde caerá. */
    const itemState = (index: number): { className: string; style?: CSSProperties } => {
        if (dragIndex === null) return { className: '' };
        if (index === dragIndex) return { className: ` ${rowClass}--dragging`, style: { transform: `translateY(${offsetY}px)` } };
        if (index !== overIndex) return { className: '' };
        return { className: overIndex < dragIndex ? ` ${rowClass}--drop-before` : ` ${rowClass}--drop-after` };
    };

    return { handleProps, itemRef, itemState, isDragging: dragIndex !== null };
}
