export type SpinlyLang = 'en' | 'es';

// Solo texto fijo de la UI; los datos del usuario nunca se traducen.
type Entry = { en: string; es: string };

export const STRINGS = {
    header: {
        logoAlt: { en: 'Spinly logo', es: 'Logo de Spinly' },
        openMenu: { en: 'Open Wheel Manager', es: 'Abrir gestor de ruleta' },
        closeMenu: { en: 'Close Wheel Manager', es: 'Cerrar gestor de ruleta' },
        toggleTheme: { en: 'Toggle light/dark mode', es: 'Cambiar modo claro/oscuro' },
        switchLang: { en: 'Cambiar a español', es: 'Switch to English' },
        language: { en: 'Language', es: 'Idioma' },
        openProfile: { en: 'Open profile', es: 'Abrir perfil' },
        closeProfile: { en: 'Close profile', es: 'Cerrar perfil' },
        profileOf: { en: 'Profile of {name}', es: 'Perfil de {name}' },
        profileDialog: { en: 'User profile', es: 'Perfil de usuario' },
        createProfile: { en: 'Create your profile', es: 'Crea tu perfil' },
        editProfileTitle: { en: 'Change name / photo', es: 'Cambiar nombre / foto' },
        username: { en: 'Username', es: 'Nombre de usuario' },
        usernamePh: { en: 'Your username', es: 'Tu nombre de usuario' },
        photo: { en: 'Profile photo (optional)', es: 'Foto de perfil (opcional)' },
        preview: { en: 'Photo preview', es: 'Vista previa de la foto' },
        enter: { en: 'Join', es: 'Entrar' },
        saveChanges: { en: 'Save changes', es: 'Guardar cambios' },
        saving: { en: 'Saving…', es: 'Guardando…' },
        editProfile: { en: 'Change name / photo', es: 'Cambiar nombre / foto' },
        noSupabase: { en: 'Profile and community are unavailable.', es: 'El perfil y la comunidad no están disponibles.' },
    },
    manager: {
        title: { en: 'Wheel Manager', es: 'Gestor de ruleta' },
        subtitle: { en: 'Set up your spin', es: 'Configura tu giro' },
        editor: { en: 'Wheel Editor', es: 'Editor de ruleta' },
        presets: { en: 'Presets', es: 'Preajustes' },
        themes: { en: 'Themes', es: 'Temas' },
    },
    options: {
        title: { en: 'WHEEL EDITOR', es: 'EDITOR DE RULETA' },
        defaultName: { en: 'Option', es: 'Opción' },
        dragHandle: { en: 'Drag to reorder', es: 'Arrastra para reordenar' },
        moveAria: { en: 'Move option {n} (drag or use the arrow keys)', es: 'Mover la opción {n} (arrastra o usa las flechas)' },
        limitTitle: { en: 'Limit {lim} of {max}: click to edit', es: 'Límite {lim} de {max}: clic para editar' },
        limitAria: { en: 'Option limit (max {max})', es: 'Límite de opciones (máximo {max})' },
        limitEdit: { en: 'Click to edit the limit', es: 'Clic para editar el límite' },
        limitBlocked: { en: 'Cannot lower the limit to {next}: you already have {count} options.', es: 'No se puede bajar el límite a {next}: ya tienes {count} opciones.' },
        add: { en: 'Add option', es: 'Añadir opción' },
        maxReached: { en: 'Max {lim} options', es: 'Máximo {lim} opciones' },
        minReached: { en: 'A wheel needs at least {min} options', es: 'La ruleta necesita al menos {min} opciones' },
        changeColor: { en: 'Change color of sector {n}', es: 'Cambiar color del sector {n}' },
        colorOf: { en: 'Color of {name}', es: 'Color de {name}' },
        optName: { en: 'Option name {n}', es: 'Nombre opción {n}' },
        addImg: { en: 'Add background image', es: 'Añadir imagen de fondo' },
        imgAria: { en: 'Background image for option {n}', es: 'Imagen de fondo opción {n}' },
        imgFile: { en: 'Image file for option {n}', es: 'Archivo imagen opción {n}' },
        removeImg: { en: 'Remove image', es: 'Quitar imagen' },
        removeImgAria: { en: 'Remove image from option {n}', es: 'Quitar imagen opción {n}' },
        removeOpt: { en: 'Remove option {n}', es: 'Eliminar opción {n}' },
        adjustImg: { en: 'Adjust image', es: 'Ajustar imagen' },
        badImgFormat: { en: 'Unsupported format: use PNG, JPEG or WEBP.', es: 'Formato no permitido: usa PNG, JPEG o WEBP.' },
        imgTooBig: { en: 'Image over 2MB: exceeds the localStorage limit (~5MB). Pick a lighter one.', es: 'Imagen mayor de 2MB: excede el límite de localStorage (~5MB). Elige una más ligera.' },
        imgTooHeavy: { en: 'This image is too heavy in base64 for localStorage. It was not saved.', es: 'Esta imagen en base64 es muy pesada para localStorage. No se ha guardado.' },
    },
    wheel: {
        spin: { en: 'SPIN WHEEL', es: 'GIRAR RULETA' },
        spinning: { en: 'SPINNING...', es: 'GIRANDO...' },
        space: { en: 'SPACE', es: 'ESPACIO' },
        toSpin: { en: 'to spin', es: 'para girar' },
        certified: { en: 'Randomness', es: 'Aleatoriedad' },
        empty: { en: 'Add options to spin', es: 'Añade opciones para girar' },
        winnerBadge: { en: 'WINNER', es: 'GANADOR' },
        spinAgain: { en: 'Spin Again', es: 'Girar de nuevo' },
        closeResult: { en: 'Close result', es: 'Cerrar resultado' },
        pointerColor: { en: 'Change the pointer color', es: 'Cambiar el color de la flecha' },
        lightsColor: { en: 'Change the lights color', es: 'Cambiar el color de las luces' },
        sound: { en: 'Wheel sounds', es: 'Sonidos de la ruleta' },
        oddsEqual: { en: 'Each option has a {pct}% chance ({n} options).', es: 'Cada opción tiene un {pct}% de probabilidad ({n} opciones).' },
        oddsTitle: { en: 'Chance per option', es: 'Probabilidad por opción' },
        oddsItem: { en: '{name}: {pct}%', es: '{name}: {pct}%' },
        oddsEmpty: { en: 'Add options to see the odds.', es: 'Añade opciones para ver la probabilidad.' },
        oddsAria: { en: 'Show the chance of each option', es: 'Ver la probabilidad de cada opción' },
    },
    presets: {
        title: { en: 'SAVED PRESETS', es: 'PREAJUSTES' },
        savedCount: { en: '{n} Saved', es: '{n} Guardados' },
        subtitle: { en: 'Switch instantly or create predefined setups for your draws.', es: 'Alterna instantáneamente o crea configuraciones predefinidas para tus sorteos.' },
        mine: { en: 'My presets', es: 'Mis preajustes' },
        viewLabel: { en: 'Preset view', es: 'Vista de preajustes' },
        searchMine: { en: 'Search presets or tags...', es: 'Buscar preajustes o etiquetas...' },
        searchMineAria: { en: 'Search my presets', es: 'Buscar en mis preajustes' },
        searchCommunityAria: { en: 'Search community presets', es: 'Buscar preajustes en la comunidad' },
        newBtn: { en: 'New', es: 'Nuevo' },
        newAria: { en: 'Create new preset', es: 'Crear nuevo preajuste' },
        newTitle: { en: 'New preset from the current wheel', es: 'Nuevo preajuste desde la ruleta actual' },
        namePh: { en: 'Preset name', es: 'Nombre del preajuste' },
        tagsPh: { en: 'Tags (comma separated, optional)', es: 'Etiquetas (separadas por coma, opcional)' },
        create: { en: 'Save preset', es: 'Guardar preajuste' },
        untitled: { en: 'Untitled', es: 'Sin nombre' },
        editTitle: { en: 'Edit preset', es: 'Editar preajuste' },
        editCloudTitle: { en: 'Edit shared preset (cloud)', es: 'Editar preajuste compartido (nube)' },
        editHint: { en: 'Options and look are taken from the wheel: change them in Wheel Editor and come back here to save.', es: 'Las opciones y el aspecto se toman de la ruleta: cámbialos en el Editor de ruleta y vuelve aquí para guardar.' },
        updatedOk: { en: '"{name}" updated.', es: '"{name}" actualizado.' },
        empty: { en: 'No presets found.', es: 'No se encontraron preajustes.' },
        emptyCommunity: { en: 'No community presets yet.', es: 'No hay preajustes en la comunidad todavía.' },
        optionsCount: { en: '{n} options', es: '{n} opciones' },
        more: { en: '+{n} more', es: '+{n} más' },
        loaded: { en: 'Currently loaded', es: 'Cargado actualmente' },
        load: { en: 'Load into Wheel', es: 'Cargar en Ruleta' },
        loadAria: { en: 'Load preset {name}', es: 'Cargar preajuste {name}' },
        use: { en: 'Use', es: 'Usar' },
        useAria: { en: 'Use preset {name}', es: 'Usar preajuste {name}' },
        sharedOk: { en: '"{name}" shared with the community.', es: '"{name}" compartido en la comunidad.' },
        usedOk: { en: '"{name}" loaded and saved to My presets.', es: '"{name}" cargado y guardado en Mis preajustes.' },
    },
    themes: {
        title: { en: 'VISUAL THEMES', es: 'TEMAS VISUALES' },
        savedCount: { en: '{n} Available', es: '{n} Disponibles' },
        subtitle: { en: 'Tune the wheel palette, textures and contrast live.', es: 'Ajusta la paleta cromática, texturas y contraste de la ruleta en vivo.' },
        mine: { en: 'My themes', es: 'Mis temas' },
        viewLabel: { en: 'Theme view', es: 'Vista de temas' },
        searchMine: { en: 'Search themes...', es: 'Buscar temas...' },
        searchMineAria: { en: 'Search my themes', es: 'Buscar en mis temas' },
        empty: { en: 'No themes found.', es: 'No se encontraron temas.' },
        editTitle: { en: 'Edit theme', es: 'Editar tema' },
        editCloudTitle: { en: 'Edit shared theme (cloud)', es: 'Editar tema compartido (nube)' },
        editHint: { en: 'Colors and images are taken from the wheel: change them in Wheel Editor and come back here to save.', es: 'Los colores e imágenes se toman de la ruleta: cámbialos en el Editor de ruleta y vuelve aquí para guardar.' },
        updatedOk: { en: '"{name}" updated.', es: '"{name}" actualizado.' },
        searchCommunityAria: { en: 'Search community themes', es: 'Buscar temas en la comunidad' },
        saveCurrent: { en: 'Save current theme', es: 'Guardar tema actual' },
        saveCurrentAria: { en: 'Save the current visual theme locally', es: 'Guardar tema visual actual en local' },
        newTitle: { en: 'Save current theme as new', es: 'Guardar tema actual como nuevo' },
        namePh: { en: 'Theme name (optional)', es: 'Nombre del tema (opcional)' },
        descPh: { en: 'Description (optional)', es: 'Descripción (opcional)' },
        stylePh: { en: 'Style label', es: 'Etiqueta de estilo' },
        catPh: { en: 'Category', es: 'Categoría' },
        save: { en: 'Save theme', es: 'Guardar tema' },
        autoName: { en: 'Theme {n}', es: 'Tema {n}' },
        emptyCommunity: { en: 'No community themes yet.', es: 'No hay temas en la comunidad todavía.' },
        download: { en: 'Download', es: 'Descargar' },
        downloadAria: { en: 'Download theme {name}', es: 'Descargar tema {name}' },
        applyAria: { en: 'Apply theme {name}', es: 'Aplicar tema {name}' },
        active: { en: 'Active theme', es: 'Tema activo' },
        fallbackStyle: { en: 'STYLE', es: 'ESTILO' },
        fallbackCat: { en: 'CATEGORY', es: 'CATEGORÍA' },
        sharedOk: { en: '"{name}" shared with the community.', es: '"{name}" compartido en la comunidad.' },
        savedOk: { en: '"{name}" saved to My themes.', es: '"{name}" guardado en Mis temas.' },
    },
    common: {
        community: { en: 'Community', es: 'Comunidad' },
        communityCount: { en: '{x} downloaded / {y} available', es: '{x} descargados / {y} disponibles' },
        communityShort: { en: '{x}/{y} Downloaded', es: '{x}/{y} Descargados' },
        searchCommunity: { en: 'Search by name or author...', es: 'Buscar por nombre o autor...' },
        loadingCommunity: { en: 'Loading community…', es: 'Cargando comunidad…' },
        cancel: { en: 'Cancel', es: 'Cancelar' },
        close: { en: 'Close', es: 'Cerrar' },
        delete: { en: 'Delete', es: 'Borrar' },
        shareCloud: { en: 'Share with the community', es: 'Compartir en la comunidad' },
        shareAria: { en: 'Share {name} with the community', es: 'Compartir {name} en la comunidad' },
        edit: { en: 'Edit', es: 'Editar' },
        editAria: { en: 'Edit {name}', es: 'Editar {name}' },
        editCloud: { en: 'Edit in the cloud', es: 'Editar en la nube' },
        editCloudAria: { en: 'Edit {name} in the cloud', es: 'Editar {name} en la nube' },
        deleteAria: { en: 'Delete {name}', es: 'Borrar {name}' },
        deleteCloud: { en: 'Delete from the cloud', es: 'Borrar de la nube' },
        deleteCloudAria: { en: 'Delete {name} from the cloud', es: 'Borrar {name} de la nube' },
        confirmDeleteCloud: { en: 'Click again to delete {name} from the cloud', es: 'Pulsa otra vez para borrar {name} de la nube' },
        saveChanges: { en: 'Save changes', es: 'Guardar cambios' },
        updateCloud: { en: 'Update in the cloud', es: 'Actualizar en la nube' },
        cloudDeleted: { en: '"{name}" deleted from the cloud.', es: '"{name}" borrado de la nube.' },
        cloudUpdated: { en: '"{name}" updated in the cloud.', es: '"{name}" actualizado en la nube.' },
        photoOf: { en: 'Photo of {name}', es: 'Foto de {name}' },
        unknownUser: { en: 'User', es: 'Usuario' },
        noPhoto: { en: 'No profile photo', es: 'Sin foto de perfil' },
        dismissStorage: { en: 'Dismiss storage warning', es: 'Descartar aviso de almacenamiento' },
        noSpace: { en: 'Browser storage is full (localStorage ~5MB): could not save {what}. Delete saved items you do not need or use lighter images.', es: 'Sin espacio en el navegador (localStorage ~5MB): no se han podido guardar {what}. Borra guardados que no necesites o usa imágenes más ligeras.' },
        whatThemes: { en: 'the themes', es: 'los temas' },
        whatActiveTheme: { en: 'the active theme (its textures are heavy)', es: 'el tema activo (sus texturas pesan)' },
        whatPresets: { en: 'the presets', es: 'los preajustes' },
        unexpected: { en: 'Unexpected error. Your local mode still works.', es: 'Error inesperado. Tu modo local sigue funcionando.' },
    },
    imageAdjust: {
        title: { en: 'Adjust image', es: 'Ajustar imagen' },
        sector: { en: 'Sector {n} · {name}', es: 'Sector {n} · {name}' },
        previewAria: { en: 'Image preview for {name}', es: 'Vista previa de la imagen de {name}' },
        hint: { en: 'Drag to move, pinch or scroll to zoom. Arrow keys move it, + and - zoom.', es: 'Arrastra para mover, pellizca o usa la rueda para hacer zoom. Las flechas la mueven, + y - hacen zoom.' },
        asWinner: { en: 'Shown as it looks when it wins, under the pointer.', es: 'Se muestra tal y como queda al ganar, bajo el puntero.' },
        zoom: { en: 'Zoom', es: 'Zoom' },
        rotate: { en: 'Rotation', es: 'Rotación' },
        fitSector: { en: 'Center on sector', es: 'Centrar en el sector' },
        coverWheel: { en: 'Cover whole wheel', es: 'Cubrir toda la ruleta' },
        replace: { en: 'Change image', es: 'Cambiar imagen' },
        remove: { en: 'Remove image', es: 'Quitar imagen' },
        apply: { en: 'Apply', es: 'Aplicar' },
    },
    colorPicker: {
        dialog: { en: 'Custom color picker', es: 'Selector de color personalizado' },
        title: { en: 'Custom color', es: 'Color personalizado' },
        close: { en: 'Close color picker', es: 'Cerrar selector de color' },
        hex: { en: 'Color in hex', es: 'Color en hexadecimal' },
        channel: { en: 'Channel {ch}', es: 'Canal {ch}' },
        eyedropper: { en: 'Pick a color from anywhere on the screen', es: 'Tomar un color de cualquier parte de la pantalla' },
        eyedropperActive: { en: 'Click anywhere to pick a color. Esc cancels.', es: 'Haz clic en cualquier sitio para tomar el color. Esc cancela.' },
        eyedropperScreen: { en: 'Pick a color from the screen: choose the screen, window or tab to capture', es: 'Tomar un color de la pantalla: elige la pantalla, ventana o pestaña que capturar' },
        eyedropperImage: { en: 'Pick a color from an image or screenshot', es: 'Tomar un color de una imagen o captura de pantalla' },
        samplerTitle: { en: 'Pick a color', es: 'Elige un color' },
        samplerHintMouse: { en: 'Click the color you want. Arrow keys move, Enter picks, Esc cancels.', es: 'Haz clic en el color que quieras. Flechas para moverte, Enter elige y Esc cancela.' },
        samplerHintTouch: { en: 'Drag your finger and lift it on the color you want.', es: 'Arrastra el dedo y suéltalo sobre el color que quieras.' },
        samplerOtherImage: { en: 'Another image', es: 'Otra imagen' },
        samplerCanvas: { en: 'Image to pick a color from. Arrow keys move, Enter picks.', es: 'Imagen de la que tomar un color. Flechas para moverte, Enter elige.' },
    },
    errors: {
        notConfigured: { en: 'Supabase is not configured: the app keeps running 100% locally.', es: 'Supabase no está configurado: la app sigue en modo 100% local.' },
        usernameTaken: { en: 'That username is already taken.', es: 'Ese nombre de usuario ya está en uso.' },
        usernameTakenCreate: { en: 'Could not create the user: that name is already taken. Try another one.', es: 'No se pudo crear el usuario: ese nombre ya está en uso. Prueba con otro.' },
        anonDisabled: { en: 'Anonymous sign-in is disabled: enable it in Supabase → Authentication → Providers → Anonymous sign-ins.', es: 'El acceso anónimo está desactivado: actívalo en Supabase → Authentication → Providers → Anonymous sign-ins.' },
        offline: { en: 'No connection to Supabase. Your local mode still works.', es: 'Sin conexión con Supabase. Tu modo local sigue funcionando.' },
        withDetail: { en: '{message} ({detail})', es: '{message} ({detail})' },
        typeUsername: { en: 'Type a username.', es: 'Escribe un nombre de usuario.' },
        usernameTooLong: { en: 'Max {max} characters.', es: 'Máximo {max} caracteres.' },
        readProfile: { en: 'Could not read the profile.', es: 'No se pudo leer el perfil.' },
        badFormat: { en: 'Unsupported format: use PNG, JPEG or WEBP.', es: 'Formato no permitido: usa PNG, JPEG o WEBP.' },
        photoTooBig: { en: 'Photo must be under ~2MB.', es: 'La foto no puede superar ~2MB.' },
        uploadPhoto: { en: 'Could not upload the photo.', es: 'No se pudo subir la foto.' },
        photoUrl: { en: 'Could not get the photo URL.', es: 'No se pudo obtener la URL de la foto.' },
        savedWithoutPhoto: { en: '{error} The profile was saved without the new photo.', es: '{error} Se guardó el perfil sin foto nueva.' },
        saveProfile: { en: 'Could not save the profile.', es: 'No se pudo guardar el perfil.' },
        signIn: { en: 'Could not sign in.', es: 'No se pudo iniciar sesión.' },
        anonSession: { en: 'Could not create the anonymous session.', es: 'No se pudo crear la sesión anónima.' },
        noSession: { en: 'Sign in with your username (profile icon) to share.', es: 'Inicia sesión con tu nombre de usuario (icono de perfil) para compartir.' },
        loadCommunity: { en: 'Could not load the community.', es: 'No se pudo cargar la comunidad.' },
        shareTheme: { en: 'Could not share the theme.', es: 'No se pudo compartir el tema.' },
        themeNoName: { en: 'The theme has no name.', es: 'El tema no tiene nombre.' },
        themeInvalid: { en: 'The theme contains invalid data.', es: 'El tema contiene datos no válidos.' },
        sharePreset: { en: 'Could not share the preset.', es: 'No se pudo compartir el preajuste.' },
        presetNoName: { en: 'The preset has no name.', es: 'El preajuste no tiene nombre.' },
        presetInvalid: { en: 'The preset contains invalid data.', es: 'El preajuste contiene datos no válidos.' },
        cloudUpdate: { en: 'Could not update it in the cloud.', es: 'No se pudo actualizar en la nube.' },
        cloudUpdateBlocked: { en: 'The cloud did not accept the change: it is not yours or cloud editing is not enabled yet (UPDATE policy in Supabase).', es: 'La nube no aceptó el cambio: no es tuyo o la edición en la nube aún no está activada (política UPDATE en Supabase).' },
        cloudDelete: { en: 'Could not delete it from the cloud.', es: 'No se pudo borrar de la nube.' },
        cloudDeleteBlocked: { en: 'Nothing was deleted: it is not yours or it no longer exists.', es: 'No se borró nada: no es tuyo o ya no existe.' },
    },
    time: {
        justNow: { en: 'just now', es: 'ahora mismo' },
        minutes: { en: '{n}m ago', es: 'hace {n}min' },
        hours: { en: '{n}h ago', es: 'hace {n}h' },
        days: { en: '{n}d ago', es: 'hace {n}d' },
        months: { en: '{n}mo ago', es: 'hace {n} mes' },
        years: { en: '{n}y ago', es: 'hace {n}a' },
    },
} as const;

