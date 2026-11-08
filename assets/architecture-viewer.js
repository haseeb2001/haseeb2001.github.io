(() => {
  // Parent messages also work for local file previews, whose origins are opaque.
  function applyTheme(theme) {
    if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;
  }
  addEventListener('message', event => {
    if (event.source === parent && event.data?.type === 'portfolio-theme') applyTheme(event.data.theme);
  });
  if (parent !== window) parent.postMessage({type: 'architecture-theme-request'}, location.protocol === 'file:' ? '*' : location.origin);
  addEventListener('storage', event => { if (event.key === 'mh-theme') applyTheme(event.newValue); });
  const preview = new URLSearchParams(location.search).has('preview');
  document.documentElement.classList.toggle('preview', preview);
  const stage = document.querySelector('.viewport, .frame, .stage');
  const diagram = stage?.querySelector('svg[role="img"]');
  if (!diagram) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  if (preview) {
    // Embedded mode always shows the complete SVG, with motion as its only control.
    const controls = document.createElement('div');
    controls.className = 'viewer-toolbar';
    const button = document.createElement('button');
    button.type = 'button';
    controls.append(button);
    stage.after(controls);
    let userPaused = false;
    let visible = false;
    function syncPreviewMotion() {
      const paused = userPaused || reducedMotion.matches || !visible || document.hidden;
      stage.classList.toggle('paused', paused);
      if (paused) diagram.pauseAnimations?.(); else diagram.unpauseAnimations?.();
      button.textContent = reducedMotion.matches ? 'Reduced motion enabled' : userPaused ? 'Play flow' : 'Pause flow';
      button.setAttribute('aria-label', userPaused ? 'Play architecture animation' : 'Pause architecture animation');
      button.setAttribute('aria-pressed', String(!userPaused && !reducedMotion.matches));
      button.disabled = reducedMotion.matches;
    }
    button.addEventListener('click', () => { userPaused = !userPaused; syncPreviewMotion(); });
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      syncPreviewMotion();
    }).observe(stage);
    document.addEventListener('visibilitychange', syncPreviewMotion);
    reducedMotion.addEventListener('change', syncPreviewMotion);
    syncPreviewMotion();
    return;
  }
  let paused = true;
  let enlarged = false;
  const toolbar = document.createElement('div');
  toolbar.className = 'viewer-toolbar';
  toolbar.setAttribute('role', 'group');
  toolbar.setAttribute('aria-label', 'Diagram controls');
  toolbar.innerHTML = '<button type="button" data-action="size" aria-pressed="false">Enlarge diagram</button><button type="button" data-action="pause" aria-pressed="false">Play animation</button>';
  stage.before(toolbar);
  stage.tabIndex = 0;
  stage.setAttribute('role', 'region');
  stage.setAttribute('aria-label', 'Architecture diagram. Enlarge for details, then use arrow keys to explore.');
  const sizeButton = toolbar.querySelector('[data-action="size"]');
  const motionButton = toolbar.querySelector('[data-action="pause"]');
  function fitDiagram() {
    const box = diagram.viewBox.baseVal;
    const maxHeight = parseFloat(getComputedStyle(stage).maxHeight);
    const availableHeight = Number.isFinite(maxHeight) ? maxHeight : window.innerHeight * .76;
    const fittedHeight = stage.clientWidth * box.height / box.width;
    const scale = enlarged
      ? Math.min(6, Math.max(1, box.width * 1.2 / Math.max(1, stage.clientWidth)))
      : Math.min(1, availableHeight / Math.max(1, fittedHeight));
    diagram.style.width = `${scale * 100}%`;
    sizeButton.textContent = enlarged ? 'Fit to view' : 'Enlarge diagram';
    sizeButton.setAttribute('aria-pressed', String(enlarged));
  }
  function renderMotion() {
    stage.classList.toggle('paused', paused || document.hidden);
    if (paused || document.hidden) diagram.pauseAnimations?.(); else diagram.unpauseAnimations?.();
    motionButton.textContent = paused ? 'Play animation' : 'Pause animation';
    motionButton.setAttribute('aria-pressed', String(!paused));
    motionButton.hidden = reducedMotion.matches;
  }
  toolbar.addEventListener('click', event => {
    const action = event.target.closest('button')?.dataset.action;
    if (action === 'pause' && !reducedMotion.matches) { paused = !paused; renderMotion(); }
    if (action === 'size') {
      enlarged = !enlarged;
      stage.scrollTo(0, 0);
      fitDiagram();
    }
  });
  stage.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (!['+', '=', '-', '0'].includes(event.key)) return;
    event.preventDefault();
    enlarged = ['+', '='].includes(event.key);
    stage.scrollTo(0, 0);
    fitDiagram();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && window.parent !== window) window.parent.postMessage('close-architecture', location.protocol === 'file:' || location.origin === 'null' ? '*' : location.origin);
  });
  document.addEventListener('visibilitychange', renderMotion);
  reducedMotion.addEventListener('change', event => { if (event.matches) paused = true; renderMotion(); });
  new ResizeObserver(fitDiagram).observe(stage);
  renderMotion();
  fitDiagram();
})();
