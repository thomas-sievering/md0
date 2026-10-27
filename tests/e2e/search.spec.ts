import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('autosave keeps query typing in the focused search input instead of changing source', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'md0-search-autosave-'));
  const path = join(directory, 'note.md');
  const source = '\uFEFF# Needle\r\nneedle\n';
  await writeFile(path, source);
  const app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${join(directory, 'profile')}`, path] });
  try {
    const page = await app.firstWindow();
    const editor = page.getByRole('textbox', { name: 'Markdown bearbeiten' });
    await expect(editor).toContainText('Needle');
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await editor.focus();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('Local text');
    await expect(page.locator('#status')).toHaveText('Ungespeichert');
    await page.keyboard.press('Control+f');
    const search = page.getByRole('searchbox', { name: 'Im Dokument suchen' });
    await search.fill('needle');
    await page.clock.runFor(1600);
    await expect(page.locator('#status')).toHaveText('Gespeichert');
    await expect(search).toBeFocused();
    await page.keyboard.type(' query suffix');
    await expect(search).toHaveValue('needle query suffix');
    await page.clock.runFor(2000);
    expect(await readFile(path, 'utf8')).toBe(source + 'Local text');
    await expect(editor).not.toContainText('query suffix');
  } finally {
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); });
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('external reload retains the query, input caret and focused search control', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'md0-search-reload-'));
  const path = join(directory, 'note.md');
  await writeFile(path, '# Before\nneedle needle\n');
  const app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${join(directory, 'profile')}`, path] });
  try {
    const page = await app.firstWindow();
    const editor = page.getByRole('textbox', { name: 'Markdown bearbeiten' });
    await expect(editor).toContainText('# Before');
    await page.keyboard.press('Control+f');
    const search = page.getByRole('searchbox', { name: 'Im Dokument suchen' });
    await search.fill('needle');
    await search.press('Home');
    await search.press('ArrowRight');
    const changed = '# Agent\nneedle needle needle\n';
    await writeFile(path, changed);
    await expect(editor).toContainText('# Agent');
    await expect(search).toBeFocused();
    await expect(search).toHaveValue('needle');
    await expect(page.locator('#search-count')).toHaveText(/^[1-3] \/ 3$/);
    await page.keyboard.type('X');
    await expect(search).toHaveValue('nXeedle');
    await expect(page.locator('#search-count')).toHaveText('Keine Treffer');
    expect(await readFile(path, 'utf8')).toBe(changed);
    await search.fill('needle');
    const next = page.getByRole('button', { name: 'Nächster Treffer', exact: true });
    await next.click();
    await expect(next).toBeFocused();
    const changedAgain = '# Agent again\nneedle\n';
    await writeFile(path, changedAgain);
    await expect(editor).toContainText('# Agent again');
    await expect(next).toBeFocused();
    await expect(search).toHaveValue('needle');
    await expect(page.locator('#search-count')).toHaveText('1 / 1');
    await page.keyboard.press('Escape');
    await expect(search).toBeHidden();
    await expect(editor).toBeFocused();
    expect(await readFile(path, 'utf8')).toBe(changedAgain);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('search opens from shortcut and menu, navigates literally, updates and leaves source unchanged', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'md0-search-'));
  const path = join(directory, 'note.md');
  const source = '\uFEFF# Needle\r\nneedle and [literal]\nNEEDLE\r\n';
  await writeFile(path, source);
  const app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${join(directory, 'profile')}`, path] });
  try {
    const page = await app.firstWindow();
    const editor = page.getByRole('textbox', { name: 'Markdown bearbeiten' });
    const search = page.getByRole('searchbox', { name: 'Im Dokument suchen' });
    const count = page.locator('#search-count');
    await expect(editor).toContainText('Needle');
    await expect(search).toBeHidden();
    await page.keyboard.press('Control+f');
    await expect(search).toBeFocused();
    await expect(count).toHaveText('Suchbegriff eingeben');
    await search.fill('needle');
    await expect(count).toHaveText('1 / 3');
    await expect(page.locator('.cm-searchMatch')).toHaveCount(3);
    await search.press('Enter');
    await expect(count).toHaveText('2 / 3');
    await search.press('Shift+Enter');
    await expect(count).toHaveText('1 / 3');
    await page.getByRole('button', { name: 'Vorheriger Treffer', exact: true }).click();
    await expect(count).toHaveText('3 / 3');
    await page.getByRole('button', { name: 'Nächster Treffer', exact: true }).click();
    await expect(count).toHaveText('1 / 3');
    await search.fill('missing');
    await expect(count).toHaveText('Keine Treffer');
    await search.fill('[literal]');
    await expect(count).toHaveText('1 / 1');
    await search.press('Escape');
    await expect(search).toBeHidden();
    await expect(editor).toBeFocused();
    expect(await readFile(path, 'utf8')).toBe(source);
    await expect(page.locator('#status')).toHaveText('Gespeichert');
    await page.getByRole('button', { name: 'Menü', exact: true }).click();
    await page.getByRole('button', { name: 'Im Dokument suchen', exact: false }).click();
    await expect(search).toBeFocused();
    await search.fill('needle');
    await editor.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('needle');
    await expect(count).toHaveText('1 / 4');
    await page.getByRole('button', { name: 'Suche schließen', exact: true }).click();
    await expect(editor).toBeFocused();
    await expect(search).toBeHidden();
  } finally {
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); });
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
