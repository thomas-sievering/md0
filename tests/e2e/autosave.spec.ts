import { _electron as electron, expect, test } from '@playwright/test';
import { chmod, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

declare global { var autosaveConfirmations: number; }

async function launch(readOnly = false) {
  const directory = await mkdtemp(join(tmpdir(), 'md0-autosave-'));
  await mkdir(join(directory, 'documents'));
  const path = join(directory, 'documents', 'note.md');
  await writeFile(path, '\uFEFF# Original\r\nKeep  \n');
  if (readOnly) await chmod(path, 0o444);
  const app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${join(directory, 'profile')}`] });
  const page = await app.firstWindow();
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    globalThis.autosaveConfirmations = 0;
    dialog.showMessageBox = async () => {
      globalThis.autosaveConfirmations++;
      return { response: 0, checkboxChecked: false };
    };
  }, path);
  await page.getByRole('button', { name: 'Menü', exact: true }).click();
  await page.getByRole('button', { name: 'Datei öffnen' }).click();
  const editor = page.getByRole('textbox', { name: 'Markdown bearbeiten' });
  await expect(editor).toContainText('# Original');
  async function type(text: string) {
    await editor.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(text);
    await expect(page.getByRole('status')).toHaveText('Ungespeichert');
  }
  async function tick(milliseconds: number) {
    await page.clock.runFor(milliseconds);
    await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'true');
  }
  async function cleanup() {
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); });
    await app.close();
    await chmod(path, 0o666).catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  }
  return { app, page, editor, path, directory, type, tick, cleanup };
}

test('the document API serializes a save with an immediately queued new-window open', async () => {
  const { page, path, directory, type, app, cleanup } = await launch();
  const second = join(directory, 'second.md');
  await writeFile(second, '# Second\n');
  try {
    await type('Queued save');
    await app.evaluate(({ dialog }, target) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
    }, second);
    // Secondary document-API seam: queue open before the asynchronous disk save
    // completes. Timer/UI lifecycle is exercised separately through real controls.
    const [saved, opened] = await page.evaluate(async () => {
      const saving = window.documentApi.save();
      const opening = window.documentApi.open();
      return Promise.all([saving, opening]);
    });
    expect(saved).toMatchObject({ path, dirty: false, error: null });
    expect(opened).toMatchObject({ path, dirty: false });
    await expect.poll(() => app.windows().length).toBe(2);
    const other = app.windows().find(candidate => candidate !== page)!;
    await expect(other.getByRole('textbox')).toContainText('# Second');
    expect(await readFile(path, 'utf8')).toBe('\uFEFF# Original\r\nKeep  \nQueued save');
    expect(await readFile(second, 'utf8')).toBe('# Second\n');
  } finally { await cleanup(); }
});

test('opening another file retains the original autosave timer and isolates both windows', async () => {
  const { page, path, directory, type, tick, app, cleanup } = await launch();
  const second = join(directory, 'second.md');
  await writeFile(second, '# Second\n');
  try {
    await type('Old local');
    await app.evaluate(({ dialog }, target) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    }, second);
    await page.keyboard.press('Control+o');
    await expect.poll(() => app.windows().length).toBe(2);
    const other = app.windows().find(candidate => candidate !== page)!;
    await expect(other.getByRole('textbox')).toContainText('# Second');
    await expect(page.getByRole('textbox')).toContainText('Old local');
    await tick(1500);
    await expect(page.getByRole('status')).toHaveText('Gespeichert');
    expect(await readFile(path, 'utf8')).toBe('\uFEFF# Original\r\nKeep  \nOld local');
    expect(await readFile(second, 'utf8')).toBe('# Second\n');
    await other.clock.install();
    await other.clock.pauseAt(new Date());
    await other.getByRole('textbox').press('Control+End');
    await other.keyboard.type('New local');
    await other.clock.runFor(1500);
    await expect(other.getByRole('status')).toHaveText('Gespeichert');
    expect(await readFile(second, 'utf8')).toBe('# Second\nNew local');
    expect(await readFile(path, 'utf8')).toBe('\uFEFF# Original\r\nKeep  \nOld local');
  } finally { await cleanup(); }
});

test('a canceled close preserves pending edits and lets autosave finish', async () => {
  const { page, path, type, tick, app, cleanup } = await launch();
  try {
    await type('Pending');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
    await expect.poll(() => app.evaluate(() => globalThis.autosaveConfirmations)).toBe(1);
    await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'true');
    await expect(page.getByRole('status')).toHaveText('Ungespeichert');
    expect(app.windows()).toHaveLength(1);
    expect(await readFile(path, 'utf8')).toBe('\uFEFF# Original\r\nKeep  \n');
    await tick(1500);
    await expect(page.getByRole('status')).toHaveText('Gespeichert');
    expect(await readFile(path, 'utf8')).toBe('\uFEFF# Original\r\nKeep  \nPending');
  } finally { await cleanup(); }
});

test('Windows read-only autosave failure keeps both versions and explains how to retry', async () => {
  test.skip(process.platform !== 'win32', 'Windows replacement permissions');
  const { page, path, editor, type, tick, cleanup } = await launch(true);
  try {
    await type('Local');
    await tick(1500);
    await expect(page.getByRole('alert')).toContainText('Speichern fehlgeschlagen');
    await expect(page.getByRole('alert')).toContainText('Mit Strg+S');
    await expect(page.getByRole('status')).toHaveText('Ungespeichert');
    await expect(editor).toContainText('Local');
    await tick(5000);
    expect(await readFile(path, 'utf8')).toBe('\uFEFF# Original\r\nKeep  \n');
  } finally { await cleanup(); }
});

test('an access error retains edits and pauses automatic retries, including after more typing', async () => {
  const { page, path, directory, type, tick, cleanup } = await launch();
  const documents = join(directory, 'documents');
  const unavailable = join(directory, 'unavailable');
  try {
    await tick(900);
    await type('Local');
    await tick(1100);
    await rename(documents, unavailable);
    await tick(400);
    await expect(page.getByRole('alert')).toContainText('Speichern fehlgeschlagen');
    await expect(page.getByRole('status')).toHaveText('Ungespeichert');
    await rename(unavailable, documents);
    await type(' retained');
    await tick(10_000);
    expect(await readFile(path, 'utf8')).toBe('\uFEFF# Original\r\nKeep  \n');
    await expect(page.getByRole('alert')).toContainText('Speichern fehlgeschlagen');
    await page.keyboard.press('Control+s');
    await expect(page.getByRole('status')).toHaveText('Gespeichert');
    await expect(page.getByRole('alert')).toBeHidden();
    expect(await readFile(path, 'utf8')).toBe('\uFEFF# Original\r\nKeep  \nLocal retained');
  } finally { await cleanup(); }
});

test('autosave detects an external write after the last poll and pauses until conflict resolution', async () => {
  const { page, path, directory, editor, type, tick, app, cleanup } = await launch();
  try {
    await tick(900);
    await type('Local');
    await tick(1100); // Poll at 2000; autosave is due at 2400, before the next poll.
    await expect(page.locator('#conflict')).toBeHidden();
    await writeFile(path, '# Agent\n');
    await tick(400);
    await expect(page.locator('#conflict')).toBeVisible();
    await expect(editor).toContainText('Local');
    expect(await readFile(path, 'utf8')).toBe('# Agent\n');
    await tick(10_000);
    expect(await readFile(path, 'utf8')).toBe('# Agent\n');
    const copy = join(directory, 'copy.md');
    await app.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }); }, copy);
    await page.getByRole('button', { name: 'Meine Version als Kopie speichern' }).click();
    await expect(page.locator('#notice')).toContainText('als Kopie gespeichert');
    expect(await readFile(copy, 'utf8')).toBe('\uFEFF# Original\r\nKeep  \nLocal');
    await page.getByRole('button', { name: 'Dateiversion laden', exact: true }).click();
    await expect(editor).toContainText('# Agent');
    await type('Resolved');
    await tick(1500);
    await expect(page.getByRole('status')).toHaveText('Gespeichert');
    expect(await readFile(path, 'utf8')).toBe('# Agent\nResolved');
  } finally { await cleanup(); }
});

test('canceling backup restoration retains the pending autosave', async () => {
  const { page, path, editor, type, tick, app, cleanup } = await launch();
  try {
    await type('Protected local');
    await writeFile(path, '# Agent\n');
    await tick(1000);
    await expect(page.locator('#conflict')).toBeVisible();
    await page.getByRole('button', { name: 'Dateiversion laden', exact: true }).click();
    await expect(editor).toContainText('# Agent');
    await type('Pending edit');
    await page.getByRole('button', { name: 'Menü', exact: true }).click();
    await page.getByRole('button', { name: 'Lokale Sicherung wiederherstellen' }).click();
    await expect.poll(() => app.evaluate(() => globalThis.autosaveConfirmations)).toBe(1);
    await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'true');
    await expect(editor).toContainText('Pending edit');
    await tick(1500);
    await expect(page.getByRole('status')).toHaveText('Gespeichert');
    expect(await readFile(path, 'utf8')).toBe('# Agent\nPending edit');
  } finally { await cleanup(); }
});

test('restoring a backup cancels the previous edit deadline without overwriting the disk version', async () => {
  const { page, path, editor, type, tick, app, cleanup } = await launch();
  try {
    await type('Protected local');
    await writeFile(path, '# Agent\n');
    await tick(1000);
    await expect(page.locator('#conflict')).toBeVisible();
    await page.getByRole('button', { name: 'Dateiversion laden', exact: true }).click();
    await expect(editor).toContainText('# Agent');
    await type('Pending edit');
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); });
    await page.getByRole('button', { name: 'Menü', exact: true }).click();
    await page.getByRole('button', { name: 'Lokale Sicherung wiederherstellen' }).click();
    await expect(editor).toContainText('Protected local');
    await expect(page.getByRole('status')).toHaveText('Ungespeichert');
    await tick(5000);
    expect(await readFile(path, 'utf8')).toBe('# Agent\n');
    await expect(page.getByRole('status')).toHaveText('Ungespeichert');
    await type(' edited');
    await tick(1500);
    await expect(page.getByRole('status')).toHaveText('Gespeichert');
    expect(await readFile(path, 'utf8')).toBe('\uFEFF# Original\r\nKeep  \nProtected local edited');
  } finally { await cleanup(); }
});

test('autosave waits for a typing pause, coalesces edits and preserves exact source bytes', async () => {
  const context = await launch();
  const { page, path, type, tick, cleanup } = context;
  try {
    await type('First');
    await tick(1000);
    expect(await readFile(path, 'utf8')).toBe('\uFEFF# Original\r\nKeep  \n');
    await type(' second');
    await tick(1499);
    expect(await readFile(path, 'utf8')).toBe('\uFEFF# Original\r\nKeep  \n');
    await tick(1);
    await expect(page.getByRole('status')).toHaveText('Gespeichert');
    expect(await readFile(path, 'utf8')).toBe('\uFEFF# Original\r\nKeep  \nFirst second');
    await page.screenshot({ path: 'test-results/autosave-saved.png', fullPage: true });
  } finally { await cleanup(); }
});
