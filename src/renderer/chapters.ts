import { ensureSyntaxTree } from '@codemirror/language';
import { EditorView } from '@codemirror/view';

type Chapter = { from: number; label: string; level: number };

const jumpMargin = 90;

function chapters(view: EditorView): Chapter[] {
  const text = view.state.doc.toString();
  const frontmatter = /^\uFEFF?(---|\+\+\+)[ \t]*\n[\s\S]*?\n(?:\1|\.\.\.)[ \t]*(?:\n|$)/.exec(text);
  const result: Chapter[] = [];
  ensureSyntaxTree(view.state, view.state.doc.length, 1000)?.iterate({
    enter(node) {
      const heading = /^(?:ATX|Setext)Heading([12])$/.exec(node.name);
      if (!heading || node.from < (frontmatter?.[0].length ?? 0)) return;
      const marks = node.node.getChildren('HeaderMark');
      let label = text.slice(node.from, node.to);
      for (const mark of marks.reverse()) label = label.slice(0, mark.from - node.from) + label.slice(mark.to - node.from);
      result.push({ from: node.from, label: label.trim() || 'Ohne Titel', level: Number(heading[1]) });
    },
  });
  return result;
}

export function createChapterIndex(getView: () => EditorView | null) {
  const panel = document.createElement('section');
  panel.id = 'chapter-index';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Kapitelnavigation');
  const title = document.createElement('h2');
  title.textContent = 'Kapitelindex';
  const list = document.createElement('div');
  list.tabIndex = 0;
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Kapitelindex');
  const empty = document.createElement('p');
  empty.textContent = 'Keine Kapitel vorhanden.';
  panel.append(title, list, empty);
  document.body.append(panel);
  let entries: Chapter[] = [];
  let selected = 0;
  let returnFocus: HTMLElement | null = null;
  let phase: 'idle' | 'holding' | 'blocked' = 'idle';
  let transient = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function close(restoreFocus = true) {
    clearTimeout(timer);
    if (phase === 'holding') phase = 'blocked';
    if (panel.hidden) return;
    panel.hidden = true;
    if (restoreFocus) {
      const target = returnFocus?.isConnected && !returnFocus.closest('#menu') ? returnFocus : getView()?.contentDOM;
      target?.focus({ preventScroll: true });
    }
  }
  function select(index: number) {
    selected = Math.max(0, Math.min(entries.length - 1, index));
    Array.from(list.children).forEach((option, position) => option.setAttribute('aria-selected', String(position === selected)));
    const option = list.children[selected];
    if (option) {
      list.setAttribute('aria-activedescendant', option.id);
      option.scrollIntoView({ block: 'nearest' });
    } else list.removeAttribute('aria-activedescendant');
  }
  function confirm() {
    const chapter = entries[selected];
    close();
    const view = getView();
    if (chapter && view) view.dispatch({ effects: EditorView.scrollIntoView(chapter.from, { y: 'start', yMargin: jumpMargin }) });
  }
  function refresh() {
    const view = getView();
    if (panel.hidden || !view) return;
    entries = chapters(view);
    // A jumped-to heading sits jumpMargin below the viewport top. Near the end the page cannot
    // scroll that far, so headings visible down to the viewport bottom count as reached.
    const scroller = document.scrollingElement ?? document.documentElement;
    const atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
    const height = (atEnd ? scroller.clientHeight - 1 : jumpMargin) - view.documentTop;
    const reached = view.lineBlockAtHeight(Math.max(0, Math.min(view.contentHeight - 1, height))).from;
    let current = 0;
    entries.forEach((chapter, index) => { if (chapter.from <= reached) current = index; });
    list.replaceChildren(...entries.map((chapter, index) => {
      const option = document.createElement('div');
      option.id = `chapter-${index}`;
      option.setAttribute('role', 'option');
      option.className = `chapter-level-${chapter.level}`;
      option.textContent = chapter.label;
      if (index === current) option.setAttribute('aria-current', 'location');
      option.addEventListener('click', () => { select(index); confirm(); });
      return option;
    }));
    empty.hidden = entries.length > 0;
    select(current);
  }
  function open(whileHeld = false) {
    if (!panel.hidden || !getView()) return;
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    transient = whileHeld;
    panel.hidden = false;
    refresh();
    list.focus({ preventScroll: true });
  }
  list.addEventListener('keydown', event => {
    if (event.key === 'Tab') close();
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', 'Escape'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') close();
      else if (event.key === 'Enter') confirm();
      else select(event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1 : selected + (event.key === 'ArrowDown' ? 1 : -1));
    }
  });
  document.addEventListener('pointerdown', event => {
    if (event.target instanceof Node && !list.contains(event.target)) close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Alt' && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.code !== 'AltRight' && !event.getModifierState('AltGraph')) {
      if (event.repeat || phase !== 'idle') return;
      phase = 'holding';
      timer = setTimeout(() => { if (phase === 'holding') open(true); }, 300);
      return;
    }
    if (phase !== 'idle' && !event.ctrlKey && !event.metaKey && !event.shiftKey && !panel.hidden && ['ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter', 'Escape'].includes(event.key)) return;
    if (phase !== 'idle' || event.key === 'AltGraph' || event.key === 'Alt') {
      clearTimeout(timer);
      phase = 'blocked';
      if (transient) close();
    }
  }, true);
  document.addEventListener('keyup', event => {
    if (event.key !== 'Alt' && event.key !== 'AltGraph') return;
    clearTimeout(timer);
    phase = 'idle';
    if (transient) close();
  }, true);
  function windowBlurred() {
    close(false);
    phase = 'idle';
  }
  window.addEventListener('blur', windowBlurred);
  return { open, close, refresh, windowBlurred, hasFocus: () => panel.contains(document.activeElement) };
}
