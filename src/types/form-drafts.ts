/**
 * Drafts of the theme and preset forms.
 *
 * They live in App rather than in the panels, so they survive a trip to the editor to change colors
 * or options.
 */

/** What a form is editing: a new item, a local one or one shared in the community. */
export type EditTarget =
    | { mode: 'create' }
    | { mode: 'local'; id: string }
    | { mode: 'cloud'; id: string };

export type ThemeDraft = {
    target: EditTarget;
    name: string;
    description: string;
    styleTag: string;
    category: string;
};

export type PresetDraft = {
    target: EditTarget;
    name: string;
    tags: string;
};

/** Cloud edits open in the Community view; everything else in the user's own view. */
export const isCloudTarget = (target: EditTarget): boolean => target.mode === 'cloud';
