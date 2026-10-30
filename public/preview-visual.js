(function () {
  const expectedParentOrigin = '__MUHELY_PARENT_ORIGIN__';
  let busy = false;
  const capture = async (viewport) => {
    if (!viewport || !Number.isInteger(viewport.width) || !Number.isInteger(viewport.height))
      throw Error('Hiányzó nézetméret.');
    const resizeDeadline = Date.now() + 2000;
    while (window.innerWidth !== viewport.width || window.innerHeight !== viewport.height) {
      if (Date.now() > resizeDeadline) throw Error('Az előnézet méretváltása nem fejeződött be.');
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    // postMessage can arrive before the browser has applied the iframe resize.
    await new Promise((resolve) => setTimeout(resolve, 40));
    if (!window.htmlToImage) throw Error('A képi exportáló nem érhető el.');
    const width = window.innerWidth,
      height = window.innerHeight;
    const controller = new AbortController();
    let deadline;
    const warnings = [];
    const clone = document.body.cloneNode(true);
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none;z-index:-2147483647;overflow:hidden';
    host.style.width = width + 'px';
    const cache = new Map();
    const asset = async (url) => {
      if (!url || url.startsWith('data:')) return url;
      if (!cache.has(url))
        cache.set(
          url,
          (async () => {
            const response = await fetch(url, { credentials: 'omit', signal: controller.signal });
            if (!response.ok) throw Error('Egy képi erőforrás nem tölthető be az exporthoz.');
            const reader = response.body.getReader();
            const chunks = [];
            let size = 0;
            try {
              for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                size += value.byteLength;
                if (size > 6_000_000) throw Error('Egy képi erőforrás túl nagy az exporthoz.');
                chunks.push(value);
              }
            } finally {
              await reader.cancel().catch(() => undefined);
            }
            return new Promise((resolve, reject) => {
              const file = new FileReader();
              file.onerror = reject;
              file.onload = () => resolve(file.result);
              file.readAsDataURL(
                new Blob(chunks, { type: response.headers.get('content-type') || 'application/octet-stream' }),
              );
            });
          })(),
        );
      return cache.get(url);
    };
    const originals = [document.body, ...document.body.querySelectorAll('*')];
    const copies = [clone, ...clone.querySelectorAll('*')];
    const perform = async () => {
      if (originals.length > 2500) throw Error('Az oldal képi exportja ennél a méretnél nem megbízható.');
      for (let index = 0; index < originals.length; index++) {
        if (controller.signal.aborted) throw Error('Az export időtúllépéssel leállt.');
        const original = originals[index],
          copy = copies[index];
        if (!(original instanceof HTMLElement || original instanceof SVGElement)) continue;
        if (['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED'].includes(original.tagName)) {
          copy.remove();
          continue;
        }
        const style = getComputedStyle(original);
        if (style.cssText) copy.style.cssText = style.cssText;
        else
          for (const property of style)
            copy.style.setProperty(property, style.getPropertyValue(property), style.getPropertyPriority(property));
        copy.style.animation = 'none';
        copy.style.transition = 'none';
        for (const property of ['background-image', 'mask-image', '-webkit-mask-image']) {
          let value = style.getPropertyValue(property);
          for (const match of value.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
            if (match[1].startsWith('#')) continue;
            value = value.replace(match[0], 'url("' + (await asset(match[1])) + '")');
          }
          if (value) copy.style.setProperty(property, value);
        }
        if (original instanceof HTMLImageElement) {
          copy.removeAttribute('srcset');
          copy.src = await asset(original.currentSrc || original.src);
        }
        if (original instanceof HTMLVideoElement || original instanceof HTMLCanvasElement) {
          let image;
          try {
            const canvas = original instanceof HTMLCanvasElement ? original : document.createElement('canvas');
            if (original instanceof HTMLVideoElement) {
              canvas.width = original.videoWidth;
              canvas.height = original.videoHeight;
              if (!canvas.width || !canvas.height) throw Error('Videó még nem látható.');
              canvas.getContext('2d').drawImage(original, 0, 0);
            }
            image = canvas.toDataURL('image/png');
          } catch {
            if (!(original instanceof HTMLVideoElement) || !original.poster)
              throw Error('A vászon vagy videó képe nem rögzíthető.');
            image = await asset(original.poster);
            warnings.push(
              'A videó helyén a poszterképe szerepel; a mozgás és a videó aktuális képkockája nem értékelt.',
            );
          }
          const replacement = document.createElement('img');
          replacement.src = image;
          replacement.alt = '';
          replacement.style.cssText = copy.style.cssText;
          copy.replaceWith(replacement);
        }
        if (copy instanceof HTMLInputElement) {
          copy.value = '';
          copy.removeAttribute('value');
          copy.removeAttribute('checked');
          copy.checked = false;
        }
        if (copy instanceof HTMLTextAreaElement) {
          copy.value = '';
          copy.textContent = '';
        }
        if (copy instanceof HTMLSelectElement) copy.replaceChildren(document.createElement('option'));
        if (copy instanceof HTMLElement && copy.isContentEditable) copy.textContent = 'Szerkeszthető tartalom';
      }
      clone.querySelectorAll('picture source').forEach((source) => source.remove());
      if (controller.signal.aborted) throw Error('Az export időtúllépéssel leállt.');
      host.appendChild(clone);
      document.body.appendChild(host);
      const fontEmbedCSS = await window.htmlToImage.getFontEmbedCSS(document.body, {
        preferredFontFormat: 'woff2',
        fetchRequestInit: { credentials: 'omit', signal: controller.signal },
      });
      if (controller.signal.aborted) throw Error('Az export időtúllépéssel leállt.');
      if (document.fonts?.size && !fontEmbedCSS.includes('data:'))
        throw Error('Az egyedi betűtípus nem ágyazható be megbízhatóan.');
      const canvas = await window.htmlToImage.toCanvas(clone, {
        width,
        height,
        canvasWidth: width > 640 ? 640 : width,
        canvasHeight: Math.round(height * (width > 640 ? 640 / width : 1)),
        pixelRatio: 1,
        fontEmbedCSS,
        includeQueryParams: true,
        fetchRequestInit: { credentials: 'omit', signal: controller.signal },
        style: {
          position: 'relative',
          left: '0',
          top: '0',
          margin: '0',
          width: width + 'px',
          height: height + 'px',
          transform: 'none',
        },
        onImageErrorHandler: () => {
          throw Error('A kép hiányosan rögzült.');
        },
      });
      const image = canvas.toDataURL('image/jpeg', 0.65);
      if (image.length > 800000 || image.length < 500) throw Error('A rögzített kép nem használható.');
      return {
        checked: true,
        viewport: { width, height },
        issues: [],
        image,
        warnings: [...new Set(warnings)],
        captureMethod: 'dom-image-export',
      };
    };
    try {
      return await Promise.race([
        perform(),
        new Promise((_, reject) => {
          deadline = setTimeout(() => reject(Error('Az export időtúllépéssel leállt.')), 25000);
        }),
      ]);
    } finally {
      clearTimeout(deadline);
      controller.abort();
      host.remove();
    }
  };
  window.addEventListener('message', async (event) => {
    if (
      event.source !== window.parent ||
      event.origin !== expectedParentOrigin ||
      event.data?.type !== 'MUHELY_PREVIEW_IMAGE_REQUEST' ||
      typeof event.data.requestId !== 'string' ||
      busy
    )
      return;
    busy = true;
    try {
      const report = await capture(event.data.viewport);
      window.parent.postMessage(
        { type: 'MUHELY_PREVIEW_IMAGE_RESULT', requestId: event.data.requestId, report },
        expectedParentOrigin,
      );
    } catch {
      window.parent.postMessage(
        {
          type: 'MUHELY_PREVIEW_IMAGE_RESULT',
          requestId: event.data.requestId,
          report: { checked: false, error: 'A megjelenés nem rögzíthető teljesen. Nem történt képi jóváhagyás.' },
        },
        expectedParentOrigin,
      );
    } finally {
      busy = false;
    }
  });
})();
