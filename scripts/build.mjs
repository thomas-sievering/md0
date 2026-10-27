import { build } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
import { writeThirdPartyNotices } from './third-party-notices.mjs';

await mkdir('out', { recursive: true });
await Promise.all([
  build({ entryPoints: ['src/main/main.ts'], outfile: 'out/main.cjs', bundle: true, platform: 'node', external: ['electron'] }),
  build({ entryPoints: ['src/preload.ts'], outfile: 'out/preload.cjs', bundle: true, platform: 'node', external: ['electron'] }),
  build({ entryPoints: ['src/renderer/editor.ts'], outfile: 'out/editor.js', bundle: true, platform: 'browser' }),
  cp('src/renderer/index.html', 'out/index.html'),
  cp('src/renderer/style.css', 'out/style.css'),
  cp('src/renderer/favicon.svg', 'out/favicon.svg'),
  cp('assets/icons/md0.ico', 'out/icon.ico'),
  cp('assets/fonts', 'out/fonts', { recursive: true }),
  writeThirdPartyNotices(),
]);
