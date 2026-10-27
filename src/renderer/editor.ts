import { defaultKeymap, history, historyKeymap, invertedEffects } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { ChangeSet, Compartment, EditorState, StateEffect, StateField, Text } from '@codemirror/state';
import { drawSelection, EditorView, keymap } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { closeSearchPanel, openSearchPanel } from '@codemirror/search';
import { documentSearch, retainDocumentSearch } from './search';
import { documentLinks } from './links';
import { createChapterIndex } from './chapters';
import type { DocumentApi, DocumentState } from '../shared/document';

declare global { interface Window { documentApi: DocumentApi } }
const api = window.documentApi;
function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: ${id}`);
  return node as T;
}
const container = element('editor');
const menuButton = element<HTMLButtonElement>('menu-button');
const menu = element('menu');
const saveButton = element<HTMLButtonElement>('save');
const openButton = element<HTMLButtonElement>('open');
const editable = new Compartment();
let view: EditorView | null = null;
const chapterIndex = createChapterIndex(() => view);
// The main process also reports blur, which the renderer can miss (e.g. under focus emulation).
window.documentApi.onWindowBlurred(chapterIndex.windowBlurred);
let rawText = '';
let current: DocumentState = { documentId: '', path: null, text: '', dirty: false, error: null, conflict: false, notice: null, noticeRevision: 0, recoveryAvailable: false, draftSaved: false };
let lastNoticeRevision = -1;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
let busy = false;
let revision = 0;
// Long enough to finish a short phrase; every edit restarts this quiet period.
const autosaveDelay = 1500;
let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
let autosaveDue: number | null = null;
let closeRequested = false;

function armAutosave() {
  clearTimeout(autosaveTimer);
  if (!current.path || !current.dirty || current.conflict || current.error) autosaveDue = null;
  if (busy || autosaveDue === null) return;
  const remaining = autosaveDue - Date.now();
  if (remaining <= 0) void run('save');
  else autosaveTimer = setTimeout(() => { void run('save'); }, remaining);
}

function showMenu(open: boolean) {
  menu.hidden = !open;
  menuButton.setAttribute('aria-expanded', String(open));
  if (open) void api.recent().then(paths => {
    const entries = paths.map(path => {
      const button = document.createElement('button');
      button.textContent = path;
      button.title = path;
      button.addEventListener('click', () => { void run('open', () => api.openRecent(path)); });
      return button;
    });
    element('recent-files').replaceChildren(...entries);
  }).catch(showTransportError);
}
function showState(state: DocumentState) {
  current = state;
  element('file-label').textContent = state.path?.split(/[\\/]/).pop() ?? 'Unbenannter Entwurf';
  element('status').textContent = state.path
    ? state.dirty ? 'Ungespeichert' : 'Gespeichert'
    : state.draftSaved && state.text ? 'Lokal gesichert' : state.dirty ? 'Ungespeichert' : '';
  element('error').textContent = state.error && state.dirty && !state.conflict
    ? state.path
      ? `${state.error} Automatisches Speichern pausiert. Mit Strg+S oder „Speichern“ im Menü erneut versuchen.`
      : `${state.error} Text bleibt hier erhalten. Mit Strg+S als Datei speichern oder nach Beheben des Problems weiter tippen.`
    : state.error;
  element('error').hidden = !state.error;
  saveButton.disabled = busy;
  element<HTMLButtonElement>('new').disabled = busy;
  element('conflict').hidden = !state.conflict;
  element<HTMLButtonElement>('restore').disabled = busy || !state.recoveryAvailable;
  if (state.noticeRevision !== lastNoticeRevision || !state.notice) {
    lastNoticeRevision = state.noticeRevision;
    clearTimeout(noticeTimer);
    element('notice').textContent = state.notice;
    element('notice').hidden = !state.notice;
    if (state.notice) noticeTimer = setTimeout(() => { element('notice').hidden = true; }, 5000);
  }
  document.title = `${state.dirty ? '• ' : ''}${state.path?.split(/[\\/]/).pop() ?? 'md0'}`;
}

// CodeMirror uses logical LF positions. Apply only the actual edits back to the
// original source so untouched mixed CRLF/LF/CR endings and BOM remain verbatim.
function rawOffset(source: string, position: number): number {
  let raw = 0;
  for (let logical = 0; logical < position; logical++) {
    if (source[raw] === '\r' && source[raw + 1] === '\n') raw++;
    raw++;
  }
  return raw;
}
function mount(text: string, preservePosition = false) {
  const scroll = window.scrollY;
  const restoreSearch = view && preservePosition ? retainDocumentSearch(view) : null;
  let selection = undefined;
  if (view && preservePosition) {
    const before = view.state.doc.toString();
    const after = text.replace(/\r\n|\r/g, '\n');
    let prefix = 0;
    while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
    let suffix = 0;
    while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - suffix - 1] === after[after.length - suffix - 1]) suffix++;
    const changes = ChangeSet.of({ from: prefix, to: before.length - suffix, insert: after.slice(prefix, after.length - suffix) }, before.length);
    selection = view.state.selection.map(changes);
  }
  view?.destroy();
  rawText = text;
  container.replaceChildren();
  container.hidden = false;
  const restoreSource = StateEffect.define<string>();
  const rawSource: StateField<string> = StateField.define({
    create: () => text,
    update(source, transaction) {
      // Grouped history effects run newest-to-oldest: the last snapshot is the
      // source before the entire group. Redo captures the inverse automatically.
      const restorations = transaction.effects.filter(effect => effect.is(restoreSource));
      const restored = restorations.at(-1);
      if (restored) return restored.value;
      if (!transaction.docChanged) return source;
      const newline = source.match(/\r\n|\r|\n/)?.[0] ?? '\n';
      const changes: { from: number; to: number; insert: string }[] = [];
      transaction.changes.iterChanges((from, to, _fromB, _toB, inserted) => {
        changes.push({ from: rawOffset(source, from), to: rawOffset(source, to), insert: inserted.toString().replaceAll('\n', newline) });
      });
      for (const change of changes.reverse()) {
        source = source.slice(0, change.from) + change.insert + source.slice(change.to);
      }
      return source;
    },
  });
  view = new EditorView({
    parent: container,
    state: EditorState.create({
      doc: Text.of(text.split(/\r\n|\r|\n/)),
      selection,
      extensions: [
        markdown(), history(), rawSource, documentSearch,
        documentLinks(url => {
          element('link-message').hidden = true;
          void api.openExternal(url).catch(() => {
            element('link-message').textContent = 'Link konnte nicht geöffnet werden. Nur vollständige HTTP-/HTTPS-Adressen werden unterstützt.';
            element('link-message').hidden = false;
          });
        }),
        invertedEffects.of(transaction => transaction.docChanged ? [restoreSource.of(transaction.startState.field(rawSource))] : []),
        drawSelection(), EditorView.lineWrapping,
        // Beats CodeMirror's default lavender selection, whose selector outranks plain stylesheet rules.
        EditorView.theme({ '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { background: 'var(--selection)' } }),
        keymap.of([{ key: 'Escape', run: closeSearchPanel }, ...defaultKeymap, ...historyKeymap]),
        editable.of([EditorView.editable.of(!busy), EditorState.readOnly.of(busy)]),
        EditorView.contentAttributes.of({ 'aria-label': 'Markdown bearbeiten', 'aria-multiline': 'true', spellcheck: 'false' }),
        syntaxHighlighting(HighlightStyle.define([
          { tag: tags.heading, class: 'cm-heading' },
          { tag: [tags.monospace, tags.processingInstruction], class: 'cm-code' },
          { tag: tags.punctuation, class: 'cm-syntax' },
        ])),
        EditorView.updateListener.of(update => {
          if (!update.docChanged) return;
          rawText = update.state.field(rawSource);
          const version = ++revision;
          showState({ ...current, text: rawText, dirty: true, draftSaved: false });
          autosaveDue = Date.now() + autosaveDelay;
          armAutosave();
          void api.edit(rawText).then(state => {
            if (revision === version && !busy) {
              showState(state);
              armAutosave();
            }
          }).catch(showTransportError);
        }),
      ],
    }),
  });
  restoreSearch?.(view);
  chapterIndex.refresh();
  if (preservePosition) window.scrollTo(0, scroll);
}
function showTransportError(error: unknown) {
  showState({ ...current, text: rawText, dirty: current.dirty, error: `Verbindung fehlgeschlagen: ${String(error)}` });
}
async function run(command: 'newDocument' | 'open' | 'save' | 'close' | 'refresh' | 'loadDiskVersion' | 'saveCopy' | 'restoreBackup', action = () => api[command]()) {
  if (busy) return;
  const hadFocus = view?.hasFocus;
  const searchHadFocus = Boolean(document.activeElement?.closest('.document-search'));
  const chapterHadFocus = chapterIndex.hasFocus();
  const scroll = window.scrollY;
  busy = true;
  clearTimeout(autosaveTimer);
  if (command === 'save') autosaveDue = null;
  const previousDocumentId = current.documentId;
  if (command !== 'refresh') showMenu(false);
  openButton.disabled = true;
  saveButton.disabled = true;
  view?.dispatch({ effects: editable.reconfigure([EditorView.editable.of(false), EditorState.readOnly.of(true)]) });
  try {
    const state = await action();
    // A successful restore emits a new notice; cancellation leaves it unchanged.
    // Its dirty backup must not inherit the discarded edit's save deadline.
    if (command === 'restoreBackup' && state.noticeRevision !== current.noticeRevision) autosaveDue = null;
    if (state.documentId !== current.documentId) chapterIndex.close(false);
    if (state.documentId !== current.documentId || state.text !== rawText) mount(state.text, state.documentId === current.documentId);
    showState(state);
  } catch (error) {
    showTransportError(error);
  } finally {
    busy = false;
    openButton.disabled = false;
    showState(current);
    view?.dispatch({ effects: editable.reconfigure([EditorView.editable.of(true), EditorState.readOnly.of(false)]) });
    if ((command !== 'refresh' || hadFocus) && ((!searchHadFocus && !chapterHadFocus) || current.documentId !== previousDocumentId)) view?.focus();
    if (command === 'refresh') window.scrollTo(0, scroll);
    if (current.documentId !== previousDocumentId) autosaveDue = null;
    if (closeRequested) {
      closeRequested = false;
      void run('close');
    } else armAutosave();
  }
}
// Capture before CodeMirror: a file drop must never insert its contents or URL.
for (const type of ['dragenter', 'dragover', 'drop']) document.addEventListener(type, event => {
  const drag = event as DragEvent;
  if (!drag.dataTransfer?.types.includes('Files')) return;
  drag.preventDefault();
  drag.stopImmediatePropagation();
  if (type === 'drop') {
    const file = drag.dataTransfer.files[0];
    if (file) void run('open', () => api.openDroppedFile(file));
  }
}, true);
menuButton.addEventListener('click', () => {
  showMenu(menu.hidden);
  if (!menu.hidden) openButton.focus();
});
element('new').addEventListener('click', () => { void run('newDocument'); });
element('search').addEventListener('click', () => { showMenu(false); if (view) openSearchPanel(view); });
element('chapters').addEventListener('click', () => { showMenu(false); chapterIndex.open(); });
element('zen').addEventListener('click', () => { showMenu(false); void api.zen(); view?.focus(); });
openButton.addEventListener('click', () => { void run('open'); });
saveButton.addEventListener('click', () => { void run('save'); });
element('load-disk').addEventListener('click', () => { void run('loadDiskVersion'); });
element('save-copy').addEventListener('click', () => { void run('saveCopy'); });
element('restore').addEventListener('click', () => { void run('restoreBackup'); });
// Polling survives atomic replacements and missed filesystem notifications. Refresh
// shares the command queue and briefly freezes editing to avoid stale-base edits.
const monitor = setInterval(() => { if (current.path) void run('refresh'); }, 1000);
window.addEventListener('beforeunload', () => { clearInterval(monitor); clearTimeout(noticeTimer); clearTimeout(autosaveTimer); });
document.addEventListener('click', event => {
  if (event.target instanceof Node && !menu.contains(event.target) && !menuButton.contains(event.target)) showMenu(false);
});
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
    event.preventDefault();
    showMenu(false);
    if (view) openSearchPanel(view);
  }
  if (event.key === 'F11') { event.preventDefault(); void api.zen(); }
  // Escape leaves zen mode only when nothing else (search, menu, index) consumed it.
  else if (event.key === 'Escape' && menu.hidden && !event.defaultPrevented) void api.zen(false);
  if (event.key === 'Escape' && !menu.hidden) { showMenu(false); menuButton.focus(); }
  if ((event.ctrlKey || event.metaKey) && ['n', 'o', 's'].includes(event.key.toLowerCase())) {
    event.preventDefault();
    void run(event.key.toLowerCase() === 'n' ? 'newDocument' : event.key.toLowerCase() === 'o' ? 'open' : 'save');
  }
});
api.onOpenError(message => { showState({ ...current, error: message }); armAutosave(); });
api.onCloseRequested(() => {
  if (busy) closeRequested = true;
  else void run('close');
});
void api.state().then(state => { showState(state); mount(state.text); view?.focus(); }).catch(showTransportError);
