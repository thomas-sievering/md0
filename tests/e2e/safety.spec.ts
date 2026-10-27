import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

declare global { var safetyConfirmations: number; }

test('conflicts and read failures retain local text across new-window opens and canceled close', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'md0-safety-'));
  const first = join(directory, 'first.md');
  const second = join(directory, 'second.md');
  await writeFile(first, '# First\n');
  await writeFile(second, '# Second\n');
  const app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${join(directory, 'profile')}`] });
  try {
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
      globalThis.safetyConfirmations = 0;
      dialog.showMessageBox = async () => {
        globalThis.safetyConfirmations++;
        return { response: 0, checkboxChecked: false };
      };
    }, first);
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'Menü', exact: true }).click();
    await page.getByRole('button', { name: 'Datei öffnen' }).click();
    const editor = page.getByRole('textbox', { name: 'Markdown bearbeiten' });
    await expect(editor).toContainText('# First');
    await editor.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('Local text');
    await expect(page.getByRole('status')).toHaveText('Ungespeichert');
    await writeFile(first, '# Agent\n');
    await page.keyboard.press('Control+s');
    await expect(page.getByRole('alert')).toContainText('Konflikt');
    await expect(editor).toContainText('Local text');
    expect(await readFile(first, 'utf8')).toBe('# Agent\n');

    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, second);
    await page.keyboard.press('Control+o');
    await expect.poll(() => app.windows().length).toBe(2);
    const other = app.windows().find(candidate => candidate !== page)!;
    await expect(other.getByRole('textbox')).toContainText('# Second');
    expect(await app.evaluate(() => globalThis.safetyConfirmations)).toBe(0);
    await expect(page.locator('#open')).toBeEnabled();
    await expect(editor).toContainText('Local text');
    await expect(page.locator('#file-label')).toHaveText('first.md');

    await app.evaluate(({ BrowserWindow }, title) => BrowserWindow.getAllWindows().find(window => window.getTitle().includes(title))?.close(), 'first.md');
    await expect.poll(() => app.evaluate(() => globalThis.safetyConfirmations)).toBe(1);
    await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'true');
    await expect(editor).toContainText('Local text');
    expect(app.windows()).toHaveLength(2);

    await app.evaluate(({ dialog }, path) => {
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, join(directory, 'missing.md'));
    await page.keyboard.press('Control+o');
    await expect(page.getByRole('alert')).toContainText('Öffnen fehlgeschlagen');
    await expect(editor).toContainText('Local text');

    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, second);
    await page.keyboard.press('Control+o');
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.getTitle())).toBe('second.md');
    await expect(editor).toContainText('Local text');
    await expect(page.getByRole('status')).toHaveText('Ungespeichert');
    expect(app.windows()).toHaveLength(2);
    expect(await readFile(first, 'utf8')).toBe('# Agent\n');
  } finally {
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    });
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
