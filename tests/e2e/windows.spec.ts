import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const editorName = { name: 'Markdown bearbeiten' };

async function invoke(args: string[], path: string) {
  const { spawn } = await import('node:child_process');
  const executable = (await import('electron')).default as unknown as string;
  const child = spawn(executable, [...args, path], { stdio: 'ignore' });
  await new Promise<void>((done, reject) => {
    child.on('error', reject);
    child.on('exit', code => code === 0 ? done() : reject(new Error(`Second invocation: ${code}`)));
  });
}

test('a startup path and a second OS invocation open separate windows and focus an existing file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'md0-windows-'));
  const first = join(directory, 'Grüße eins.md');
  const second = join(directory, 'zweite Datei.md');
  await writeFile(first, '# First');
  await writeFile(second, '# Second');
  const args = [resolve('.'), `--user-data-dir=${join(directory, 'profile')}`];
  const app = await electron.launch({ args: [...args, first] });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('textbox', editorName)).toContainText('# First');
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' local');
    await invoke(args, second);
    await expect.poll(() => app.windows().length).toBe(2);
    const other = app.windows().find(candidate => candidate !== page)!;
    await expect(other.getByRole('textbox', editorName)).toContainText('# Second');
    await expect(page.getByRole('textbox', editorName)).toContainText('# First local');
    await page.bringToFront();
    await other.bringToFront();
    await invoke(args, process.platform === 'win32' ? first.replace('eins.md', 'EINS.MD') : first);
    await expect.poll(() => app.windows().length).toBe(2);
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.getTitle())).toContain('Grüße eins.md');
    await page.keyboard.press('Control+n');
    await expect.poll(() => app.windows().length).toBe(3);
    const draft = app.windows().find(candidate => candidate !== page && candidate !== other)!;
    await expect(draft.getByRole('textbox', editorName)).toBeFocused();
    await expect(draft.getByRole('textbox', editorName)).toHaveText('');
    await expect(page.getByRole('textbox', editorName)).toContainText('# First local');
  } finally {
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); });
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('file-path startup also shows draft recovery warnings instead of hiding them', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'md0-startup-warning-'));
  const profile = join(directory, 'profile');
  const drafts = join(profile, 'drafts');
  await mkdir(drafts, { recursive: true });
  const damaged = join(drafts, '00000000-0000-4000-8000-000000000000.json');
  await writeFile(damaged, 'invalid recovery record');
  const path = join(directory, 'valid.md');
  await writeFile(path, '# Valid');
  const app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${profile}`, path] });
  try {
    await expect.poll(() => app.windows().length).toBe(2);
    const warning = await app.firstWindow();
    await expect(warning.getByRole('alert')).toContainText('Entwurf wiederherstellen fehlgeschlagen');
    const opened = app.windows().find(candidate => candidate !== warning)!;
    await expect(opened.getByRole('textbox', editorName)).toHaveText('# Valid');
    await expect(warning.getByRole('textbox', editorName)).toHaveText('');
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('a failed OS open reports its error in the existing draft without losing thoughts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'md0-os-error-'));
  const args = [resolve('.'), `--user-data-dir=${join(directory, 'profile')}`];
  const app = await electron.launch({ args });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('textbox', editorName)).toBeFocused();
    await page.keyboard.type('Keep these thoughts');
    await expect(page.getByRole('status')).toHaveText('Lokal gesichert');
    await invoke(args, join(directory, 'missing.md'));
    await expect(page.getByRole('alert')).toContainText('Öffnen fehlgeschlagen');
    await expect(page.getByRole('textbox', editorName)).toHaveText('Keep these thoughts');
    expect(app.windows()).toHaveLength(1);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
