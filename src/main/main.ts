import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { realpath } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DocumentSession } from './document';
import { pathIdentity, RecentFiles } from './recent';

interface DocumentWindow { window: BrowserWindow; session: DocumentSession; allowClose: boolean }
const documents = new Map<number, DocumentWindow>();
const markdownExtensions = ['md', 'markdown', 'mdown', 'txt'];
if (process.platform === 'win32') app.setAppUserModelId('md0.editor');
function findDocument(path: string, except?: DocumentWindow) {
  return [...documents.values()].find(context => {
    const opened = context.session.state().path;
    return context !== except && opened !== null && pathIdentity(opened) === pathIdentity(path);
  });
}
function focus(context: DocumentWindow) {
  if (context.window.isMinimized()) context.window.restore();
  context.window.show();
  context.window.focus();
}
let queue: Promise<unknown> = Promise.resolve();
const rendererUrl = pathToFileURL(join(__dirname, 'index.html')).href;
if (!app.commandLine.hasSwitch('user-data-dir')) {
  const previousProfile = join(app.getPath('appData'), 'zen-markdown');
  if (!existsSync(app.getPath('userData')) && existsSync(previousProfile)) app.setPath('userData', previousProfile);
}
const recentFiles = new RecentFiles(join(app.getPath('userData'), 'recent-files.json'));
async function remember(context: DocumentWindow, path: string) {
  try { await recentFiles.remember(path); }
  catch (error) { context.session.reportError('Zuletzt verwendete Dateien konnten nicht gespeichert werden', error); }
}
function enqueue<T>(action: () => Promise<T>): Promise<T> {
  const operation = queue.then(action);
  queue = operation.catch(() => undefined);
  return operation;
}
function session() {
  return new DocumentSession(join(app.getPath('userData'), 'conflict-recovery'), join(app.getPath('userData'), 'drafts'));
}
async function confirmDiscard(context: DocumentWindow): Promise<boolean> {
  const result = await dialog.showMessageBox(context.window, {
    type: 'warning', message: 'Ungespeicherte Änderungen verwerfen?',
    detail: 'Der lokale Text geht verloren. Zum Speichern zuerst Abbrechen wählen und bewusst speichern.',
    buttons: ['Abbrechen', 'Änderungen verwerfen'], defaultId: 0, cancelId: 0, noLink: true,
  });
  return result.response === 1;
}
// Transparent caption buttons over the page; the renderer draws the fading drag strip.
function titleBarOverlay() {
  return { color: '#00000000', symbolColor: nativeTheme.shouldUseDarkColors ? '#969d8e' : '#74786d', height: 40 };
}
async function createWindow(document = session()): Promise<DocumentWindow> {
  const window = new BrowserWindow({
    width: 1120, height: 900, minWidth: 460, minHeight: 400,
    title: 'md0', backgroundColor: '#f5f3ee', icon: join(__dirname, 'icon.ico'),
    titleBarStyle: 'hidden', titleBarOverlay: titleBarOverlay(),
    webPreferences: { preload: join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
  });
  const context = { window, session: document, allowClose: false };
  const id = window.webContents.id;
  documents.set(id, context);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.on('close', event => {
    if (context.allowClose) return;
    event.preventDefault();
    window.webContents.send('document:close-requested');
  });
  window.on('blur', () => { window.webContents.send('document:window-blurred'); });
  window.on('closed', () => { documents.delete(id); });
  window.webContents.on('render-process-gone', () => {
    void enqueue(async () => {
      if (await document.canLeave(() => confirmDiscard(context))) {
        context.allowClose = true;
        window.close();
      }
    });
  });
  await window.loadURL(rendererUrl);
  return context;
}
async function openPath(path: string, source?: DocumentWindow) {
  try {
    if (!isAbsolute(path) || !markdownExtensions.includes(extname(path).slice(1).toLowerCase())) throw new Error('Bitte eine Markdown-Datei wählen.');
    const canonical = await realpath(path);
    const existing = findDocument(canonical);
    if (existing) {
      focus(existing);
      await remember(existing, canonical);
      return;
    }
    const empty = source && !source.session.state().path && !source.session.state().text;
    const document = empty ? source.session : session();
    const state = await document.open(canonical);
    if (state.path === null) throw new Error(state.error ?? 'Datei konnte nicht geöffnet werden.');
    const target = empty ? source : await createWindow(document);
    await remember(target, canonical);
  } catch (error) {
    const target = source ?? documents.values().next().value;
    if (target) {
      const state = target.session.reportError('Öffnen fehlgeschlagen', error);
      if (!source) {
        focus(target);
        target.window.webContents.send('document:open-error', state.error);
      }
    }
    else {
      const document = session();
      document.reportError('Öffnen fehlgeschlagen', error);
      await createWindow(document);
    }
  }
}
function authorizedDocument(event: IpcMainInvokeEvent) {
  const context = documents.get(event.sender.id);
  if (!context || event.senderFrame !== context.window.webContents.mainFrame || event.senderFrame.url !== rendererUrl) throw new Error('Unzulässiger Dokumentzugriff');
  return context;
}
function registerCommands() {
  ipcMain.handle('document:openExternal', (event, argument: unknown) => {
    authorizedDocument(event);
    if (typeof argument !== 'string' || !/^https?:\/\//i.test(argument)) throw new Error('Nicht unterstützter Link');
    const url = new URL(argument);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Nicht unterstützter Link');
    return enqueue(() => shell.openExternal(url.href));
  });
  // Zen mode is the window's fullscreen state; without an argument it toggles.
  ipcMain.handle('document:zen', (event, enable: unknown) => {
    const { window } = authorizedDocument(event);
    window.setFullScreen(typeof enable === 'boolean' ? enable : !window.isFullScreen());
    return window.isFullScreen();
  });
  const commands: Record<string, (context: DocumentWindow, argument: unknown) => unknown> = {
    state: context => context.session.recoveryState(),
    recent: () => recentFiles.list(),
    edit: async ({ session }, argument) => {
      if (typeof argument !== 'string') throw new Error('Ungültiger Text');
      session.edit(argument);
      return session.persistDraft();
    },
    newDocument: async context => {
      if (context.session.state().path) await createWindow();
      else await context.session.newDocument(() => confirmDiscard(context));
    },
    open: async context => {
      const result = await dialog.showOpenDialog(context.window, {
        title: 'Markdown öffnen', properties: ['openFile'],
        filters: [{ name: 'Markdown', extensions: markdownExtensions }],
      });
      if (!result.canceled && result.filePaths[0]) await openPath(result.filePaths[0], context);
    },
    openDropped: async (context, argument) => {
      if (typeof argument !== 'string' || !argument) throw new Error('Keine lokale Markdown-Datei im abgelegten Objekt.');
      await openPath(argument, context);
    },
    openRecent: async (context, argument) => {
      if (typeof argument !== 'string' || !(await recentFiles.list()).includes(argument)) throw new Error('Unbekannter Dateieintrag.');
      await openPath(argument, context);
    },
    save: async context => {
      if (context.session.state().path) return context.session.save();
      const result = await dialog.showSaveDialog(context.window, {
        title: 'Entwurf als Markdown speichern', defaultPath: 'Gedanken.md', filters: [{ name: 'Markdown', extensions: ['md'] }],
      });
      await context.session.saveDraft(result.canceled ? null : result.filePath ?? null);
      const savedPath = context.session.state().path;
      if (savedPath) await remember(context, savedPath);
      return context.session.state();
    },
    refresh: context => context.session.refresh(),
    loadDiskVersion: context => context.session.loadDiskVersion(),
    restoreBackup: context => context.session.restoreBackup(() => confirmDiscard(context), async path => {
      // Missing originals are still recoverable; compare their stored absolute path.
      const canonical = await realpath(path).catch(() => resolve(path));
      const existing = findDocument(canonical, context);
      if (!existing) return true;
      focus(existing);
      context.session.reportError('Wiederherstellen nicht ausgeführt', new Error('Datei ist bereits geöffnet. Die lokale Sicherung im vorhandenen Dateifenster wiederherstellen.'));
      return false;
    }),
    saveCopy: async context => {
      const result = await dialog.showSaveDialog(context.window, {
        title: 'Meine Version als Kopie speichern',
        defaultPath: context.session.state().path?.replace(/(\.[^./\\]+)?$/, '-kopie.md'),
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });
      return context.session.saveCopy(result.canceled ? null : result.filePath ?? null);
    },
    close: async context => {
      if (await context.session.canLeave(() => confirmDiscard(context))) {
        context.allowClose = true;
        context.window.close();
      }
    },
  };
  for (const [command, action] of Object.entries(commands)) {
    ipcMain.handle(`document:${command}`, (event, argument: unknown) => {
      const context = authorizedDocument(event);
      return enqueue(async () => {
        try { return await action(context, argument) ?? context.session.state(); }
        catch (error) {
          if (command === 'recent') throw error;
          return context.session.reportError('Aktion fehlgeschlagen', error);
        }
      });
    });
  }
}
function argumentPaths(args: string[], cwd: string): string[] {
  // In development argv also contains Electron and the application directory.
  return args.slice(app.isPackaged ? 1 : 2).filter(value => !value.startsWith('-')).map(value => resolve(cwd, value));
}
const pendingPaths = argumentPaths(process.argv, process.cwd());
const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();
else {
  app.on('second-instance', (_event, argv, cwd) => {
    const paths = argumentPaths(argv, cwd);
    void app.whenReady().then(() => enqueue(async () => {
      for (const path of paths) await openPath(path);
      if (!paths.length) documents.values().next().value?.window.focus();
    }));
  });
  app.on('open-file', (event, path) => {
    event.preventDefault();
    if (!app.isReady()) pendingPaths.push(path);
    else void enqueue(() => openPath(path));
  });
  void app.whenReady().then(() => enqueue(async () => {
    Menu.setApplicationMenu(null);
    nativeTheme.on('updated', () => {
      for (const { window } of documents.values()) window.setTitleBarOverlay?.(titleBarOverlay());
    });
    registerCommands();
    const document = session();
    await document.startup();
    if (!pendingPaths.length || document.state().text || document.state().error) await createWindow(document);
    for (const path of pendingPaths) await openPath(path);
  }));
  app.on('window-all-closed', () => app.quit());
}
