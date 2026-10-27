import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('menu open preserves a draft; recent files survive restart and missing files show an error', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'md0-recent-'));
  const path = join(directory, 'Grüße mit Leerzeichen.md');
  await writeFile(path, '# Opened');
  const args = [resolve('.'), `--user-data-dir=${join(directory, 'profile')}`];
  let app = await electron.launch({ args });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('textbox', { name: 'Markdown bearbeiten' })).toBeFocused();
    await page.keyboard.type('Keep my thoughts');
    await expect(page.getByRole('status')).toHaveText('Lokal gesichert');
    await app.evaluate(({ dialog }, filePath) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] }); }, path);
    await page.keyboard.press('Control+o');
    await expect.poll(() => app.windows().length).toBe(2);
    const other = app.windows().find(candidate => candidate !== page)!;
    await expect(other.getByRole('textbox', { name: 'Markdown bearbeiten' })).toHaveText('# Opened');
    await expect(page.getByRole('textbox', { name: 'Markdown bearbeiten' })).toHaveText('Keep my thoughts');
    await other.getByRole('button', { name: 'Menü', exact: true }).click();
    await expect(other.getByRole('button', { name: path, exact: true })).toBeVisible();
    await app.close();
    await rm(path);
    app = await electron.launch({ args });
    const restored = await app.firstWindow();
    await expect(restored.getByRole('textbox', { name: 'Markdown bearbeiten' })).toHaveText('Keep my thoughts');
    await restored.getByRole('button', { name: 'Menü', exact: true }).click();
    await restored.getByRole('button', { name: path, exact: true }).click();
    await expect(restored.getByRole('alert')).toContainText('Öffnen fehlgeschlagen');
    await expect(restored.getByRole('textbox', { name: 'Markdown bearbeiten' })).toHaveText('Keep my thoughts');
    expect(app.windows()).toHaveLength(1);
    await writeFile(path, '# Returned');
    await restored.getByRole('button', { name: 'Menü', exact: true }).click();
    await restored.getByRole('button', { name: path, exact: true }).click();
    await expect.poll(() => app.windows().length).toBe(2);
    const reopened = app.windows().find(candidate => candidate !== restored)!;
    await expect(reopened.getByRole('textbox', { name: 'Markdown bearbeiten' })).toHaveText('# Returned');
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
