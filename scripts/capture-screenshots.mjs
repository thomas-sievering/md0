import { _electron as electron } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const directory = await mkdtemp(join(tmpdir(), 'md0-screenshots-'));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const sample = `# A little room to think

One document. A quiet place to begin.

## Keep it simple

Write in plain Markdown. Let the words do the work.

- Local files, in your own folders
- A pause to save, a moment to breathe
- No tabs. No preview. Just the text.

## Leave some space

> There is no need to fill every corner.

Return to the sentence. Start there.
`;
let app;
try {
  await mkdir('docs/images', { recursive: true });
  app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${join(directory, 'profile')}`], env });
  const page = await app.firstWindow();
  const editor = page.getByRole('textbox', { name: 'Markdown bearbeiten' });
  await editor.waitFor();
  await editor.fill(sample);
  await page.getByRole('status').filter({ hasText: 'Lokal gesichert' }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  for (const theme of ['light', 'dark']) {
    await app.evaluate(({ nativeTheme }, theme) => { nativeTheme.themeSource = theme; }, theme);
    await page.emulateMedia({ colorScheme: theme });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: `docs/images/md0-${theme}.png`, fullPage: false, animations: 'disabled', caret: 'hide' });
  }
  console.log('Captured light/dark screenshots using an isolated sample draft.');
} finally {
  if (app) await app.close();
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
