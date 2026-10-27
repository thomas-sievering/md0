import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('only deliberate Markdown link activation opens validated web destinations outside the app', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'md0-links-'));
  const path = join(directory, 'links.md');
  const source = '[Secure](https://example.com/page)\n\n[Plain](http://example.org/)\n\n[Unsafe](javascript:alert(1))\n\n[Local](file:///C:/secret.md)\n\n[Unknown](custom:launch)\n\n[Relative](other.md)\n\n[Anchor](#heading)\n\n`[Code](https://example.net/)`\n\n![Image](https://example.net/image.png)\n\n[Reference][ref]\n\n[ref]: https://example.com/reference\n\n<https://example.com/auto>\n';
  await writeFile(path, source);
  const app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${join(directory, 'profile')}`, path] });
  try {
    await app.evaluate(({ shell }) => {
      Reflect.set(globalThis, 'openedLinks', []);
      shell.openExternal = async url => { Reflect.get(globalThis, 'openedLinks').push(url); };
    });
    const page = await app.firstWindow();
    const editor = page.getByRole('textbox', { name: 'Markdown bearbeiten' });
    await expect(editor).toContainText('[Secure]');
    const before = page.url();
    const line = (label: string) => page.locator('.cm-line').filter({ hasText: label }).first();
    const opened = () => app.evaluate(() => Reflect.get(globalThis, 'openedLinks'));
    await line('[Secure]').click({ position: { x: 35, y: 12 } });
    expect(await opened()).toEqual([]);
    await line('[Secure]').click({ position: { x: 35, y: 12 }, modifiers: ['Control'] });
    await expect.poll(opened).toEqual(['https://example.com/page']);
    await line('[Plain]').click({ position: { x: 35, y: 12 }, modifiers: ['Control'] });
    await expect.poll(opened).toEqual(['https://example.com/page', 'http://example.org/']);
    for (const label of ['Unsafe', 'Local', 'Unknown', 'Relative', 'Anchor', 'Code', 'Image']) {
      await line(`[${label}]`).click({ position: { x: 35, y: 12 }, modifiers: ['Control'] });
    }
    expect(await opened()).toEqual(['https://example.com/page', 'http://example.org/']);
    await line('[Reference]').click({ position: { x: 35, y: 12 }, modifiers: ['Control'] });
    await expect.poll(opened).toHaveLength(3);
    await line('<https://').click({ position: { x: 35, y: 12 }, modifiers: ['Control'] });
    await expect.poll(opened).toEqual(['https://example.com/page', 'http://example.org/', 'https://example.com/reference', 'https://example.com/auto']);
    expect(await readFile(path, 'utf8')).toBe(source);
    const changed = '[Entities](https://example.com/?a=1&amp;b=2)\n\n[Escaped](https://example.com/a\\(b\\))\n\n[Collapsed][]\n\n[Collapsed]: https://example.com/collapsed\n\n<https://example.com/?q=&amp;>\n';
    await writeFile(path, changed);
    await expect(editor).toContainText('[Entities]');
    await line('[Entities]').click({ position: { x: 35, y: 12 }, modifiers: ['Control'] });
    await expect.poll(opened).toContain('https://example.com/?a=1&b=2');
    await line('[Escaped]').click({ position: { x: 35, y: 12 }, modifiers: ['Control'] });
    await expect.poll(opened).toContain('https://example.com/a(b)');
    await line('[Collapsed]').click({ position: { x: 35, y: 12 }, modifiers: ['Control'] });
    await expect.poll(opened).toContain('https://example.com/collapsed');
    await line('<https://').click({ position: { x: 35, y: 12 }, modifiers: ['Control'] });
    await expect.poll(opened).toContain('https://example.com/?q=&amp;');
    expect(page.url()).toBe(before);
    expect(await readFile(path, 'utf8')).toBe(changed);
    await page.getByRole('button', { name: 'Menü', exact: true }).click();
    await expect(page.getByText('Links öffnen: Strg + Klick (nur HTTP/HTTPS).', { exact: true })).toBeVisible();
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
