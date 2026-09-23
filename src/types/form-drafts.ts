// Borradores del formulario ÚNICO de Themes/Presets (crear / editar local / editar en la nube).
// Viven en App (no en el panel): así sobreviven al ir al Wheel Editor a cambiar
// colores/opciones y volver para guardar.
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

// El formulario de edición en la nube se muestra en la vista Comunidad; el resto en "Mis ..."
export const isCloudTarget = (target: EditTarget): boolean => target.mode === 'cloud';
