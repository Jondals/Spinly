/**
 * useSortable: drag-to-reorder for vertical lists, with pointer events and keyboard arrows.
 */
import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';

const EDGE_PX = 48;
const SCROLL_STEP_PX = 12;

/** Nearest scrollable ancestor, to auto-scroll it while dragging near its edges. */
function scrollParent(element: HTMLElement | null): HTMLElement | null {
    for (let node = element?.parentElement ?? null; node; node = node.parentElement) {
        const { overflowY } = getComputedStyle(node);
        if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
    }
    return null;
}

/**
 * Reordering of a vertical list with pointer events (mouse and touch alike; HTML5 drag and drop does not
 * exist on mobile) and with the arrow keys from the handle. The handle has `touch-action: none` so a
 * finger drags the row instead of scrolling the page.
 */
export function useSortable(onMove: (from: number, to: number) => void, rowClass = 'option-item') {
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [overIndex, setOverIndex] = useState<number | null>(null);
    const [offsetY, setOffsetY] = useState(0);
    const items = useRef<Array<HTMLElement | null>>([]);
    const startY = useRef(0);
    const startScroll = useRef(0);
    const scroller = useRef<HTMLElement | null>(null);

    /** Ends the drag. */
    const reset = () => {
        setDragIndex(null);
        setOverIndex(null);
        setOffsetY(0);
    };

    // Final position = how many of the other rows are above the pointer.
    // The dragged row is excluded: it moves with the finger and would skew the count.
    const targetIndex = (from: number, clientY: number): number =>
        items.current.filter((row, index): row is HTMLElement => {
            if (!row || index === from) return false;
            const rect = row.getBoundingClientRect();
            return clientY > rect.top + rect.height / 2;
        }).length;

    /** Scrolls the list when the pointer gets close to its top or bottom edge. */
    const autoScroll = (clientY: number) => {
        const area = scroller.current;
        if (!area) return;
        const rect = area.getBoundingClientRect();
        if (clientY < rect.top + EDGE_PX) area.scrollTop -= SCROLL_STEP_PX;
        else if (clientY > rect.bottom - EDGE_PX) area.scrollTop += SCROLL_STEP_PX;
    };

    /** Props for a row's drag handle: pointer dragging and arrow keys. */
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

    /** Ref callback that registers each row's element. */
    const itemRef = (index: number) => (element: HTMLElement | null) => {
        items.current[index] = element;
    };

    /** Row classes and style: the dragged row follows the pointer; the target row marks where it will land. */
    const itemState = (index: number): { className: string; style?: CSSProperties } => {
        if (dragIndex === null) return { className: '' };
        if (index === dragIndex) return { className: ` ${rowClass}--dragging`, style: { transform: `translateY(${offsetY}px)` } };
        if (index !== overIndex) return { className: '' };
        return { className: overIndex < dragIndex ? ` ${rowClass}--drop-before` : ` ${rowClass}--drop-after` };
    };

    return { handleProps, itemRef, itemState, isDragging: dragIndex !== null };
}
