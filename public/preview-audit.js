(function () {
  if (window.__muhelyPreviewAuditInstalled) return;
  window.__muhelyPreviewAuditInstalled = true;
  const expectedParentOrigin = '__MUHELY_PARENT_ORIGIN__';
  const runtimeErrors = [];
  const remember = (message) => {
    if (runtimeErrors.length < 10) runtimeErrors.push(String(message || 'Futási hiba').slice(0, 400));
  };
  window.addEventListener('error', (event) => { if (event.message) remember(event.message); });
  window.addEventListener('unhandledrejection', (event) => remember(event.reason?.message || event.reason));

  function selector(element) {
    return (element.tagName.toLowerCase() + (element.id ? '#' + element.id : '')).slice(0, 150);
  }
  function visible(element) {
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0;
  }
  function clipped(element) {
    for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      if (['hidden', 'clip', 'auto', 'scroll'].includes(getComputedStyle(parent).overflowX)) return true;
    }
    return false;
  }
  function collect() {
    const issues = [];
    const add = (code, severity, element, message) => {
      if (issues.length < 40) issues.push({ code, severity, selector: element ? selector(element) : 'document', message });
    };
    const width = window.innerWidth;
    const height = window.innerHeight;
    const root = document.documentElement;
    const body = document.body;
    if (!body) return { checked: false, error: 'Az oldal még nem töltődött be.' };
    if (!(body.innerText ?? body.textContent ?? '').trim() && !Array.from(body.querySelectorAll('img,video,canvas,svg')).some(visible)) {
      add('blank-page', 'error', body, 'Az oldal üresnek látszik.');
    }
    if (document.querySelector('vite-error-overlay')) add('build-overlay', 'error', null, 'Az előnézetben fordítási hiba látszik.');
    for (const message of runtimeErrors) add('runtime-error', 'error', null, message);
    const pageWidth = Math.max(root.scrollWidth, body.scrollWidth);
    if (pageWidth > width + 3) {
      add('horizontal-overflow', 'error', body, 'Az oldal szélesebb a képernyőnél (' + pageWidth + ' / ' + width + ' px).');
      for (const element of Array.from(body.querySelectorAll('*')).slice(0, 2000)) {
        const rect = element.getBoundingClientRect();
        if (visible(element) && !clipped(element) && (rect.right > width + 3 || rect.left < -3)) {
          add('overflow-element', 'suggestion', element, 'Ez az elem kilóghat a képernyőről.');
          if (issues.filter((issue) => issue.code === 'overflow-element').length >= 6) break;
        }
      }
    }
    let pendingImages = 0;
    for (const image of Array.from(document.images).slice(0, 200)) {
      if (!visible(image)) continue;
      if (image.complete && image.naturalWidth === 0 && (image.currentSrc || image.getAttribute('src'))) {
        add('broken-image', 'error', image, 'A kép nem töltődött be.');
      } else if (!image.complete) pendingImages++;
    }
    for (const media of Array.from(body.querySelectorAll('video,audio')).slice(0, 50)) {
      if (media.error) add('broken-media', 'error', media, 'A videó vagy hang nem játszható le.');
    }
    for (const link of Array.from(body.querySelectorAll('a[href^="#"]')).slice(0, 200)) {
      const hash = link.getAttribute('href');
      if (!hash || hash === '#' || !visible(link)) continue;
      try {
        const id = decodeURIComponent(hash.slice(1));
        if (!document.getElementById(id) && !document.getElementsByName(id).length) {
          add('missing-anchor', 'error', link, 'A belső hivatkozás célja nem létezik: ' + hash.slice(0, 100));
        }
      } catch { add('invalid-anchor', 'error', link, 'Érvénytelen belső hivatkozás.'); }
    }
    for (const button of Array.from(body.querySelectorAll('button')).slice(0, 200)) {
      if (!visible(button)) continue;
      const labelledBy = (button.getAttribute('aria-labelledby') || '').split(/\s+/).some((id) => document.getElementById(id)?.textContent.trim());
      if (!button.textContent.trim() && !button.getAttribute('aria-label') && !button.title && !labelledBy && !button.querySelector('img[alt]:not([alt=""])')) {
        add('unnamed-button', 'suggestion', button, 'A gombnak nincs olvasható neve.');
      }
    }
    if (pendingImages) add('pending-images', 'suggestion', null, pendingImages + ' kép még töltődik vagy késleltetve töltődik.');
    return { checked: true, viewport: { width, height }, title: document.title.slice(0, 150), pageWidth,
      issues, pendingImages, coverage: ['rendered-content', 'horizontal-overflow', 'image-elements', 'media-errors', 'local-anchors', 'button-names', 'uncaught-errors'],
      limits: ['No screenshot or aesthetic rating.', 'No form submission, link clicking, external URL checks or CSS background-image validation.'] };
  }
  window.addEventListener('message', async (event) => {
    if (event.source !== window.parent || event.origin !== expectedParentOrigin || event.data?.type !== 'MUHELY_PREVIEW_AUDIT_REQUEST' || typeof event.data.requestId !== 'string') return;
    const requestId = event.data.requestId;
    // Allow layout, fonts and existing image requests to settle without hanging or leaking listeners.
    const cleanups = [];
    const waitFor = (target, events) => new Promise((resolve) => {
      for (const type of events) {
        target.addEventListener(type, resolve, { once: true });
        cleanups.push(() => target.removeEventListener(type, resolve));
      }
    });
    let settleTimer;
    try {
      await Promise.race([
        Promise.all([document.fonts?.ready,
          document.readyState === 'complete' ? Promise.resolve() : waitFor(window, ['load']),
          ...Array.from(document.images).filter((image) => !image.complete).slice(0, 100).map((image) => waitFor(image, ['load', 'error']))]),
        new Promise((resolve) => { settleTimer = setTimeout(resolve, 1500); }),
      ]);
    } finally {
      clearTimeout(settleTimer);
      cleanups.forEach((cleanup) => cleanup());
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
    try {
      window.parent.postMessage({ type: 'MUHELY_PREVIEW_AUDIT_RESULT', requestId, report: collect() }, '*');
    } catch {
      window.parent.postMessage({ type: 'MUHELY_PREVIEW_AUDIT_RESULT', requestId, report: { checked: false, error: 'Az előnézet nem vizsgálható.' } }, '*');
    }
  });
})();
