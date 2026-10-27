import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('external updates, both conflict actions and restart recovery through visible controls', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'md0-external-'));
  const path = join(directory, 'note.md');
  const copy = join(directory, 'copy.md');
  const args = [resolve('.'), `--user-data-dir=${join(directory, 'profile')}`];
  await writeFile(path, '# Original\r\nLine two\n');
  let app = await electron.launch({ args });
  async function openFile() {
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    }, path);
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'Menü', exact: true }).click();
    await page.getByRole('button', { name: 'Datei öffnen' }).click();
    await expect(page.getByRole('textbox')).toContainText('# Original');
    return page;
  }
  try {
    const page = await openFile();
    const editor = page.getByRole('textbox');
    await editor.click();
    await page.keyboard.press('Control+Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
    await writeFile(path, '# Agent\r\nLine two\n');
    await expect(editor).toContainText('# Agent');
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('Line two');
    await expect(page.locator('#notice')).toBeVisible();
    await expect(page.locator('#notice')).toBeHidden({ timeout: 7000 });
    await writeFile(path, '# Agent again\r\nLine two\n');
    await expect(editor).toContainText('# Agent again');
    await expect(page.locator('#notice')).toBeVisible();
    // A clean external replacement must not leave old raw-source undo history.
    await editor.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('Local text');
    await writeFile(path, '# Other agent\n');
    await expect(page.getByRole('button', { name: 'Dateiversion laden', exact: true })).toBeVisible();
    await expect(editor).toContainText('Local text');
    await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: true, filePath: '' }); });
    await page.getByRole('button', { name: 'Meine Version als Kopie speichern' }).click();
    await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'true');
    await expect(editor).toContainText('Local text');
    await app.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }); }, copy);
    await page.getByRole('button', { name: 'Meine Version als Kopie speichern' }).click();
    await expect(page.locator('#notice')).toContainText('als Kopie gespeichert');
    expect(await readFile(copy, 'utf8')).toBe('# Agent again\r\nLine two\nLocal text');
    await writeFile(path, '# Latest agent\n');
    await page.screenshot({ path: 'test-results/conflict-actions.png', fullPage: true });
    await page.getByRole('button', { name: 'Dateiversion laden', exact: true }).click();
    await expect(editor).toContainText('# Latest agent');
    await expect(page.getByRole('status')).toHaveText('Gespeichert');
    await app.close();
    // Recovery is available directly at startup, even if the original disappeared.
    await rm(path);
    app = await electron.launch({ args });
    const restarted = await app.firstWindow();
    await restarted.getByRole('button', { name: 'Menü', exact: true }).click();
    await restarted.getByRole('button', { name: 'Lokale Sicherung wiederherstellen' }).click();
    await expect(restarted.getByRole('textbox')).toContainText('Local text');
    await expect(restarted.getByRole('status')).toHaveText('Ungespeichert');
    await expect(readFile(path)).rejects.toThrow();
    await restarted.screenshot({ path: 'test-results/conflict-recovery.png', fullPage: true });
  } finally {
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); }).catch(() => undefined);
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
