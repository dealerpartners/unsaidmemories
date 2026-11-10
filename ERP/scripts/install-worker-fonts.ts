#!/usr/bin/env bun
/**
 * Install the Studio's web fonts into the render worker's fontconfig.
 *
 * The worker renders SVG text via fontconfig — webfonts (woff2) are
 * invisible to it. public/inter.woff2 (the Studio's default text font)
 * is converted to TTF via fontTools (python3) and dropped into ~/.fonts,
 * then fc-cache refreshes. Idempotent — run once per environment:
 *
 *   bun run scripts/install-worker-fonts.ts
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
const woff2 = join(root, 'public', 'inter.woff2');
const fontsDir = join(process.env.HOME ?? '/home/z', '.fonts');
const ttf = join(fontsDir, 'Inter.ttf');

if (!existsSync(woff2)) {
  console.error(`Missing ${woff2} — nothing to install.`);
  process.exit(1);
}
mkdirSync(fontsDir, { recursive: true });

// woff2 → ttf via fontTools (python3, brotli for the woff2 decoder).
const py = `
from fontTools.ttLib import TTFont
f = TTFont(${JSON.stringify(woff2)})
f.flavor = None
f.save(${JSON.stringify(ttf)})
print('converted', f['name'].getDebugName(1))
`;
writeFileSync('/tmp/convert-font.py', py);
execSync('python3 /tmp/convert-font.py', { stdio: 'inherit' });

// fc-cache so fontconfig sees the new face; verify fc-match resolves it.
execSync(`fc-cache -f ${fontsDir}`, { stdio: 'inherit' });
const matched = execSync('fc-match Inter', { encoding: 'utf8' }).trim();
console.log('fc-match Inter →', matched);
if (!matched.toLowerCase().includes('inter')) {
  console.error('Inter did not register with fontconfig.');
  process.exit(1);
}
console.log('Inter installed for the render worker.');
