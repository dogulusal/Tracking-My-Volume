// Builds the coach-mode demo as one HTML file for a claude.ai artifact: the
// page there can load nothing from its own folder reliably, so the script,
// the styles and the fonts all go inline. Cloud off: no Supabase settings.
import { build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

process.env.VITE_DEMO = 'antrenor';
process.env.VITE_SUPABASE_URL = '';
process.env.VITE_SUPABASE_ANON_KEY = '';

const outDir = path.resolve('dist-demo');
await build({
  base: './',
  publicDir: false,
  logLevel: 'warn',
  build: { outDir, emptyOutDir: true, assetsInlineLimit: 100 * 1024 * 1024, modulePreload: false, cssCodeSplit: false },
});

const index = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
const jsFile = index.match(/<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"/)?.[1];
const cssFile = index.match(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"/)?.[1];
if (!jsFile || !cssFile) throw new Error(`Script or stylesheet not found in index.html:\n${index}`);
const js = fs.readFileSync(path.join(outDir, jsFile), 'utf8').replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(outDir, cssFile), 'utf8').replace(/<\/style/gi, '<\\/style');
if (/url\((?!["']?data:)/.test(css.replace(/url\(["']?#/g, ''))) console.warn('Uyarı: CSS içinde dosyaya giden url() kaldı.');

// The artifact host wraps the page in its own document, so no <html>/<head>.
const page = `<title>Antrenör Modu Demo</title>
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`;
fs.writeFileSync(path.join(outDir, 'antrenor-demo.html'), page);
// The same page in a plain document, for checking it locally.
fs.writeFileSync(path.join(outDir, 'check.html'),
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>${page}</body></html>`);
console.log(`antrenor-demo.html: ${(page.length / 1024).toFixed(0)} KB`);
