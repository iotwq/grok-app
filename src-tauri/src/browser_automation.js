// Expression evaluated only inside the external page. No Host/IPC APIs or secrets.
(function browserAction(action, args) {
  try {
    const key = '__grokBrowserElements';
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
    };
    const signature = (el) => JSON.stringify([
      el.tagName, el.getAttribute('role'), el.getAttribute('type'),
      el.getAttribute('href'), el.getAttribute('aria-label'), el.textContent?.slice(0, 300),
    ]);
    if (action === 'browser_snapshot') {
      // randomUUID is unavailable on ordinary HTTP origins in WebView2.
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
      const hex = Array.from(bytes, v => v.toString(16).padStart(2, '0')).join('');
      const epoch = `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
      const refs = new Map();
      const elements = [];
      const candidates = document.querySelectorAll('a[href],button,input,textarea,select,[role="button"],[role="link"],[contenteditable="true"],[tabindex]');
      for (const el of candidates) {
        if (!visible(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
        const ref = `${epoch}:${elements.length + 1}`;
        refs.set(ref, { el, signature: signature(el) });
        const label = el.getAttribute('aria-label') ||
          (el.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim() ||
          Array.from(el.labels || []).map(label => label.textContent || '').join(' ') ||
          el.innerText || el.textContent || el.getAttribute('placeholder') || el.getAttribute('title') || '';
        elements.push({ ref, tag: el.tagName.toLowerCase(), role: el.getAttribute('role'),
          type: el.getAttribute('type'), label: label.trim().slice(0, 300),
          disabled: el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true',
          value: (el instanceof HTMLInputElement && !['password','file','hidden'].includes(el.type)) || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement ? el.value.slice(0, 2000) : undefined,
          checked: el instanceof HTMLInputElement && ['checkbox','radio'].includes(el.type) ? el.checked : undefined,
          readOnly: el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.readOnly : undefined,
          href: el instanceof HTMLAnchorElement ? el.href : undefined,
          options: el instanceof HTMLSelectElement ? Array.from(el.options).slice(0, 100).map(o => ({value:o.value,label:o.label,disabled:o.disabled})) : undefined,
        });
        if (elements.length >= 100) break;
      }
      window[key] = { refs, href: location.href };
      // Scrolling must reveal text beyond the bounded document excerpt too.
      const lines = [];
      const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      let length = 0;
      for (let node = walker.nextNode(); node && length < 16000; node = walker.nextNode()) {
        const text = node.textContent.trim();
        if (!text || !node.parentElement || !visible(node.parentElement)) continue;
        range.selectNodeContents(node);
        const r = range.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth) {
          lines.push(text); length += text.length;
        }
      }
      return { url: location.href, title: document.title, readyState: document.readyState,
        text: (document.body?.innerText || '').slice(0, 16000), viewportText: lines.join('\n').slice(0, 16000), elements,
        scrollY, viewport: {width: innerWidth, height: innerHeight},
        truncated: elements.length >= 100,
      };
    }
    if (action === 'browser_scroll') {
      if (!Number.isInteger(args.pixels) || Math.abs(args.pixels) > 10000) throw new Error('pixels must be an integer between -10000 and 10000');
      window.scrollBy({ top: args.pixels, behavior: 'instant' });
      return { ok: true, url: location.href };
    }
    if (action === 'browser_back') {
      if (history.length <= 1) throw new Error('No previous page');
      history.back();
      return { ok: true, navigationStarted: true };
    }
    const state = window[key];
    const target = state?.refs.get(args.ref);
    if (!target || state.href !== location.href || !target.el.isConnected || target.signature !== signature(target.el)) {
      throw new Error('Element ref is stale or missing. Take a new browser_snapshot before acting.');
    }
    const el = target.el;
    if (!visible(el) || el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true') throw new Error('Element is hidden or disabled');
    el.scrollIntoView({block:'center', inline:'nearest', behavior:'instant'});
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (hit !== el && !el.contains(hit)) throw new Error('Element is covered by another element. Take a new snapshot.');
    if (action === 'browser_click') {
      const link = el.closest('a[href]');
      if (link && !['http:', 'https:'].includes(new URL(link.href, location.href).protocol)) throw new Error('Only HTTP(S) links are supported');
      if (el instanceof HTMLInputElement && el.type === 'file') throw new Error('File uploads require manual interaction');
      el.focus();
      el.click();
    } else if (action === 'browser_fill') {
      if (typeof args.text !== 'string' || args.text.length > 20000) throw new Error('text must be a string up to 20000 characters');
      if (el.readOnly) throw new Error('Input is read-only');
      el.focus();
      if (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && ['text','search','email','url','tel','password','number'].includes(el.type))) {
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, args.text);
      } else if (el.isContentEditable) {
        el.textContent = args.text;
      } else throw new Error('Element is not a supported text input');
      el.dispatchEvent(new Event('input', {bubbles:true}));
      el.dispatchEvent(new Event('change', {bubbles:true}));
    } else if (action === 'browser_select') {
      if (!(el instanceof HTMLSelectElement)) throw new Error('Element is not a select');
      const option = Array.from(el.options).find(o => o.value === args.value);
      if (!option || option.disabled || option.parentElement?.disabled) throw new Error('Option is missing or disabled');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, args.value);
      el.dispatchEvent(new Event('input', {bubbles:true}));
      el.dispatchEvent(new Event('change', {bubbles:true}));
    } else throw new Error('Unsupported browser action');
    // Require fresh observations after every interaction; never recycle refs.
    window[key] = undefined;
    return { ok: true, url: location.href, next: 'Use browser_snapshot to verify the result.' };
  } catch (error) {
    return { error: String(error.message || error) };
  }
})
