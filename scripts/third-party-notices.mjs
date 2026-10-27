import { createRequire } from 'node:module';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

// Follow the installed production dependency graph, including transitive packages.
// License texts must accompany the bundled code even though esbuild removes node_modules.
export async function writeThirdPartyNotices() {
  const root = resolve('package.json');
  const seen = new Set();
  const sections = [];
  async function visit(manifestPath, includeLicense) {
    if (seen.has(manifestPath)) return;
    seen.add(manifestPath);
    const pkg = JSON.parse(await readFile(manifestPath, 'utf8'));
    const directory = dirname(manifestPath);
    if (includeLicense) {
      const names = (await readdir(directory)).filter(name => /^(licen[cs]e|copying|notice)(\.|$)/i.test(name)).sort();
      if (!names.length) throw new Error(`Missing license text for ${pkg.name}`);
      const texts = await Promise.all(names.map(async name => `${name}\n\n${await readFile(join(directory, name), 'utf8')}`));
      sections.push({ name: pkg.name, text: `${pkg.name} ${pkg.version} (${pkg.license ?? 'see license text'})\n\n${texts.join('\n\n')}` });
    }
    const require = createRequire(manifestPath);
    for (const name of Object.keys(pkg.dependencies ?? {}).sort()) {
      let depManifest;
      try { depManifest = require.resolve(`${name}/package.json`); }
      catch {
        let directory = dirname(require.resolve(name));
        for (;;) {
          const candidate = join(directory, 'package.json');
          try {
            const candidatePkg = JSON.parse(await readFile(candidate, 'utf8'));
            if (candidatePkg.name === name) { depManifest = candidate; break; }
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
          }
          const parent = dirname(directory);
          if (parent === directory) throw new Error(`Cannot find manifest for ${name}`);
          directory = parent;
        }
      }
      await visit(depManifest, true);
    }
  }
  await visit(root, false);
  sections.sort((a, b) => a.name.localeCompare(b.name));
  const fontLicense = await readFile('assets/fonts/LICENSE.md', 'utf8');
  const text = [
    'md0 — Third-party notices',
    'Generated from the installed production dependencies. These notices do not license md0 itself.',
    'Electron and Chromium runtime notices are provided separately as LICENSE.electron.txt and LICENSES.chromium.html in the installed application directory.',
    ...sections.map(section => section.text),
    `Bundled fonts: iA Writer Mono\n\n${fontLicense}`,
  ].join('\n\n' + '='.repeat(72) + '\n\n');
  await writeFile('out/THIRD_PARTY_NOTICES.txt', text + '\n');
}
