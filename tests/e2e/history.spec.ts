import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('undo and redo preserve the actual deleted line endings, including grouped edits', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'md0-history-'));
  const path = join(directory, 'mixed.md');
  await writeFile(path, 'A\r\nB\nC\rD\n');
  const app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${join(directory, 'profile')}`] });
  try {
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, path);
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'Menü', exact: true }).click();
    await page.getByRole('button', { name: 'Datei öffnen' }).click();
    const editor = page.getByRole('textbox', { name: 'Markdown bearbeiten' });
    await expect(editor).toContainText('C');
    await editor.click();
    await page.keyboard.press('Control+Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Home');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+s');
    await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'true');
    expect(await readFile(path, 'utf8')).toBe('A\r\nB\nC\rD\n');

    await page.keyboard.press('Control+y');
    await page.keyboard.press('Control+s');
    await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'true');
    expect(await readFile(path, 'utf8')).toBe('A\r\nBC\rD\n');
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+s');
    await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'true');
    expect(await readFile(path, 'utf8')).toBe('A\r\nB\nC\rD\n');

    // Delete a range containing both LF and lone CR, then undo several grouped
    // Backspaces. Original separators must survive each grouped history event.
    await page.keyboard.press('Control+Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+s');
    await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'true');
    expect(await readFile(path, 'utf8')).toBe('A\r\nB\nC\rD\n');
  } finally {
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    });
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
