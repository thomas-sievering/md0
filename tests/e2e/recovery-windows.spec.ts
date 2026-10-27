import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('backup recovery cannot attach a second editor to a file already open in another window', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'md0-recovery-windows-'));
  const path = join(directory, 'original.md');
  await writeFile(path, '# Original');
  const app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${join(directory, 'profile')}`, path] });
  try {
    const page = await app.firstWindow();
    const editor = page.getByRole('textbox', { name: 'Markdown bearbeiten' });
    await expect(editor).toHaveText('# Original');
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await editor.press('Control+End');
    await page.keyboard.type(' local backup');
    await writeFile(path, '# Agent');
    await page.clock.runFor(1000);
    await page.getByRole('button', { name: 'Dateiversion laden', exact: true }).click();
    await expect(editor).toHaveText('# Agent');
    await page.keyboard.press('Control+n');
    await expect.poll(() => app.windows().length).toBe(2);
    const draft = app.windows().find(candidate => candidate !== page)!;
    await draft.getByRole('button', { name: 'Menü', exact: true }).click();
    await draft.getByRole('button', { name: 'Lokale Sicherung wiederherstellen' }).click();
    await expect(draft.getByRole('alert')).toContainText('bereits geöffnet');
    await expect(draft.locator('#file-label')).toHaveText('Unbenannter Entwurf');
    await expect(editor).toHaveText('# Agent');
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.getTitle())).toBe('original.md');
    await page.getByRole('button', { name: 'Menü', exact: true }).click();
    await page.getByRole('button', { name: 'Lokale Sicherung wiederherstellen' }).click();
    await expect(editor).toHaveText('# Original local backup');
    await expect(page.getByRole('status')).toHaveText('Ungespeichert');
  } finally {
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); });
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
