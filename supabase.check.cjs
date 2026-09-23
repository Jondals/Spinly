// Comprobación contra el Supabase real (sin navegador), con las mismas llamadas que la app.
//   1. Flujo: sesión anónima, perfil, foto, compartir, lectura pública con autor, editar y borrar.
//   2. Seguridad: lo que RLS debe bloquear y que la lectura pública no expone datos sensibles.
// Uso: pnpm test:supabase  (lee .env.local). Crea un usuario anónimo de prueba que solo
// se puede borrar desde el dashboard; las filas de prueba se eliminan al terminar.
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const env = {};
for (const line of fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
if (!env.REACT_APP_SUPABASE_URL || !env.REACT_APP_SUPABASE_ANON_KEY) {
    console.error('[FALLO] .env.local sin REACT_APP_SUPABASE_URL / REACT_APP_SUPABASE_ANON_KEY');
    process.exit(2);
}

const opts = { auth: { persistSession: false } };
const client = () => createClient(env.REACT_APP_SUPABASE_URL, env.REACT_APP_SUPABASE_ANON_KEY, opts);
const anon = client();
const authed = client();

const OTHER_UID = '11111111-1111-4111-8111-111111111111';
const stamp = Date.now();
const username = 'spinly_check_' + String(stamp).slice(-6);
const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const report = [];
const describeError = (e) => (e.message || String(e)) + (e.code ? ' [' + e.code + ']' : '');
const throwIf = (error) => {
    if (!error) return;
    const e = new Error(error.message);
    e.code = error.code;
    throw e;
};

/** Paso que debe funcionar. */
async function step(name, fn) {
    try {
        report.push(['OK', name, (await fn()) || '']);
    } catch (e) {
        report.push(['FALLO', name, describeError(e)]);
        throw e;
    }
}

/** Operación que RLS debe impedir (error o 0 filas afectadas). */
async function expectBlocked(name, fn) {
    try {
        const info = await fn();
        report.push(['FALLO', name, 'NO FUE BLOQUEADA -> ' + JSON.stringify(info || {}).slice(0, 160)]);
    } catch (e) {
        report.push(['OK', name, 'bloqueada: ' + describeError(e).slice(0, 110)]);
    }
}

/** UPDATE/DELETE con RLS no da error: filtra. .select('id') cuenta las filas tocadas. */
const touched = async (query) => {
    const { data, error } = await query.select('id');
    throwIf(error);
    if (!data || data.length === 0) throw new Error('0 filas afectadas');
    return data.length + ' fila(s)';
};

(async () => {
    let uid = null;
    let themeId = null;
    let presetId = null;

    try {
        await expectBlocked('S1. insert shared_themes sin sesión', async () => {
            const { error } = await anon.from('shared_themes').insert({ author_id: OTHER_UID, name: 'SEC', segments: [{ color: '#111111' }] });
            throwIf(error);
        });
        await expectBlocked('S2. insert profiles sin sesión', async () => {
            const { error } = await anon.from('profiles').insert({ id: OTHER_UID, username: 'sec_intruso' });
            throwIf(error);
        });
        await expectBlocked('S3. subir avatar sin sesión', async () => {
            const { error } = await anon.storage.from('avatars').upload('sin-sesion/x.png', new Blob([PNG_1x1], { type: 'image/png' }));
            throwIf(error);
        });

        await step('1. Sesión anónima', async () => {
            const { data, error } = await authed.auth.signInAnonymously({ options: { data: { username } } });
            throwIf(error);
            uid = data.user ? data.user.id : data.session.user.id;
            return 'uid=' + uid;
        });

        await expectBlocked('S4. insert shared_themes con author_id ajeno', async () => {
            const { error } = await authed.from('shared_themes').insert({ author_id: OTHER_UID, name: 'SEC', segments: [{ color: '#111111' }] });
            throwIf(error);
        });
        await expectBlocked('S5. subir avatar a la carpeta de otro uid', async () => {
            const { error } = await authed.storage.from('avatars').upload(OTHER_UID + '/x.png', new Blob([PNG_1x1], { type: 'image/png' }));
            throwIf(error);
        });
        await expectBlocked('S6. insert profiles con id ajeno', async () => {
            const { error } = await authed.from('profiles').insert({ id: OTHER_UID, username: 'sec_intruso2' });
            throwIf(error);
        });

        let avatarUrl = null;
        await step('2. Subir foto de perfil y guardarla en profiles', async () => {
            const file = uid + '/avatar_' + stamp + '.png';
            const upload = await authed.storage.from('avatars').upload(file, new Blob([PNG_1x1], { type: 'image/png' }), { contentType: 'image/png' });
            throwIf(upload.error);
            avatarUrl = authed.storage.from('avatars').getPublicUrl(file).data.publicUrl;
            const response = await fetch(avatarUrl);
            if (!response.ok) throw new Error('foto no pública: HTTP ' + response.status);
            const { error } = await authed.from('profiles').upsert({ id: uid, username, avatar_url: avatarUrl });
            throwIf(error);
            return avatarUrl;
        });

        await step('3. Compartir tema y preset', async () => {
            const theme = await authed.from('shared_themes').insert({
                author_id: uid, name: 'Tema check ' + stamp, segments: [{ color: '#6366f1' }, { color: '#a78bfa' }],
            }).select('id').single();
            throwIf(theme.error);
            themeId = theme.data.id;
            const preset = await authed.from('shared_presets').insert({
                author_id: uid, name: 'Preset check ' + stamp, tags: ['check'],
                options: [{ id: 'o1', name: 'Alpha', color: 'indigo' }],
                theme: { id: 't', name: 'T', segments: [{ color: '#6366f1' }] },
            }).select('id').single();
            throwIf(preset.error);
            presetId = preset.data.id;
            return 'tema=' + themeId + ' preset=' + presetId;
        });

        await step('4. Lectura pública con el autor (join profiles)', async () => {
            const { data, error } = await anon.from('shared_themes')
                .select('id, author:profiles(username, avatar_url)').eq('id', themeId).maybeSingle();
            throwIf(error);
            if (!data) throw new Error('el tema no aparece en la lectura pública');
            if (data.author?.username !== username || data.author?.avatar_url !== avatarUrl) {
                throw new Error('join de autor incorrecto: ' + JSON.stringify(data.author));
            }
            return 'autor=' + data.author.username;
        });

        await step('S7. La lectura pública solo expone columnas esperadas', async () => {
            const expected = {
                shared_themes: ['id', 'author_id', 'name', 'description', 'style_tag', 'category', 'segments', 'border_color', 'center_color', 'pointer_color', 'light_color', 'created_at'],
                shared_presets: ['id', 'author_id', 'name', 'options', 'theme', 'tags', 'created_at'],
                profiles: ['id', 'username', 'avatar_url', 'created_at'],
            };
            const rows = {
                shared_themes: await anon.from('shared_themes').select('*').eq('id', themeId).maybeSingle(),
                shared_presets: await anon.from('shared_presets').select('*').eq('id', presetId).maybeSingle(),
                profiles: await anon.from('profiles').select('*').eq('id', uid).maybeSingle(),
            };
            const extras = [];
            for (const [table, { data, error }] of Object.entries(rows)) {
                throwIf(error);
                for (const column of Object.keys(data || {})) {
                    if (!expected[table].includes(column) || /email|token|password|secret|phone/i.test(column)) extras.push(table + '.' + column);
                }
            }
            if (extras.length) throw new Error('columnas de más: ' + extras.join(', '));
            return 'sin columnas sensibles';
        });

        await step('5. El autor edita su tema y su preset (UPDATE)', async () => {
            try {
                await touched(authed.from('shared_themes').update({ name: 'Tema editado' }).eq('id', themeId));
                await touched(authed.from('shared_presets').update({ tags: ['editado'] }).eq('id', presetId));
            } catch (e) {
                throw new Error(e.message + ' -> ejecuta supabase-update-policies.sql');
            }
            return '2 filas actualizadas';
        });

        await expectBlocked('S8. reasignar author_id a otro usuario', () =>
            touched(authed.from('shared_themes').update({ author_id: OTHER_UID }).eq('id', themeId)));
        await expectBlocked('S9. UPDATE sin sesión', () =>
            touched(anon.from('shared_themes').update({ name: 'intruso' }).eq('id', themeId)));
        await expectBlocked('S10. DELETE sin sesión', () =>
            touched(anon.from('shared_themes').delete().eq('id', themeId)));
    } catch {
        // El informe ya recoge el paso que falló; la limpieza se hace igualmente.
    } finally {
        if (themeId) await authed.from('shared_themes').delete().eq('id', themeId);
        if (presetId) await authed.from('shared_presets').delete().eq('id', presetId);
    }

    const failed = report.filter(([status]) => status !== 'OK').length;
    for (const [status, name, info] of report) console.log('[' + status + '] ' + name + ' -> ' + info);
    console.log(failed === 0 ? '\nTodo OK.' : '\n' + failed + ' comprobaciones fallidas.');
    if (uid) console.log('Usuario de prueba: ' + username + ' (uid ' + uid + '), bórralo desde el dashboard si quieres.');
    // El cliente de auth deja un timer de refresco que mantendría vivo el proceso.
    setTimeout(() => process.exit(failed === 0 ? 0 : 1), 300);
})();
