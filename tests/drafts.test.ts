import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { DocumentSession } from '../src/main/document';

const directories: string[] = [];
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'md0-drafts-'));
  directories.push(directory);
  const drafts = join(directory, 'drafts');
  const session = () => new DocumentSession(join(directory, 'conflict-recovery'), drafts);
  return { directory, drafts, session };
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

test('saving an unnamed draft is cancelable, refuses existing files, and retires only its own recovery record', async () => {
  const { directory, session } = await fixture();
  const document = session();
  await document.startup();
  document.edit('# Thoughts\r\n');
  await document.persistDraft();
  expect(await document.saveDraft(null)).toMatchObject({ path: null, text: '# Thoughts\r\n', dirty: true });
  const existing = join(directory, 'existing.md');
  await writeFile(existing, '# Keep\n');
  expect(await document.saveDraft(existing)).toMatchObject({ path: null, dirty: true });
  expect(document.state().error).toContain('Speichern fehlgeschlagen');
  expect(await readFile(existing, 'utf8')).toBe('# Keep\n');
  const target = join(directory, 'thoughts.md');
  expect(await document.saveDraft(target)).toMatchObject({ path: target, dirty: false, error: null });
  expect(await readFile(target, 'utf8')).toBe('# Thoughts\r\n');
  expect(await session().startup()).toMatchObject({ path: null, text: '', dirty: false });
  document.edit('# Named autosave\r\n');
  await document.save();
  expect(await readFile(target, 'utf8')).toBe('# Named autosave\r\n');
});

test('new documents park independent drafts and saving the latest never deletes an earlier draft', async () => {
  const { directory, session } = await fixture();
  const document = session();
  await document.startup();
  document.edit('# First draft');
  await document.persistDraft();
  expect(await document.newDocument()).toMatchObject({ path: null, text: '', dirty: false });
  document.edit('# Second draft');
  await document.persistDraft();
  const restarted = session();
  expect(await restarted.startup()).toMatchObject({ text: '# Second draft' });
  await restarted.saveDraft(join(directory, 'second.md'));
  expect(await session().startup()).toMatchObject({ text: '# First draft', dirty: true });
});

test('draft storage errors retain text, block leaving, and allow an explicit retry', async () => {
  const { drafts, session } = await fixture();
  await writeFile(drafts, 'blocked');
  const document = session();
  document.edit('# Still here');
  expect(await document.persistDraft()).toMatchObject({ text: '# Still here', dirty: true, draftSaved: false });
  expect(document.state().error).toContain('Lokale Entwurfssicherung fehlgeschlagen');
  expect(await document.canLeave(async () => true)).toBe(false);
  expect(await document.newDocument(async () => true)).toMatchObject({ text: '# Still here' });
  await rm(drafts);
  expect(await document.persistDraft()).toMatchObject({ draftSaved: true, error: null });
  expect(await document.canLeave()).toBe(true);
  expect(await session().startup()).toMatchObject({ text: '# Still here' });
});

test('a draft can be saved as a file when its local backup directory is unavailable', async () => {
  const { directory, drafts, session } = await fixture();
  await writeFile(drafts, 'blocked');
  const document = session();
  document.edit('# Save elsewhere');
  await document.persistDraft();
  const target = join(directory, 'elsewhere.md');
  expect(await document.saveDraft(target)).toMatchObject({ path: target, dirty: false, error: null });
  expect(await readFile(target, 'utf8')).toBe('# Save elsewhere');
});

test('a corrupt older record is reported but does not hide the latest valid unsaved thoughts', async () => {
  const { drafts, session } = await fixture();
  const document = session();
  document.edit('# Older');
  await document.persistDraft();
  const [older] = await readdir(drafts);
  await document.newDocument();
  document.edit('# Latest valid thoughts');
  await document.persistDraft();
  await writeFile(join(drafts, older!), 'broken older JSON');
  const restarted = session();
  expect(await restarted.startup()).toMatchObject({ text: '# Latest valid thoughts', draftSaved: true });
  expect(restarted.state().error).toContain('Entwurf wiederherstellen fehlgeschlagen');
  expect(await readFile(join(drafts, older!), 'utf8')).toBe('broken older JSON');
});

test('failed draft file publication and failed startup recovery are visible and non-destructive', async () => {
  const { directory, drafts, session } = await fixture();
  const document = session();
  document.edit('# Protected');
  await document.persistDraft();
  expect(await document.saveDraft(join(directory, 'missing', 'note.md'))).toMatchObject({ path: null, text: '# Protected', dirty: true });
  expect(document.state().error).toContain('Speichern fehlgeschlagen');
  const [record] = await readdir(drafts);
  await writeFile(join(drafts, record!), 'broken JSON');
  const restarted = session();
  expect((await restarted.startup()).error).toContain('Entwurf wiederherstellen fehlgeschlagen');
  expect(await readFile(join(drafts, record!), 'utf8')).toBe('broken JSON');
});

test('emptying a recovered draft starts blank next time and named dirty work still needs confirmation', async () => {
  const { directory, session } = await fixture();
  const document = session();
  document.edit('# Temporary');
  await document.persistDraft();
  document.edit('');
  await document.persistDraft();
  expect(await session().startup()).toMatchObject({ text: '', dirty: false });
  const path = join(directory, 'named.md');
  await writeFile(path, '# Named');
  await document.open(path);
  document.edit('# Unsaved named');
  expect(await document.newDocument()).toMatchObject({ path, text: '# Unsaved named', dirty: true });
  expect(await document.newDocument(async () => true)).toMatchObject({ path: null, text: '', dirty: false });
});

test('opening a named file parks a draft without prompting to discard it', async () => {
  const { directory, session } = await fixture();
  const target = join(directory, 'named.md');
  await writeFile(target, '# Named');
  const document = session();
  await document.startup();
  document.edit('# Parked');
  expect(await document.open(target)).toMatchObject({ path: target, text: '# Named', dirty: false });
  expect(await session().startup()).toMatchObject({ text: '# Parked', dirty: true });
});

test('startup is an empty document and the last unnamed thoughts survive a new session', async () => {
  const { session } = await fixture();
  const document = session();
  expect(await document.startup()).toMatchObject({ path: null, text: '', dirty: false });
  document.edit('\uFEFF# Thoughts\r\nKeep  \n');
  expect(await document.persistDraft()).toMatchObject({ dirty: true, draftSaved: true, error: null });
  expect(await session().startup()).toMatchObject({ path: null, text: '\uFEFF# Thoughts\r\nKeep  \n', dirty: true, draftSaved: true });
});
