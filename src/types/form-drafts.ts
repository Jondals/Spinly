// Viven en App y no en el panel: sobreviven a una visita al editor para cambiar colores u opciones.
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

// La edición en la nube se abre en la vista Comunidad; el resto en la vista propia.
export const isCloudTarget = (target: EditTarget): boolean => target.mode === 'cloud';
