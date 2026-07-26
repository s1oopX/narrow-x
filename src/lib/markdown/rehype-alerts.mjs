import { visit } from 'unist-util-visit';

const alertTypes = new Map([
  ['NOTE', 'note'],
  ['TIP', 'tip'],
  ['IMPORTANT', 'important'],
  ['WARNING', 'warning'],
  ['CAUTION', 'caution']
]);

function firstText(node) {
  if (!node) return null;
  if (node.type === 'text') return node;
  if (!Array.isArray(node.children)) return null;
  for (const child of node.children) {
    const found = firstText(child);
    if (found) return found;
  }
  return null;
}

export function rehypeAlerts() {
  return (tree) => {
    visit(tree, 'element', (node) => {
      if (node.tagName !== 'blockquote') return;

      const firstParagraph = node.children?.find(
        (item) => item.type === 'element' && item.tagName === 'p'
      );
      const textNode = firstText(firstParagraph);
      const match = textNode?.value?.match(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/);

      if (match) {
        const type = alertTypes.get(match[1]);
        textNode.value = textNode.value.replace(match[0], '');
        node.properties ||= {};
        node.properties.className = ['markdown-alert', `markdown-alert-${type}`];
        node.properties.dataAlert = type;
        node.children.unshift({
          type: 'element',
          tagName: 'p',
          properties: { className: ['markdown-alert-title'] },
          children: [{ type: 'text', value: match[1][0] + match[1].slice(1).toLowerCase() }]
        });
      }
    });
  };
}
