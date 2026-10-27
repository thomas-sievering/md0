import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('start typing immediately, restore unsaved thoughts, save deliberately, then start blank', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'md0-draft-ui-'));
  const target = join(directory, 'thoughts.md');
  const existing = join(directory, 'existing.md');
  await writeFile(existing, '# Keep\n');
  const args = [resolve('.'), `--user-data-dir=${join(directory, 'profile')}`];
  let app = await electron.launch({ args });
  try {
    let page = await app.firstWindow();
    let editor = page.getByRole('textbox', { name: 'Markdown bearbeiten' });
    await expect(editor).toBeFocused();
    await expect(editor).toHaveText('');
    await expect(page.getByText('Über das Menü eine Markdown-Datei öffnen.')).toHaveCount(0);
    await page.keyboard.type('# Instant thoughts');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Keep this');
    await expect(page.getByRole('status')).toHaveText('Lokal gesichert');
    await app.close();

    app = await electron.launch({ args });
    page = await app.firstWindow();
    editor = page.getByRole('textbox', { name: 'Markdown bearbeiten' });
    await expect(editor).toContainText('Keep this');
    await expect(editor).toBeFocused();
    await expect(page.getByRole('status')).toHaveText('Lokal gesichert');
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    // An unnamed draft stays local indefinitely: no automatic picker/file creation.
    await page.clock.runFor(10_000);
    await expect(page.getByRole('status')).toHaveText('Lokal gesichert');
    await expect(readFile(target)).rejects.toThrow();
    await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: true, filePath: '' }); });
    await page.keyboard.press('Control+s');
    await expect(page.locator('#save')).toBeEnabled();
    await expect(editor).toContainText('Keep this');
    await expect(page.locator('#file-label')).toHaveText('Unbenannter Entwurf');
    await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); }, existing);
    await page.keyboard.press('Control+s');
    await expect(page.getByRole('alert')).toContainText('Speichern fehlgeschlagen');
    expect(await readFile(existing, 'utf8')).toBe('# Keep\n');
    await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); }, target);
    await page.keyboard.press('Control+s');
    await expect(page.getByRole('status')).toHaveText('Gespeichert');
    expect(await readFile(target, 'utf8')).toBe('# Instant thoughts\nKeep this');
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' named');
    await page.clock.runFor(1500);
    await expect(page.getByRole('status')).toHaveText('Gespeichert');
    expect(await readFile(target, 'utf8')).toBe('# Instant thoughts\nKeep this named');
    await app.close();

    app = await electron.launch({ args });
    page = await app.firstWindow();
    editor = page.getByRole('textbox', { name: 'Markdown bearbeiten' });
    await expect(editor).toBeFocused();
    await expect(editor).toHaveText('');
    await expect(page.locator('#file-label')).toHaveText('Unbenannter Entwurf');
    await page.screenshot({ path: 'test-results/startup-blank.png', fullPage: true });
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await page.keyboard.type('Another thought');
    await expect(page.getByRole('status')).toHaveText('Lokal gesichert');
    await page.clock.runFor(600); // Separate typing and deletion history groups.
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await expect(editor).toHaveText('');
    await page.getByRole('button', { name: 'Menü', exact: true }).click();
    await page.getByRole('button', { name: 'Neues Dokument' }).click();
    await expect(editor).toHaveText('');
    await expect(editor).toBeFocused();
    await page.keyboard.press('Control+z');
    await expect(editor).toHaveText('');
    await page.keyboard.type('Shortcut draft');
    await expect(page.getByRole('status')).toHaveText('Lokal gesichert');
    await page.keyboard.press('Control+n');
    await expect(editor).toHaveText('');
    await expect(editor).toBeFocused();
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('local backup failure stays visible and blocks close until thoughts are protected', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'md0-draft-failure-'));
  const profile = join(directory, 'profile');
  const blocked = join(profile, 'drafts');
  await mkdir(profile);
  await writeFile(blocked, 'blocked');
  const app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${profile}`] });
  try {
    const page = await app.firstWindow();
    const editor = page.getByRole('textbox', { name: 'Markdown bearbeiten' });
    await expect(editor).toBeFocused();
    await page.keyboard.type('Do not lose this');
    await expect(page.getByRole('alert')).toContainText('Lokale Entwurfssicherung fehlgeschlagen');
    await expect(page.getByRole('status')).toHaveText('Ungespeichert');
    await page.exposeFunction('closeNativeWindow', () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close()));
    await page.evaluate(() => new Promise<void>(resolve => {
      const content = document.querySelector('.cm-content')!;
      const observer = new MutationObserver(records => {
        if (records.some(record => record.oldValue === 'false') && content.getAttribute('contenteditable') === 'true') {
          observer.disconnect();
          resolve();
        }
      });
      observer.observe(content, { attributes: true, attributeFilter: ['contenteditable'], attributeOldValue: true });
      void Reflect.get(window, 'closeNativeWindow')();
    }));
    await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'true');
    await expect(editor).toContainText('Do not lose this');
    expect(app.windows()).toHaveLength(1);
    await rm(blocked);
    await page.keyboard.type('!');
    await expect(page.getByRole('status')).toHaveText('Lokal gesichert');
    await expect(page.getByRole('alert')).toBeHidden();
  } finally {
    await rm(blocked, { force: true, recursive: true });
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
