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
fs.writeFileSync(htmlPath, html.replace(link[0], () => `<style>${css}</style>`));
console.log(`inline-css: ${link[1]} incrustado (${(css.length / 1024).toFixed(1)} kB)`);
