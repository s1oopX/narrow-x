import { SKIP, visit } from 'unist-util-visit';

function isWhitespace(node) {
  return node.type === 'text' && /^\s*$/.test(node.value || '');
}

function imageChildren(paragraph) {
  const children = paragraph.children || [];
  if (!children.every((child) => isWhitespace(child) || (child.type === 'element' && child.tagName === 'img'))) {
    return [];
  }
  return children.filter((child) => child.type === 'element' && child.tagName === 'img');
}

function figureForImage(img) {
  const title = img.properties?.title;
  img.properties ||= {};
  img.properties.loading ||= 'lazy';
  img.properties.decoding ||= 'async';
  const existingClasses = Array.isArray(img.properties.className)
    ? img.properties.className
    : img.properties.className
      ? [img.properties.className]
      : [];
  img.properties.className = [...existingClasses, 'mx-auto', 'block', 'max-h-[30rem]', 'w-auto', 'max-w-full', 'cursor-zoom-in', 'object-contain'];

  const children = [
    {
      type: 'element',
      tagName: 'div',
      properties: {
        className: ['image-container', 'flex', 'justify-center', 'overflow-hidden', 'rounded-[var(--radius-panel)]', 'bg-muted/20']
      },
      children: [img]
    }
  ];

  if (title) {
    children.push({
      type: 'element',
      tagName: 'figcaption',
      properties: { className: ['image-caption', 'mt-2.5', 'text-center', 'text-sm', 'text-muted-foreground'] },
      children: [{ type: 'text', value: String(title) }]
    });
  }

  // `not-prose` opts the figure out of the typography plugin so the utility
  // classes fully control its appearance. The semantic class names are kept as
  // hooks for the gallery/lightbox client script.
  return {
    type: 'element',
    tagName: 'figure',
    properties: {
      className: ['image-figure', 'not-prose', 'my-8']
    },
    children
  };
}

function galleryForImages(images) {
  return {
    type: 'element',
    tagName: 'div',
    properties: {
      className: ['markdown-gallery', 'not-prose', 'my-8']
    },
    children: images.map((img) => figureForImage(img))
  };
}

export function rehypeImageGroups() {
  return (tree) => {
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'p' || !parent || typeof index !== 'number') return;

      const images = imageChildren(node);
      if (images.length === 1) {
        parent.children[index] = figureForImage(images[0]);
        return SKIP;
      }
      if (images.length > 1) {
        parent.children[index] = galleryForImages(images);
        return SKIP;
      }
    });
  };
}
