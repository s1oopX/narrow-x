type ColorMode = 'light' | 'dark';

const diagrams = [...document.querySelectorAll<HTMLElement>('[data-mermaid="true"]')];

if (diagrams.length > 0) {
  import('mermaid').then(({ default: mermaid }) => {
    type RenderResult = Awaited<ReturnType<typeof mermaid.render>>;

    const sources = diagrams.map((diagram) => diagram.textContent ?? '');
    let pendingMode: ColorMode | null = null;
    let rendering = false;
    let generation = 0;
    let renderedMode: ColorMode | null = null;

    const renderDiagrams = async (mode: ColorMode) => {
      pendingMode = mode;
      if (rendering) return;

      rendering = true;
      try {
        while (pendingMode) {
          const activeMode = pendingMode;
          pendingMode = null;
          // 已经按当前模式渲染过时跳过，避免重复通知触发的整页重绘。
          if (activeMode === renderedMode) continue;
          const renderGeneration = ++generation;

          mermaid.initialize({
            startOnLoad: false,
            // Pin the sanitizer even if a future mermaid changes its default.
            securityLevel: 'strict',
            theme: activeMode === 'dark' ? 'dark' : 'default'
          });

          const results: Array<RenderResult | null> = [];
          for (const [index, source] of sources.entries()) {
            const renderId = `mermaid-${renderGeneration}-${index}`;
            try {
              results.push(await mermaid.render(renderId, source));
            } catch (error) {
              // 单个图表语法错误时保留其源码，不影响其余图表渲染。
              console.error(`Failed to render Mermaid diagram ${index + 1}.`, error);
              document.getElementById(renderId)?.remove();
              results.push(null);
            }
          }

          // 新的模式请求已经到达时丢弃本轮结果，避免旧主题覆盖最新选择。
          if (pendingMode) continue;

          results.forEach((result, index) => {
            if (!result) return;
            const diagram = diagrams[index];
            diagram.innerHTML = result.svg;
            result.bindFunctions?.(diagram);
          });
          renderedMode = activeMode;
        }
      } catch (error) {
        console.error('Failed to render Mermaid diagrams.', error);
      } finally {
        rendering = false;
        if (pendingMode) void renderDiagrams(pendingMode);
      }
    };

    const currentMode = (): ColorMode =>
      document.documentElement.classList.contains('dark') ? 'dark' : 'light';

    document.addEventListener('narrow-x:color-mode-change', (event) => {
      const mode = (event as CustomEvent<{ mode?: ColorMode }>).detail?.mode;
      void renderDiagrams(mode === 'dark' || mode === 'light' ? mode : currentMode());
    });

    void renderDiagrams(currentMode());
  });
}
