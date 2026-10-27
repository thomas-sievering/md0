import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { DocumentSession } from '../src/main/document';

const directories: string[] = [];
async function fixture(text: string) {
  const directory = await mkdtemp(join(tmpdir(), 'md0-document-'));
  directories.push(directory);
  const path = join(directory, 'note.md');
  await writeFile(path, text);
  return { directory, path };
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

test('open, edit and consciously save a real Markdown file', async () => {
  const { path } = await fixture('# Original\n');
  const document = new DocumentSession();
  await document.open(path);
  expect(document.state()).toMatchObject({ path, text: '# Original\n', dirty: false });
  document.edit('# Edited\n');
  expect(await readFile(path, 'utf8')).toBe('# Original\n');
  await document.save();
  expect(document.state()).toMatchObject({ text: '# Edited\n', dirty: false, error: null });
  expect(await readFile(path, 'utf8')).toBe('# Edited\n');
});

test('a small edit preserves BOM, frontmatter, whitespace and mixed line endings byte-for-byte', async () => {
  const { path } = await fixture('\uFEFF---\r\nname: keep\n---\r\n# Before\r\ntrailing  \n');
  const document = new DocumentSession();
  await document.open(path);
  document.edit('\uFEFF---\r\nname: keep\n---\r\n# After\r\ntrailing  \n');
  await document.save();
  expect(await readFile(path)).toEqual(Buffer.from('\uFEFF---\r\nname: keep\n---\r\n# After\r\ntrailing  \n'));
});

test('a clean save still checks the loaded disk version', async () => {
  const { path } = await fixture('# Original\n');
  const document = new DocumentSession();
  await document.open(path);
  await writeFile(path, '# External\n');
  await document.save();
  expect(document.state().error).toContain('Konflikt');
  expect(await readFile(path, 'utf8')).toBe('# External\n');
});

test.skipIf(process.platform !== 'win32')('Windows refuses replacing a read-only file without losing either version', async () => {
  const { path } = await fixture('# Original\n');
  const document = new DocumentSession();
  await document.open(path);
  await chmod(path, 0o444);
  // Open again because changing attributes is itself an external disk change.
  await document.open(path);
  document.edit('# Local\n');
  try {
    await document.save();
    expect(document.state()).toMatchObject({ text: '# Local\n', dirty: true });
    expect(document.state().error).toContain('Speichern fehlgeschlagen');
    expect(await readFile(path, 'utf8')).toBe('# Original\n');
  } finally {
    await chmod(path, 0o666);
  }
  await document.open(path, async () => true);
  document.edit('# Retried\n');
  await document.save();
  expect(await readFile(path, 'utf8')).toBe('# Retried\n');
});

test('missing files stay visible as errors; retry never overwrites a replacement', async () => {
  const { path, directory } = await fixture('# Original\n');
  const document = new DocumentSession();
  await document.open(path);
  document.edit('# Unsaved\n');
  await rm(directory, { recursive: true });
  await document.save();
  expect(document.state()).toMatchObject({ text: '# Unsaved\n', dirty: true });
  expect(document.state().error).toContain('Speichern fehlgeschlagen');
  await mkdir(directory);
  await writeFile(path, '# Replacement\n');
  await document.save();
  expect(await readFile(path, 'utf8')).toBe('# Replacement\n');
  expect(document.state().dirty).toBe(true);
});

test('failed opens keep the current document and expose an error', async () => {
  const { path, directory } = await fixture('# Original\n');
  const document = new DocumentSession();
  await document.open(path);
  document.edit('# Unsaved\n');
  await document.open(join(directory, 'missing.md'), async () => true);
  expect(document.state()).toMatchObject({ path, text: '# Unsaved\n', dirty: true });
  expect(document.state().error).toContain('Öffnen fehlgeschlagen');
});

test('switching documents requires explicit discard and cancellation preserves edits', async () => {
  const first = await fixture('# First\n');
  const second = await fixture('# Second\n');
  const document = new DocumentSession();
  await document.open(first.path);
  document.edit('# Local\n');
  await document.open(second.path, async () => false);
  expect(document.state()).toMatchObject({ path: first.path, text: '# Local\n', dirty: true });
  await document.open(second.path, async () => true);
  expect(document.state()).toMatchObject({ path: second.path, text: '# Second\n', dirty: false });
});

test('refresh follows external replacements when clean and retains local edits on conflict', async () => {
  const { path, directory } = await fixture('# Original\n');
  const document = new DocumentSession();
  await document.open(path);
  await writeFile(join(directory, 'replacement.md'), '# Agent\n');
  const { rename } = await import('node:fs/promises');
  await rename(join(directory, 'replacement.md'), path);
  expect(await document.refresh()).toMatchObject({ text: '# Agent\n', dirty: false, conflict: false });
  document.edit('# Local\n');
  await writeFile(path, '# Agent again\n');
  expect(await document.refresh()).toMatchObject({ text: '# Local\n', dirty: true, conflict: true });
  await rm(path);
  expect(await document.refresh()).toMatchObject({ text: '# Local\n', conflict: true });
  expect(document.state().error).toBeTruthy();
  await document.save();
  await expect(readFile(path)).rejects.toThrow();
});

test('loading the latest disk version durably protects local text and offers recovery after restart', async () => {
  const { path, directory } = await fixture('\uFEFF# Original\r\n');
  const backups = join(directory, 'recovery');
  const document = new DocumentSession(backups);
  await document.open(path);
  document.edit('\uFEFF# Local\r\n');
  await writeFile(path, '# Agent\n');
  await document.refresh();
  await writeFile(path, '# Newer agent\n');
  expect(await document.loadDiskVersion()).toMatchObject({ text: '# Newer agent\n', dirty: false, conflict: false, recoveryAvailable: true });
  const restarted = new DocumentSession(backups);
  await restarted.open(path);
  expect(restarted.state().recoveryAvailable).toBe(true);
  expect(await restarted.restoreBackup()).toMatchObject({ text: '\uFEFF# Local\r\n', dirty: true });
  expect(await readFile(path, 'utf8')).toBe('# Newer agent\n');
});

test('conflict copies never overwrite an existing target and cancellation retains the conflict', async () => {
  const { path, directory } = await fixture('# Original\n');
  const document = new DocumentSession(join(directory, 'recovery'));
  await document.open(path);
  document.edit('\uFEFF# Local\r\n');
  await writeFile(path, '# Agent\n');
  await document.refresh();
  expect(await document.saveCopy(null)).toMatchObject({ conflict: true, text: '\uFEFF# Local\r\n' });
  await document.saveCopy(path);
  expect(document.state().error).toBeTruthy();
  expect(await readFile(path, 'utf8')).toBe('# Agent\n');
  const copy = join(directory, 'Meine Kopie ä.md');
  expect(await document.saveCopy(copy)).toMatchObject({ conflict: true, dirty: true, error: null });
  expect(await readFile(copy, 'utf8')).toBe('\uFEFF# Local\r\n');
  await document.saveCopy(join(directory, 'missing', 'copy.md'));
  expect(document.state()).toMatchObject({ text: '\uFEFF# Local\r\n', dirty: true, conflict: true });
  expect(document.state().error).toContain('Kopie speichern fehlgeschlagen');
});

test('backup failure prevents destructive reload and recovery never crosses documents', async () => {
  const { path, directory } = await fixture('# Original\n');
  const blocked = join(directory, 'not-a-directory');
  await writeFile(blocked, 'blocked');
  const document = new DocumentSession(blocked);
  await document.open(path);
  document.edit('# Local\n');
  await writeFile(path, '# Agent\n');
  await document.refresh();
  expect(await document.loadDiskVersion()).toMatchObject({ text: '# Local\n', dirty: true, conflict: true, recoveryAvailable: false });
  expect(document.state().error).toContain('Dateiversion laden fehlgeschlagen');
  const other = await fixture('# Other\n');
  await document.open(other.path, async () => true);
  expect(document.state().recoveryAvailable).toBe(false);
});

test.each(['missing', 'invalid UTF-8'])('restart recovery works without opening a %s original', async condition => {
  const { path, directory } = await fixture('# Original\n');
  const backups = join(directory, 'recovery');
  const document = new DocumentSession(backups);
  await document.open(path);
  document.edit('# Protected local\n');
  await writeFile(path, '# Agent\n');
  await document.loadDiskVersion();
  if (condition === 'missing') await rm(path);
  else await writeFile(path, Buffer.from([0xff, 0xfe]));
  const restarted = new DocumentSession(backups);
  expect(await restarted.recoveryState()).toMatchObject({ path: null, recoveryAvailable: true });
  expect(await restarted.restoreBackup()).toMatchObject({ path, text: '# Protected local\n', dirty: true, conflict: true });
  await restarted.save();
  if (condition === 'missing') await expect(readFile(path)).rejects.toThrow();
  else expect(await readFile(path)).toEqual(Buffer.from([0xff, 0xfe]));
});

test('copy saving refuses the deleted original pathname, including platform aliases', async () => {
  const { path } = await fixture('# Original\n');
  const document = new DocumentSession();
  await document.open(path);
  document.edit('# Local\n');
  await rm(path);
  const target = process.platform === 'win32' ? path.toUpperCase() : path;
  expect(await document.saveCopy(target)).toMatchObject({ text: '# Local\n', dirty: true });
  expect(document.state().error).toContain('Original');
  await expect(readFile(path)).rejects.toThrow();
});

test('refuses detected external changes and retains both versions', async () => {
  const { path } = await fixture('# Original\n');
  const document = new DocumentSession();
  await document.open(path);
  document.edit('# Local\n');
  await writeFile(path, '# Agent\n');
  await document.save();
  expect(document.state()).toMatchObject({ text: '# Local\n', dirty: true });
  expect(document.state().error).toContain('Konflikt');
  expect(await readFile(path, 'utf8')).toBe('# Agent\n');
});
