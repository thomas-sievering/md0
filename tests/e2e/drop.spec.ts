import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('a real file drop opens a new window without inserting text or replacing dirty work', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'md0-drop-'));
  const first = join(directory, 'first.md');
  const dropped = join(directory, 'Überlegungen mit Leerzeichen.md');
  await writeFile(first, '# Original');
  await writeFile(dropped, '# Dropped');
  const app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${join(directory, 'profile')}`, first] });
  try {
    const page = await app.firstWindow();
    const editor = page.getByRole('textbox', { name: 'Markdown bearbeiten' });
    await expect(editor).toHaveText('# Original');
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await editor.press('Control+End');
    await page.keyboard.type(' unsaved');
    await expect(page.getByRole('status')).toHaveText('Ungespeichert');
    const bounds = await editor.boundingBox();
    if (!bounds) throw new Error('Editor is not visible');
    // Chromium creates an OS-backed File with a real path, not an invented JS File.
    const cdp = await page.context().newCDPSession(page);
    async function drop(path: string) {
      const data = { items: [], files: [path], dragOperationsMask: 1 };
      const coordinates = { x: bounds!.x + 20, y: bounds!.y + 10, data };
      await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', ...coordinates });
      await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', ...coordinates });
      await cdp.send('Input.dispatchDragEvent', { type: 'drop', ...coordinates });
    }
    await drop(dropped);
    await expect.poll(() => app.windows().length).toBe(2);
    const other = app.windows().find(candidate => candidate !== page)!;
    await expect(other.getByRole('textbox', { name: 'Markdown bearbeiten' })).toHaveText('# Dropped');
    await expect(editor).toHaveText('# Original unsaved');
    expect(await readFile(first, 'utf8')).toBe('# Original');
    await page.bringToFront();
    await drop(dropped);
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.getTitle())).toBe('Überlegungen mit Leerzeichen.md');
    expect(app.windows()).toHaveLength(2);
    await page.bringToFront();
    const unsupported = join(directory, 'not-markdown.html');
    await writeFile(unsupported, '<h1>Not Markdown</h1>');
    await drop(unsupported);
    await expect(page.getByRole('alert')).toContainText('Markdown-Datei');
    await expect(editor).toHaveText('# Original unsaved');
    expect(app.windows()).toHaveLength(2);
    await page.screenshot({ path: 'test-results/drop-preserves-work.png' });
  } finally {
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); });
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
