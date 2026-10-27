#!/usr/bin/env node
// Run from the repository root; no production application hooks are installed.
import { _electron as electron, expect } from '@playwright/test';
import { appendFile, copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const mode = process.argv[2] ?? 'edit';
if (!['edit', 'conflicts', 'safety', 'autosave', 'drafts', 'search', 'chapters'].includes(mode)) throw new Error('Use edit, conflicts, safety, autosave, drafts, search, or chapters');
const root = resolve('.');
const evidence = resolve('test-results/verification', `${new Date().toISOString().replace(/[:.]/g, '-')}-${mode}-${process.pid}`);
await mkdir(evidence, { recursive: true });
const scratch = await mkdtemp(join(tmpdir(), 'md0-verify-'));
const profile = join(scratch, 'profile');
const file = join(scratch, 'note.md');
const original = '\uFEFF---\r\nname: unchanged\r\n---\n\n# Original\r\n\n```ts\nconst n = 1;\r\n```\n' + (mode === 'search' ? '\nOriginal original\n\n[Secure](https://example.com/page)\n\n[Plain](http://example.org/)\n\n[Unsafe](javascript:alert(1))\n\n[Local](file:///C:/secret.md)\n\n[Unknown](custom:launch)\n\n[Relative](other.md)\n\n[Anchor](#heading)\n' : mode === 'chapters' ? '\n## Detail\n\n```md\n# Hidden code\n```\n\n### Too deep\n\n' + 'Body\n\n'.repeat(120) + 'Last chapter\n============\n' : '');
const hash = createHash('sha256').update(await readFile('out/main.cjs')).digest('hex');
let app, page, tracing = false, passed = false;
console.log(`Evidence: ${evidence}`);
const log = async (action, details = {}) => appendFile(join(evidence, 'actions.jsonl'), JSON.stringify({ at: new Date().toISOString(), action, ...details }) + '\n');
const button = name => page.getByRole('button', { name, exact: true });
const editor = () => page.getByRole('textbox', { name: 'Markdown bearbeiten' });
async function capture(name) {
  await page.screenshot({ path: join(evidence, `${name}.png`), fullPage: true });
  await writeFile(join(evidence, `${name}.aria.txt`), await page.locator('body').ariaSnapshot());
}
async function doctor(label) {
  // Read-only: no app state setters, IPC commands or page mutations.
  const state = await app.evaluate(({ app, BrowserWindow }) => ({
    name: app.getName(), version: app.getVersion(), profile: app.getPath('userData'),
    pid: process.pid, url: BrowserWindow.getAllWindows()[0]?.webContents.getURL(),
  }));
  expect(state.name).toBe('md0');
  expect(state.version).toBe(JSON.parse(await readFile('package.json', 'utf8')).version);
  expect(resolve(state.profile)).toBe(resolve(profile));
  // Windows electron.cmd may launch a distinct main-process PID.
  expect(state.pid).toBeGreaterThan(0);
  expect(app.process().exitCode).toBeNull();
  expect(state.url).toBe(pathToFileURL(join(root, 'out/index.html')).href);
  await expect(button('Menü')).toBeVisible();
  await writeFile(join(evidence, `doctor-${label}.json`), JSON.stringify({ ...state, launcherPid: app.process().pid, mainBuildSha256: hash, root, scratch }, null, 2));
}
async function launch(label) {
  await log('launch', { profile });
  app = await electron.launch({ args: [root, `--user-data-dir=${profile}`], timeout: 30000 });
  page = await app.firstWindow();
  await app.context().tracing.start({ screenshots: true, snapshots: true, sources: true });
  tracing = true;
  await doctor(label);
  if (mode === 'edit' || mode === 'safety' || mode === 'chapters') {
    // Keep deliberate-save/discard journeys before the autosave deadline.
    await page.clock.install();
    await page.clock.pauseAt(new Date());
  }
  // Substitution is confined to Electron's native dialog boundary.
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  });
}
async function stop(label) {
  if (!app) return;
  if (tracing) {
    await app.context().tracing.stop({ path: join(evidence, `${label}.zip`) });
    tracing = false;
  }
  await app.close();
  app = undefined;
}
async function picker(path) {
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, path);
}
async function open(entry) {
  await picker(file);
  await log('open', { entry, file });
  if (entry === 'menu') {
    await button('Menü').click();
    await page.getByRole('button', { name: 'Datei öffnen' }).click();
  } else await page.keyboard.press('Control+o');
  await expect(editor()).toContainText('# Original');
}
async function append(text) {
  await log('type', { text });
  await editor().click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(text);
  await expect(page.getByRole('status')).toHaveText('Ungespeichert');
}
try {
  await writeFile(file, original);
  await copyFile(file, join(evidence, 'disk-before.md'));
  await launch('initial');
  if (mode !== 'drafts') await open('menu');
  await capture('opened');
  if (mode === 'search') {
    const search = page.getByRole('searchbox', { name: 'Im Dokument suchen' });
    const count = page.locator('#search-count');
    await expect(search).toBeHidden();
    await log('search-open', { entry: 'Control+f' });
    await page.keyboard.press('Control+f');
    await expect(search).toBeFocused();
    await expect(count).toHaveText('Suchbegriff eingeben');
    await search.fill('original');
    await expect(count).toHaveText('1 / 3');
    await capture('search-matches');
    await log('search-next', { entry: 'Enter' });
    await search.press('Enter');
    await expect(count).toHaveText('2 / 3');
    await log('search-previous', { entry: 'Shift+Enter' });
    await search.press('Shift+Enter');
    await expect(count).toHaveText('1 / 3');
    await log('search-previous', { entry: 'button' });
    await button('Vorheriger Treffer').click();
    await expect(count).toHaveText('3 / 3');
    await log('search-next', { entry: 'button' });
    await button('Nächster Treffer').click();
    await expect(count).toHaveText('1 / 3');
    await search.fill('no such text');
    await expect(count).toHaveText('Keine Treffer');
    await capture('search-no-matches');
    await log('search-close', { entry: 'Escape' });
    await search.press('Escape');
    await expect(search).toBeHidden();
    await expect(editor()).toBeFocused();
    expect(await readFile(file, 'utf8')).toBe(original);
    await log('search-open', { entry: 'menu' });
    await button('Menü').click();
    await page.getByRole('button', { name: /^Im Dokument suchen/ }).click();
    await expect(search).toBeFocused();
    await search.fill('original');
    await log('search-close', { entry: 'button' });
    await button('Suche schließen').click();
    await expect(search).toBeHidden();
    await expect(editor()).toBeFocused();
    await app.evaluate(({ shell }) => {
      globalThis.verificationLinks = [];
      shell.openExternal = async url => { globalThis.verificationLinks.push(url); };
    });
    const links = () => app.evaluate(() => globalThis.verificationLinks);
    const line = label => page.locator('.cm-line').filter({ hasText: `[${label}]` });
    await log('link-ordinary-click');
    await line('Secure').click({ position: { x: 35, y: 12 } });
    expect(await links()).toEqual([]);
    await log('link-open', { entry: 'Control+click', protocol: 'https' });
    await line('Secure').click({ position: { x: 35, y: 12 }, modifiers: ['Control'] });
    await expect.poll(links).toEqual(['https://example.com/page']);
    await log('link-open', { entry: 'Control+click', protocol: 'http' });
    await line('Plain').click({ position: { x: 35, y: 12 }, modifiers: ['Control'] });
    await expect.poll(links).toEqual(['https://example.com/page', 'http://example.org/']);
    for (const label of ['Unsafe', 'Local', 'Unknown', 'Relative', 'Anchor']) {
      await log('link-refuse', { label });
      await line(label).click({ position: { x: 35, y: 12 }, modifiers: ['Control'] });
      await expect(page.locator('#link-message')).toBeVisible();
    }
    expect(await links()).toEqual(['https://example.com/page', 'http://example.org/']);
    await writeFile(join(evidence, 'external-browser-calls.json'), JSON.stringify(await links(), null, 2));
    expect(page.url()).toBe(pathToFileURL(join(root, 'out/index.html')).href);
    expect(await readFile(file, 'utf8')).toBe(original);
    await copyFile(file, join(evidence, 'disk-after-search-links.md'));
    await button('Menü').click();
    await expect(page.locator('#link-help')).toBeVisible();
    await capture('link-gesture-and-refusal');
    await button('Menü').click();
    const expanded = original + '\n<https://example.com/?q=&amp;>\n';
    await log('external-write-autolink');
    await writeFile(file, expanded);
    await expect(editor()).toContainText('<https://example.com/?q=&amp;>');
    await log('link-open', { entry: 'Control+click', syntax: 'literal autolink' });
    await page.locator('.cm-line').filter({ hasText: '<https://' }).click({ position: { x: 35, y: 12 }, modifiers: ['Control'] });
    await expect.poll(links).toEqual(['https://example.com/page', 'http://example.org/', 'https://example.com/?q=&amp;']);
    await writeFile(join(evidence, 'external-browser-calls.json'), JSON.stringify(await links(), null, 2));
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await append('Local text');
    await page.keyboard.press('Control+f');
    await search.fill('original');
    await log('autosave-with-focused-search');
    await page.clock.runFor(1600);
    await expect(page.locator('#status')).toHaveText('Gespeichert');
    await expect(search).toBeFocused();
    await page.keyboard.type(' query suffix');
    await expect(search).toHaveValue('original query suffix');
    await page.clock.runFor(2000);
    expect(await readFile(file, 'utf8')).toBe(expanded + 'Local text');
    await expect(editor()).not.toContainText('query suffix');
    await copyFile(file, join(evidence, 'disk-after-search-autosave.md'));
    await capture('search-after-autosave');
    await search.fill('original');
    await search.press('Home');
    await search.press('ArrowRight');
    const reloaded = '# Agent update\r\nOriginal original original\n';
    await log('external-reload-with-focused-search');
    await writeFile(file, reloaded);
    await page.clock.runFor(1000);
    await expect(editor()).toContainText('# Agent update');
    await expect(search).toBeFocused();
    await expect(search).toHaveValue('original');
    await expect(count).toHaveText(/^[1-3] \/ 3$/);
    await page.keyboard.type('X');
    await expect(search).toHaveValue('oXriginal');
    expect(await readFile(file, 'utf8')).toBe(reloaded);
    await capture('search-after-reload');
    await search.fill('original');
    await button('Nächster Treffer').click();
    await expect(button('Nächster Treffer')).toBeFocused();
    const reloadedAgain = '# Agent again\nOriginal\n';
    await log('external-reload-with-focused-search-button');
    await writeFile(file, reloadedAgain);
    await page.clock.runFor(1000);
    await expect(editor()).toContainText('# Agent again');
    await expect(button('Nächster Treffer')).toBeFocused();
    await expect(search).toHaveValue('original');
    await expect(count).toHaveText('1 / 1');
    expect(await readFile(file, 'utf8')).toBe(reloadedAgain);
    await copyFile(file, join(evidence, 'disk-after-search-reload.md'));
    await capture('search-button-after-reload');
    await page.keyboard.press('Escape');
    await expect(editor()).toBeFocused();
  } else if (mode === 'chapters') {
    const index = page.getByRole('listbox', { name: 'Kapitelindex' });
    const selection = () => page.evaluate(() => window.getSelection()?.toString());
    await editor().click();
    await page.keyboard.press('Control+Home');
    await page.keyboard.press('Shift+End');
    const selected = await selection();
    expect(selected.length).toBeGreaterThan(0);
    await log('chapters-hold-short', { entry: 'Alt', ms: 200 });
    await page.keyboard.down('Alt');
    await page.clock.runFor(200);
    await expect(index).toBeHidden();
    await log('chapters-hold-repeat', { entry: 'Alt', repeats: 5 });
    for (let repeat = 0; repeat < 5; repeat++) {
      await page.keyboard.down('Alt');
      await page.clock.runFor(100);
    }
    await expect(index).toBeFocused();
    await expect(index.getByRole('option')).toHaveText(['Original', 'Detail', 'Last chapter']);
    await expect(index.locator('[aria-current]')).toHaveText('Original');
    await capture('chapters-held');
    await log('chapters-release', { entry: 'Alt up' });
    await page.keyboard.up('Alt');
    await expect(index).toBeHidden();
    await expect(editor()).toBeFocused();
    expect(await selection()).toBe(selected);
    await page.keyboard.down('Alt');
    await page.clock.runFor(350);
    await log('chapters-confirm', { entry: 'End+Enter while held' });
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect(index).toBeHidden();
    await page.clock.runFor(500);
    await expect(index).toBeHidden();
    await page.keyboard.up('Alt');
    await expect(editor()).toBeFocused();
    expect(await selection()).toBe(selected);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
    await capture('chapters-confirmed');
    await log('chapters-menu', { entry: 'Menü → Kapitelindex' });
    await button('Menü').click();
    await button('Kapitelindex').click();
    await page.clock.runFor(1000);
    await expect(index).toBeFocused();
    await expect(index.locator('[aria-current]')).toHaveText('Last chapter');
    await page.keyboard.press('Home');
    await capture('chapters-menu');
    await log('chapters-escape');
    await page.keyboard.press('Escape');
    await expect(index).toBeHidden();
    await expect(editor()).toBeFocused();
    await log('chapters-click', { entry: 'menu, mouse option' });
    await button('Menü').click();
    await button('Kapitelindex').click();
    await index.getByRole('option', { name: 'Original' }).click();
    await expect(index).toBeHidden();
    await expect.poll(async () => (await page.locator('.cm-line', { hasText: /^# Original$/ }).boundingBox())?.y).toBeLessThan(200);
    expect(await selection()).toBe(selected);
    await log('chapters-outside-click');
    await button('Menü').click();
    await button('Kapitelindex').click();
    await page.locator('header').click();
    await expect(index).toBeHidden();
    expect(await readFile(file, 'utf8')).toBe(original);
    await copyFile(file, join(evidence, 'disk-after-chapters.md'));
  } else if (mode === 'drafts') {
    await expect(editor()).toHaveText('');
    await expect(editor()).toBeFocused();
    await log('type-at-startup');
    await page.keyboard.type('# Instant thoughts');
    await expect(page.getByRole('status')).toHaveText('Lokal gesichert');
    await capture('draft-protected');
    const draftDirectory = join(profile, 'drafts');
    for (const name of await readdir(draftDirectory)) await copyFile(join(draftDirectory, name), join(evidence, `draft-${name}`));
    await stop('before-draft-restart');
    await log('restart-unsaved-draft');
    await launch('draft-restarted');
    await expect(editor()).toContainText('# Instant thoughts');
    await expect(page.getByRole('status')).toHaveText('Lokal gesichert');
    await capture('draft-restored');
    await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: true, filePath: '' }); });
    await page.keyboard.press('Control+s');
    await expect(page.locator('#save')).toBeEnabled();
    await expect(editor()).toContainText('# Instant thoughts');
    await log('save-draft-copy', { target: join(scratch, 'thoughts.md') });
    const target = join(scratch, 'thoughts.md');
    await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); }, target);
    await page.keyboard.press('Control+s');
    await expect(page.getByRole('status')).toHaveText('Gespeichert');
    expect(await readFile(target, 'utf8')).toBe('# Instant thoughts');
    await copyFile(target, join(evidence, 'saved-thoughts.md'));
    await capture('draft-saved-as-file');
    await stop('before-blank-restart');
    await launch('blank-restarted');
    await expect(editor()).toHaveText('');
    await expect(editor()).toBeFocused();
    await capture('blank-after-save');
  } else if (mode === 'edit') {
    await append('Additional text');
    expect(await readFile(file, 'utf8')).toBe(original);
    await capture('unsaved');
    await log('save', { entry: 'Control+s' });
    await page.keyboard.press('Control+s');
    await expect(page.getByRole('status')).toHaveText('Gespeichert');
    expect(await readFile(file, 'utf8')).toBe(original + 'Additional text');
    await copyFile(file, join(evidence, 'disk-after-keyboard.md'));
    await capture('saved-keyboard');
    await append(' Menu save');
    await log('save', { entry: 'menu' });
    await button('Menü').click();
    await page.getByRole('button', { name: /^Speichern/ }).click();
    await expect(page.getByRole('status')).toHaveText('Gespeichert');
    expect(await readFile(file, 'utf8')).toBe(original + 'Additional text Menu save');
    await copyFile(file, join(evidence, 'disk-after-menu.md'));
    await open('Control+o');
    await expect(editor()).toContainText('Additional text Menu save');
    await capture('reopened');
  } else if (mode === 'autosave') {
    await append('Autosaved text');
    expect(await readFile(file, 'utf8')).toBe(original);
    await capture('autosave-pending');
    await log('wait-for-autosave', { quietPeriodMs: 1500 });
    await expect(page.getByRole('status')).toHaveText('Gespeichert');
    expect(await readFile(file, 'utf8')).toBe(original + 'Autosaved text');
    await copyFile(file, join(evidence, 'disk-after-autosave.md'));
    await capture('autosave-complete');
  } else if (mode === 'conflicts') {
    await log('external-write', { text: '# Agent\r\nLine two\n' });
    await writeFile(file, '# Agent\r\nLine two\n');
    await expect(editor()).toContainText('# Agent');
    await capture('clean-reload');
    await append('Local text');
    const local = '# Agent\r\nLine two\nLocal text';
    await log('external-write', { text: '# Other agent\n' });
    await writeFile(file, '# Other agent\n');
    await expect(button('Dateiversion laden')).toBeVisible();
    await expect(editor()).toContainText('Local text');
    await capture('conflict');
    await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: true }); });
    await log('copy-cancel');
    await button('Meine Version als Kopie speichern').click();
    await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'true');
    expect((await readdir(scratch)).filter(name => name.endsWith('.md'))).toEqual(['note.md']);
    const copy = join(scratch, 'copy.md');
    await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); }, copy);
    await log('copy-save', { copy });
    await button('Meine Version als Kopie speichern').click();
    await expect(page.locator('#notice')).toContainText('als Kopie gespeichert');
    expect(await readFile(copy, 'utf8')).toBe(local);
    expect(await readFile(file, 'utf8')).toBe('# Other agent\n');
    await copyFile(copy, join(evidence, 'saved-copy.md'));
    await capture('copy-saved');
    await writeFile(file, '# Latest agent\n');
    await log('load-disk-version');
    await button('Dateiversion laden').click();
    await expect(editor()).toContainText('# Latest agent');
    await expect(page.getByRole('status')).toHaveText('Gespeichert');
    await capture('disk-loaded');
    const backups = join(profile, 'conflict-recovery');
    for (const name of await readdir(backups)) await copyFile(join(backups, name), join(evidence, `backup-${name}`));
    await stop('before-restart');
    await rm(file);
    await log('restart-with-missing-original');
    await launch('restarted');
    await button('Menü').click();
    await log('restore', { entry: 'startup menu' });
    await button('Lokale Sicherung wiederherstellen').click();
    await expect(editor()).toContainText('Local text');
    await expect(page.getByRole('status')).toHaveText('Ungespeichert');
    await expect(readFile(file)).rejects.toThrow();
    await capture('recovered');
  } else {
    await append('Local text');
    const second = join(scratch, 'second.md');
    await writeFile(second, '# Second\n');
    await picker(second);
    await app.evaluate(({ dialog }) => {
      globalThis.verificationConfirmations = 0;
      dialog.showMessageBox = async () => {
        globalThis.verificationConfirmations++;
        return { response: 0, checkboxChecked: false };
      };
    });
    await log('open-second-window', { entry: 'Control+o' });
    await page.keyboard.press('Control+o');
    await expect.poll(() => app.windows().length).toBe(2);
    const other = app.windows().find(candidate => candidate !== page);
    await expect(other.getByRole('textbox', { name: 'Markdown bearbeiten' })).toContainText('# Second');
    expect(await app.evaluate(() => globalThis.verificationConfirmations)).toBe(0);
    await expect(page.locator('#open')).toBeEnabled();
    await expect(page.locator('#file-label')).toHaveText('note.md');
    await expect(editor()).toContainText('Local text');
    await capture('original-retained');
    await other.screenshot({ path: join(evidence, 'second-window.png'), fullPage: true });
    await log('window-close-cancel');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.getTitle().includes('note.md')).close());
    await expect.poll(() => app.evaluate(() => globalThis.verificationConfirmations)).toBe(1);
    await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'true');
    await expect(editor()).toContainText('Local text');
    expect(app.windows()).toHaveLength(2);
    expect(await readFile(file, 'utf8')).toBe(original);
    await capture('close-canceled');
  }
  passed = true;
} catch (error) {
  await writeFile(join(evidence, 'error.txt'), error.stack ?? String(error));
  if (page && !page.isClosed()) await capture('failure').catch(() => {});
  process.exitCode = 1;
} finally {
  // Keep evidence outside scratch. Close only the Electron application we launched.
  let cleanupError;
  try {
    if (app) await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); }).catch(() => {});
    await stop('trace');
  } catch (error) {
    cleanupError = String(error);
    // Last resort targets only this launch's child process, never a process name.
    if (app && app.process().exitCode === null) app.process().kill();
    process.exitCode = 1;
  }
  try { await rm(scratch, { recursive: true, force: true }); }
  catch (error) { cleanupError = `${cleanupError ?? ''} ${error}`; process.exitCode = 1; }
  await writeFile(join(evidence, 'result.json'), JSON.stringify({ mode, passed, cleanupError, scratch, evidence, mainBuildSha256: hash }, null, 2));
  const artifacts = await readdir(evidence);
  console.log(JSON.stringify({ passed, evidence, artifacts, cleanupError }, null, 2));
}
