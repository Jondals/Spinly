import { useRef, type Dispatch, type SetStateAction } from 'react';
import { isCloudTarget, type EditTarget } from '../types/form-drafts';

type Draft = { target: EditTarget };
export type PanelView = 'mine' | 'community';

/**
 * Estado derivado del formulario único de Presets y Themes (crear, editar en local,
 * editar en la nube). El borrador vive en App para sobrevivir a una visita al editor.
 */
export function useDraftForm<D extends Draft>(draft: D | null, setDraft: Dispatch<SetStateAction<D | null>>, emptyDraft: D, view: PanelView) {
    // Conserva el último borrador mientras el acordeón se pliega, para que no salte el contenido.
    const lastDraft = useRef<D>(emptyDraft);
    if (draft) lastDraft.current = draft;

    const editingId = draft && draft.target.mode !== 'create' ? draft.target.id : null;
    const isEditing = (mode: 'local' | 'cloud', id: string) => draft?.target.mode === mode && editingId === id;

    return {
        shownDraft: draft ?? lastDraft.current,
        open: draft !== null && isCloudTarget(draft.target) === (view === 'community'),
        showCreateButton: !(draft && !isCloudTarget(draft.target)),
        isEditing,
        startCreate: () => setDraft({ ...emptyDraft }),
        close: () => setDraft(null),
        /** Un segundo clic sobre el mismo elemento cierra el formulario. */
        toggleEdit: (mode: 'local' | 'cloud', id: string, build: () => D, onOpen: () => void) => {
            if (isEditing(mode, id)) {
                setDraft(null);
                return;
            }
            onOpen();
            setDraft(build());
        },
        closeIfEditing: (mode: 'local' | 'cloud', id: string) => {
            if (isEditing(mode, id)) setDraft(null);
        },
    };
}

/** Vista inicial: si se estaba editando algo de la nube, se vuelve directamente a Comunidad. */
export const initialView = (draft: Draft | null): PanelView => (draft && isCloudTarget(draft.target) ? 'community' : 'mine');
