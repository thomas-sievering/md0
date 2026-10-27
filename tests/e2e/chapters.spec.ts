import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('chapter menu indexes real H1/H2 structure, scrolls without moving the writing selection, and handles empty documents', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'md0-chapters-'));
  const file = join(directory, 'chapters.md');
  const text = '\uFEFF---\n# Hidden metadata\n---\n\n# Start\n\n## Detail\n\n```md\n# Hidden code\n```\n\n### Too deep\n\n' + 'Body\n\n'.repeat(100) + 'Last chapter\n============\n';
  await writeFile(file, text);
  const app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${join(directory, 'profile')}`, file] });
  try {
    const page = await app.firstWindow();
    const editor = page.getByRole('textbox', { name: 'Markdown bearbeiten' });
    await expect(editor).toContainText('# Start');
    await editor.focus();
    await page.keyboard.press('Control+Home');
    await page.keyboard.press('Shift+ArrowRight');
    const selection = await page.evaluate(() => window.getSelection()?.toString());
    await page.getByRole('button', { name: 'Menü', exact: true }).click();
    await page.getByRole('button', { name: 'Kapitelindex', exact: true }).click();
    const index = page.getByRole('listbox', { name: 'Kapitelindex' });
    await expect(index).toBeFocused();
    await expect(index.getByRole('option')).toHaveText(['Start', 'Detail', 'Last chapter']);
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect(index).toBeHidden();
    await expect(editor).toBeFocused();
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(selection);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
    // The last heading cannot scroll to the top, yet it is the reached chapter.
    await page.getByRole('button', { name: 'Menü', exact: true }).click();
    await page.getByRole('button', { name: 'Kapitelindex', exact: true }).click();
    await expect(index.locator('[aria-current]')).toHaveText('Last chapter');
    await expect(index.getByRole('option', { selected: true })).toHaveText('Last chapter');
    await page.keyboard.press('Escape');
    expect(await readFile(file, 'utf8')).toBe(text);
    const blankOpened = app.waitForEvent('window');
    await page.keyboard.press('Control+n');
    const blank = await blankOpened;
    await blank.getByRole('button', { name: 'Menü', exact: true }).click();
    await blank.getByRole('button', { name: 'Kapitelindex', exact: true }).click();
    await expect(blank.getByText('Keine Kapitel vorhanden.')).toBeVisible();
    await blank.keyboard.press('Escape');
    await expect(blank.getByRole('textbox', { name: 'Markdown bearbeiten' })).toBeFocused();
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('held Alt is transient, repeat-safe, dismissible for the rest of a hold, and yields to other shortcuts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'md0-chapter-alt-'));
  const file = join(directory, 'chapters.md');
  await writeFile(file, '# First\n\n## Second\n');
  const app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${join(directory, 'profile')}`, file] });
  try {
    const page = await app.firstWindow();
    const editor = page.getByRole('textbox', { name: 'Markdown bearbeiten' });
    const index = page.getByRole('listbox', { name: 'Kapitelindex' });
    await expect(editor).toBeFocused();
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await page.keyboard.down('Alt');
    await page.clock.runFor(200);
    await expect(index).toBeHidden();
    await page.clock.runFor(150);
    await expect(index).toBeFocused();
    for (let repeat = 0; repeat < 5; repeat++) {
      await page.keyboard.down('Alt');
      await page.clock.runFor(100);
    }
    await expect(index).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(index.getByRole('option', { selected: true })).toHaveText('Second');
    await page.keyboard.press('Enter');
    await expect(index).toBeHidden();
    await expect(editor).toBeFocused();
    await page.keyboard.down('Alt');
    await page.clock.runFor(500);
    await expect(index).toBeHidden();
    await page.keyboard.up('Alt');
    await page.keyboard.down('Alt');
    await page.clock.runFor(350);
    await expect(index).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.down('Alt');
    await page.clock.runFor(500);
    await expect(index).toBeHidden();
    await page.keyboard.up('Alt');
    await page.keyboard.down('Alt');
    await page.clock.runFor(350);
    await expect(index).toBeVisible();
    await page.keyboard.up('Alt');
    await expect(index).toBeHidden();
    await page.keyboard.down('Alt');
    await page.clock.runFor(350);
    await expect(index).toBeVisible();
    await page.evaluate(() => window.addEventListener('keydown', event => { if (event.key === 'x') Reflect.set(window, 'altCombinationPrevented', event.defaultPrevented); }));
    await page.keyboard.press('x');
    await expect(index).toBeHidden();
    expect(await page.evaluate(() => Reflect.get(window, 'altCombinationPrevented'))).toBe(false);
    await page.keyboard.up('Alt');
    await page.keyboard.down('Alt');
    await page.keyboard.down('Shift');
    await page.clock.runFor(500);
    await expect(index).toBeHidden();
    await page.keyboard.up('Shift');
    await page.keyboard.up('Alt');
    await page.keyboard.down('Control');
    await page.keyboard.down('Alt');
    await page.clock.runFor(500);
    await expect(index).toBeHidden();
    await page.keyboard.up('Alt');
    await page.keyboard.up('Control');
    await page.keyboard.down('Alt');
    await page.clock.runFor(350);
    await expect(index).toBeVisible();
    // BrowserWindow.blur() emits nothing on Windows; focusing another window is a real focus loss.
    await app.evaluate(({ BrowserWindow }) => { new BrowserWindow({ width: 200, height: 200 }).focus(); });
    await expect(index).toBeHidden();
    await app.evaluate(({ BrowserWindow }) => {
      const [main, other] = BrowserWindow.getAllWindows().sort((a, b) => a.id - b.id);
      other?.destroy();
      main?.focus();
    });
    await page.keyboard.up('Alt');
    await page.keyboard.down('Alt');
    await page.clock.runFor(350);
    await expect(index).toBeVisible();
    await page.keyboard.up('Alt');
    await page.getByRole('button', { name: 'Menü', exact: true }).click();
    await page.getByRole('button', { name: 'Kapitelindex', exact: true }).click();
    await page.clock.runFor(1000);
    await expect(index).toBeVisible();
    await page.locator('#chapter-index').click({ position: { x: 20, y: 300 } });
    await expect(index).toBeHidden();
    expect(await readFile(file, 'utf8')).toBe('# First\n\n## Second\n');
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
