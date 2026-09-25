// Paso posterior al build: incrusta el CSS principal en build/index.html.
// Evita una petición que bloquea el primer pintado (~8 kB gzip, cabe de sobra en el HTML).
// Los CSS de los paneles que cargan bajo demanda siguen siendo archivos aparte.
const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, 'build');
const htmlPath = path.join(buildDir, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const link = html.match(/<link href="(\/static\/css\/main\.[\w]+\.css)" rel="stylesheet">/);

if (!link) {
    console.error('inline-css: no se encontró el CSS principal en build/index.html');
    process.exit(1);
}

// El sourcemap no sirve una vez incrustado: se quita la referencia.
const css = fs.readFileSync(path.join(buildDir, link[1]), 'utf8').replace(/\/\*# sourceMappingURL=.*?\*\/\s*$/, '');
// React DOM es un trozo aparte (src/index.tsx): se precarga desde el HTML para que se descargue a la
// vez que main.js y no después de evaluarlo.
const reactDom = fs.readdirSync(path.join(buildDir, 'static/js')).find((file) => /^react-dom\.[\w]+\.chunk\.js$/.test(file));
if (!reactDom) {
    console.error('inline-css: no se encontró el trozo de React DOM en build/static/js');
    process.exit(1);
}
const preload = `<link rel="preload" as="script" href="/static/js/${reactDom}">`;
fs.writeFileSync(htmlPath, html.replace(link[0], () => `${preload}<style>${css}</style>`));
console.log(`inline-css: ${link[1]} incrustado (${(css.length / 1024).toFixed(1)} kB), ${reactDom} precargado`);

// La CSP (vercel.json) solo deja ejecutar scripts propios: cada script inline del HTML final
// (ya minificado) debe tener su hash en script-src o el navegador lo bloquearía en producción.
const crypto = require('crypto');
const csp = JSON.parse(fs.readFileSync(path.join(__dirname, 'vercel.json'), 'utf8')).headers
    .flatMap((rule) => rule.headers)
    .find((header) => header.key === 'Content-Security-Policy')?.value ?? '';
const missing = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map((match) => `'sha256-${crypto.createHash('sha256').update(match[1], 'utf8').digest('base64')}'`)
    .filter((hash) => !csp.includes(hash));
if (missing.length) {
    console.error(`inline-css: añade a script-src de vercel.json: ${missing.join(' ')}`);
    process.exit(1);
}