export type DictSection = keyof typeof STRINGS;
export type DictKey<S extends DictSection> = keyof (typeof STRINGS)[S] & string;
export type TextVars = Record<string, string | number>;

export function fillVars(text: string, vars?: TextVars): string {
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

export function pickText<S extends DictSection>(section: S, key: DictKey<S>, lang: SpinlyLang, vars?: TextVars): string {
    const entry = (STRINGS[section] as unknown as Record<string, Entry>)[key];
    if (!entry) return key;
    return fillVars(entry[lang] ?? entry.en, vars);
}

/**
 * Mensaje en todos los idiomas. Lo que se guarda en estado usa esto y no un string ya resuelto,
 * para re-traducirse si cambia el idioma con el mensaje en pantalla. Se pinta con tm().
 */
export type LocalMessage = Readonly<Record<SpinlyLang, string>>;

export function dictMessage<S extends DictSection>(section: S, key: DictKey<S>, vars?: TextVars): LocalMessage {
    return {
        en: pickText(section, key, 'en', vars),
        es: pickText(section, key, 'es', vars),
    };
}

/** Como dictMessage, pero con variables que son a su vez mensajes localizados. */
export function dictMessageWith<S extends DictSection>(
    section: S,
    key: DictKey<S>,
    vars: Record<string, string | number | LocalMessage>,
): LocalMessage {
    const resolve = (lang: SpinlyLang): TextVars => {
        const out: TextVars = {};
        for (const [name, value] of Object.entries(vars)) {
            out[name] = typeof value === 'object' ? value[lang] : value;
        }
        return out;
    };
    return {
        en: pickText(section, key, 'en', resolve('en')),
        es: pickText(section, key, 'es', resolve('es')),
    };
}

// El contenido semilla es texto de la app, no del usuario: sí se localiza. Clave = id.
type SeedFields = { name?: Entry; description?: Entry; category?: Entry };

const SEED_TEXT: Record<string, SeedFields> = {
    'theme-obsidian': {
        description: { en: 'Deep dark mode, titanium & high precision.', es: 'Modo oscuro profundo, titanio & alta precisión.' },
        category: { en: 'DEFAULT', es: 'POR DEFECTO' },
    },
    'theme-neon': {
        description: { en: 'Electric cyan, synthwave magenta & ultraviolet.', es: 'Cian eléctrico, magenta synthwave & ultravioleta.' },
    },
    'default-preset-cena': {
        name: { en: 'Friday Dinner', es: 'Cena de Viernes' },
    },
    'default-preset-juegos': {
        name: { en: 'Board Games', es: 'Juegos de Mesa' },
    },
};

export function seedText(id: string, field: keyof SeedFields, lang: SpinlyLang): string | undefined {
    const entry = SEED_TEXT[id]?.[field];
    return entry ? entry[lang] : undefined;
}
