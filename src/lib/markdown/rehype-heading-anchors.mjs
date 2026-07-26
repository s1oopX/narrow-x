import { visit } from 'unist-util-visit';

const headingTags = new Set(['h2', 'h3', 'h4', 'h5', 'h6']);

function textContent(node) {
  if (!node) return '';
  if (node.type === 'text') return node.value || '';
  if (!Array.isArray(node.children)) return '';
  return node.children.map(textContent).join('');
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

const zhPath = /[/\\]zh-cn[/\\]/;

export function rehypeHeadingAnchors() {
  return (tree, file) => {
    const anchorLabel = zhPath.test(String(file?.path || file?.history?.[0] || ''))
      ? '链接到此小节'
      : 'Link to this section';
    const used = new Map();
    const emitted = new Set();

    visit(tree, 'element', (node) => {
      if (!headingTags.has(node.tagName)) return;

      node.properties ||= {};
      const existingId = node.properties.id;
      const base = String(existingId || slugify(textContent(node)) || 'section');
      let count = used.get(base) || 0;
      let id = count === 0 ? base : `${base}-${count + 1}`;
      // A base like "setup-2" can collide with an id already emitted for the
      // "setup" base; keep bumping until the id itself is unique.
      while (emitted.has(id)) {
        count += 1;
        id = `${base}-${count + 1}`;
      }
      used.set(base, count + 1);
      emitted.add(id);
      node.properties.id = id;
      node.properties.className = [...(node.properties.className || []), 'group', 'scroll-m-24'];

      node.children ||= [];
      node.children.push({
        type: 'element',
        tagName: 'a',
        properties: {
          href: `#${id}`,
          className: ['heading-anchor'],
          ariaLabel: anchorLabel
        },
        children: [{ type: 'text', value: '#' }]
      });
    });
  };
}
