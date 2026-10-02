/**
 * useDraftForm: the state of the single create / edit form shared by the Presets and Themes panels.
 */
import { useRef, type Dispatch, type SetStateAction } from 'react';
import { isCloudTarget, type EditTarget } from '../types/form-drafts';

type Draft = { target: EditTarget };
export type PanelView = 'mine' | 'community';

/**
 * Derived state of the single form of Presets and Themes (create, edit locally, edit in the cloud).
 * The draft lives in App so it survives a trip to the editor.
 */
export function useDraftForm<D extends Draft>(draft: D | null, setDraft: Dispatch<SetStateAction<D | null>>, emptyDraft: D, view: PanelView) {
    // Keeps the last draft while the accordion folds, so its content does not jump.
    const lastDraft = useRef<D>(emptyDraft);
    if (draft) lastDraft.current = draft;

    const editingId = draft && draft.target.mode !== 'create' ? draft.target.id : null;
    /** Whether the form is editing this item. */
    const isEditing = (mode: 'local' | 'cloud', id: string) => draft?.target.mode === mode && editingId === id;

    return {
        shownDraft: draft ?? lastDraft.current,
        open: draft !== null && isCloudTarget(draft.target) === (view === 'community'),
        showCreateButton: !(draft && !isCloudTarget(draft.target)),
        isEditing,
        startCreate: () => setDraft({ ...emptyDraft }),
        close: () => setDraft(null),
        /** Opens the form to edit an item; a second click on the same item closes it. */
        toggleEdit: (mode: 'local' | 'cloud', id: string, build: () => D, onOpen: () => void) => {
            if (isEditing(mode, id)) {
                setDraft(null);
                return;
            }
            onOpen();
            setDraft(build());
        },
        /** Closes the form if it is editing this item (for example, after deleting it). */
        closeIfEditing: (mode: 'local' | 'cloud', id: string) => {
            if (isEditing(mode, id)) setDraft(null);
        },
    };
}

/** Initial view: if something from the cloud was being edited, go straight back to Community. */
export const initialView = (draft: Draft | null): PanelView => (draft && isCloudTarget(draft.target) ? 'community' : 'mine');
