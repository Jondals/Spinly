/**
 * Post-build step (runs after `react-scripts build`):
 * 1. Inlines the main CSS into build/index.html. It saves a render-blocking request (~8 kB gzip, it fits
 *    easily in the HTML). The CSS of the panels that load on demand stays in separate files.
 * 2. Preloads the React DOM chunk so it downloads in parallel with main.js.
 * 3. Checks that every inline script of the final HTML has its hash in the CSP of vercel.json.
 */
const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, 'build');
const htmlPath = path.join(buildDir, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const link = html.match(/<link href="(\/static\/css\/main\.[\w]+\.css)" rel="stylesheet">/);

if (!link) {
    console.error('inline-css: main CSS not found in build/index.html');
    process.exit(1);
}

// The source map is useless once inlined: its reference is removed.
const css = fs.readFileSync(path.join(buildDir, link[1]), 'utf8').replace(/\/\*# sourceMappingURL=.*?\*\/\s*$/, '');
// React DOM is a separate chunk (src/index.tsx): it is preloaded from the HTML so it downloads alongside
// main.js instead of after it is evaluated.
const reactDom = fs.readdirSync(path.join(buildDir, 'static/js')).find((file) => /^react-dom\.[\w]+\.chunk\.js$/.test(file));
if (!reactDom) {
    console.error('inline-css: React DOM chunk not found in build/static/js');
    process.exit(1);
}
const preload = `<link rel="preload" as="script" href="/static/js/${reactDom}">`;
fs.writeFileSync(htmlPath, html.replace(link[0], () => `${preload}<style>${css}</style>`));
console.log(`inline-css: ${link[1]} inlined (${(css.length / 1024).toFixed(1)} kB), ${reactDom} preloaded`);

// The CSP (vercel.json) only allows the app's own scripts: every inline script of the final (minified)
// HTML must have its hash in script-src, or the browser would block it in production.
const crypto = require('crypto');
const csp = JSON.parse(fs.readFileSync(path.join(__dirname, 'vercel.json'), 'utf8')).headers
    .flatMap((rule) => rule.headers)
    .find((header) => header.key === 'Content-Security-Policy')?.value ?? '';
const missing = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map((match) => `'sha256-${crypto.createHash('sha256').update(match[1], 'utf8').digest('base64')}'`)
    .filter((hash) => !csp.includes(hash));
if (missing.length) {
    console.error(`inline-css: add to script-src in vercel.json: ${missing.join(' ')}`);
    process.exit(1);
}
