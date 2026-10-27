import { closeSearchPanel, findNext, findPrevious, getSearchQuery, openSearchPanel, search, searchPanelOpen, SearchQuery, setSearchQuery } from '@codemirror/search';
import { EditorView } from '@codemirror/view';

export function retainDocumentSearch(view: EditorView) {
  const query = getSearchQuery(view.state);
  const open = searchPanelOpen(view.state);
  const focused = document.activeElement;
  const label = focused?.closest('.document-search') ? focused.getAttribute('aria-label') : null;
  const selection = focused instanceof HTMLInputElement
    ? { start: focused.selectionStart, end: focused.selectionEnd, direction: focused.selectionDirection }
    : null;
  return (nextView: EditorView) => {
    if (open) openSearchPanel(nextView);
    nextView.dispatch({ effects: setSearchQuery.of(query) });
    if (label) {
      const control = Array.from(nextView.dom.querySelectorAll<HTMLElement>('.document-search [aria-label]')).find(node => node.getAttribute('aria-label') === label);
      control?.focus();
      if (control instanceof HTMLInputElement && selection?.start != null && selection.end != null) {
        control.setSelectionRange(selection.start, selection.end, selection.direction ?? undefined);
      }
    } else if (focused instanceof HTMLElement && focused.isConnected) focused.focus();
  };
}

export const documentSearch = search({
  top: true,
  literal: true,
  createPanel(view) {
    const dom = document.createElement('div');
    dom.className = 'document-search';
    dom.setAttribute('role', 'search');
    const input = document.createElement('input');
    input.type = 'search';
    input.setAttribute('aria-label', 'Im Dokument suchen');
    input.setAttribute('main-field', 'true');
    input.placeholder = 'Im Dokument suchen';
    input.value = getSearchQuery(view.state).search;
    const count = document.createElement('span');
    count.id = 'search-count';
    count.setAttribute('aria-live', 'polite');
    function updateCount() {
      const query = getSearchQuery(view.state);
      let total = 0;
      let selected = 1;
      if (query.valid) {
        const cursor = query.getCursor(view.state);
        for (let result = cursor.next(); !result.done; result = cursor.next()) {
          total++;
          if (result.value.from === view.state.selection.main.from) selected = total;
        }
      }
      count.textContent = !query.valid ? 'Suchbegriff eingeben' : total ? `${selected} / ${total}` : 'Keine Treffer';
    }
    input.addEventListener('input', () => {
      const query = new SearchQuery({ search: input.value, literal: true });
      const first = query.valid ? query.getCursor(view.state).next() : null;
      view.dispatch({
        effects: [setSearchQuery.of(query), ...(first && !first.done ? [EditorView.scrollIntoView(first.value.from)] : [])],
        ...(first && !first.done ? { selection: { anchor: first.value.from, head: first.value.to } } : {}),
      });
    });
    dom.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSearchPanel(view);
      } else if (event.key === 'Enter' && event.target === input) {
        event.preventDefault();
        (event.shiftKey ? findPrevious : findNext)(view);
      }
    });
    dom.append(input, count);
    for (const [name, label, action] of [
      ['Vorheriger Treffer', '↑', findPrevious],
      ['Nächster Treffer', '↓', findNext],
      ['Suche schließen', '×', closeSearchPanel],
    ] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.setAttribute('aria-label', name);
      button.title = name;
      button.addEventListener('click', () => { action(view); });
      dom.append(button);
    }
    updateCount();
    return {
      dom, top: true,
      mount: () => { input.focus(); input.select(); },
      update() { input.value = getSearchQuery(view.state).search; updateCount(); },
    };
  },
});
