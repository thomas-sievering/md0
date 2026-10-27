import { ensureSyntaxTree } from '@codemirror/language';
import { EditorView } from '@codemirror/view';

function decodeDestination(value: string) {
  const decoder = document.createElement('textarea');
  return value.replace(/^<|>$/g, '').replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])|&(?:#\d+|#x[\da-f]+|[a-z][\da-z]+);/gi, (match: string, escaped: string | undefined) => {
    if (escaped) return escaped;
    decoder.innerHTML = match;
    return decoder.value;
  });
}

export function documentLinks(open: (url: string) => void) {
  return EditorView.domEventHandlers({
    mousedown(event, view) {
      if (event.button !== 0 || !event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return false;
      const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (position === null) return false;
      const tree = ensureSyntaxTree(view.state, view.state.doc.length, 100);
      if (!tree) return false;
      let node = tree.resolveInner(position, 1);
      while (node.parent && node.name !== 'Link' && node.name !== 'Autolink') node = node.parent;
      if (node.name !== 'Link' && node.name !== 'Autolink') return false;
      const source = (from: number, to: number) => view.state.doc.sliceString(from, to);
      const destination = node.getChild('URL');
      let url = destination ? source(destination.from, destination.to) : null;
      if (!url && node.name === 'Link') {
        const label = node.getChild('LinkLabel');
        const normalize = (value: string) => value.slice(1, -1).trim().replace(/\s+/g, ' ').toLowerCase();
        const closing = node.getChildren('LinkMark').find(mark => source(mark.from, mark.to) === ']');
        if (!closing) return false;
        const reference = normalize(label && source(label.from, label.to) !== '[]' ? source(label.from, label.to) : source(node.from, closing.to));
        tree.iterate({ enter(candidate) {
          if (url || candidate.name !== 'LinkReference') return;
          const name = candidate.node.getChild('LinkLabel');
          const target = candidate.node.getChild('URL');
          if (name && target && normalize(source(name.from, name.to)) === reference) url = source(target.from, target.to);
        } });
      }
      if (!url) return false;
      open(node.name === 'Autolink' ? url : decodeDestination(url));
      return true;
    },
  });
}
