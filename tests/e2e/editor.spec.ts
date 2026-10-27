import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('menu opens a real file, source editing preserves mixed endings and saves deliberately', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'md0-electron-'));
  const path = join(directory, 'note.md');
  await writeFile(path, '\uFEFF---\r\nname: unchanged\r\n---\n\n# Original\r\n\n```ts\nconst n = 1;\r\n```\n');
  const app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${join(directory, 'profile')}`] });
  try {
    // Native OS picker is the only substituted boundary; all app/file behavior is real.
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    }, path);
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'Menü', exact: true }).click();
    await page.getByRole('button', { name: 'Datei öffnen' }).click();
    const editor = page.getByRole('textbox', { name: 'Markdown bearbeiten' });
    await expect(editor).toContainText('# Original');
    await editor.click();
    await page.keyboard.press('Control+Home');
    for (let line = 0; line < 4; line++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+Home');
    await page.keyboard.type('# Edited');
    await page.keyboard.press('Control+End');
    await page.keyboard.type('Additional text');
    await expect(page.getByRole('status')).toContainText('Ungespeichert');
    expect(await readFile(path, 'utf8')).not.toContain('Additional text');
    await page.keyboard.press('Control+s');
    await expect(page.getByRole('status')).toContainText('Gespeichert');
    expect(await readFile(path, 'utf8')).toBe('\uFEFF---\r\nname: unchanged\r\n---\n\n# Edited\r\n\n```ts\nconst n = 1;\r\n```\nAdditional text');
    await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'true');
    expect(await page.evaluate(() => typeof Reflect.get(window, 'require'))).toBe('undefined');
    await page.screenshot({ path: 'test-results/editor-light.png', fullPage: true });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({ path: 'test-results/editor-dark.png', fullPage: true });
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
