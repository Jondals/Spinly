/**
 * selectOnFocus: props for a text input whose current value is selected when it gets focus, so typing
 * replaces it right away instead of appending to it (used for wheel options and tournament participants).
 */
import type { FocusEvent, MouseEvent } from 'react';

// Marks an input that has just been focused, until the mouseup of the same click.
const JUST_FOCUSED = 'selectAll';

/**
 * onFocus selects the whole value. A click focuses on mousedown and then places the caret on mouseup,
 * which would undo the selection: that first mouseup is cancelled. Later clicks place the caret normally.
 */
export const selectOnFocus = {
    onFocus: (event: FocusEvent<HTMLInputElement>) => {
        event.currentTarget.select();
        event.currentTarget.dataset[JUST_FOCUSED] = '1';
    },
    onMouseUp: (event: MouseEvent<HTMLInputElement>) => {
        const input = event.currentTarget;
        if (!input.dataset[JUST_FOCUSED]) return;
        delete input.dataset[JUST_FOCUSED];
        event.preventDefault();
    },
    onBlur: (event: FocusEvent<HTMLInputElement>) => {
        delete event.currentTarget.dataset[JUST_FOCUSED];
    },
};
