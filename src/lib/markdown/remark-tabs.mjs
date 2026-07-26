import { visit } from 'unist-util-visit';

function textFrom(node) {
  if (!node) return '';
  if (node.type === 'text' || node.type === 'inlineCode') return node.value || '';
  return (node.children || []).map(textFrom).join('');
}

function isTabDirective(node) {
  return node.type === 'containerDirective' && node.name === 'tab';
}

function directiveLabel(node) {
  const first = node.children?.[0];
  return first?.data?.directiveLabel ? first : undefined;
}

function tabTitle(node, index) {
  const attrs = node.attributes || {};
  const label = directiveLabel(node);
  return String(attrs.title || attrs.label || (label ? textFrom(label).trim() : '') || `Tab ${index + 1}`);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

export function remarkTabs() {
  return (tree, file) => {
    const tablistLabel = /[/\\]zh-cn[/\\]/.test(String(file?.path || file?.history?.[0] || ''))
      ? '内容选项卡'
      : 'Content tabs';
    let groupCount = 0;

    visit(tree, 'containerDirective', (node, index, parent) => {
      if (!parent || typeof index !== 'number' || node.name !== 'tabs') return;

      const children = node.children || [];
      const tabNodes = children.filter(isTabDirective);
      if (tabNodes.length === 0) return;

      const extraNodes = children.filter((child) => !isTabDirective(child));
      const groupId = `markdown-tabs-${groupCount}`;
      groupCount += 1;
      const labels = tabNodes.map(tabTitle).map(escapeHtml);

      node.data ||= {};
      node.data.hName = 'div';
      node.data.hProperties = {
        className: ['markdown-tabs', 'not-prose'],
        dataTabs: '',
        id: groupId
      };

      node.children = [
        {
          type: 'html',
          value: `<div class="tabs-nav-shell"><div class="tabs-nav" role="tablist" aria-label="${tablistLabel}">${labels.map((label, tabIndex) => {
            const selected = tabIndex === 0 ? 'true' : 'false';
            const tabId = `${groupId}-tab-${tabIndex}`;
            const panelId = `${groupId}-panel-${tabIndex}`;
            return `<button class="tabs-trigger" type="button" role="tab" id="${tabId}" aria-selected="${selected}" aria-controls="${panelId}" tabindex="${tabIndex === 0 ? '0' : '-1'}">${label}</button>`;
          }).join('')}</div></div>`
        },
        {
          type: 'containerDirective',
          name: 'tabs-panels',
          children: tabNodes.map((tab, tabIndex) => {
            const label = directiveLabel(tab);
            if (label) tab.children = (tab.children || []).filter((child) => child !== label);
            tab.data ||= {};
            tab.data.hName = 'section';
            tab.data.hProperties = {
              className: ['tabs-panel'],
              role: 'tabpanel',
              id: `${groupId}-panel-${tabIndex}`,
              ariaLabelledBy: `${groupId}-tab-${tabIndex}`,
              dataTabsPanel: '',
              hidden: tabIndex === 0 ? undefined : true
            };
            return tab;
          }),
          data: {
            hName: 'div',
            hProperties: { className: ['tabs-panels'] }
          }
        }
      ];

      // Authored content that sits between/around the tab directives is not
      // part of any panel; emit it after the tab group instead of dropping it.
      if (extraNodes.length > 0) {
        parent.children.splice(index + 1, 0, ...extraNodes);
      }
    });
  };
}
