import { SKIP, visit } from 'unist-util-visit';

export function rehypeMermaid() {
  return (tree) => {
    visit(tree, 'element', (node, index, parent) => {
      if (
        node.tagName !== 'pre' ||
        !parent ||
        typeof index !== 'number' ||
        node.children?.[0]?.type !== 'element' ||
        node.children[0].tagName !== 'code'
      ) {
        return;
      }

      const code = node.children[0];
      const className = code.properties?.className || [];
      if (className.includes('language-mermaid')) {
        parent.children[index] = {
          type: 'element',
          tagName: 'div',
          properties: { className: ['mermaid'], dataMermaid: 'true' },
          children: code.children || []
        };
        return SKIP;
      }
    });
  };
}
