// Runs only in GrokBrowserAutomation, in every frame. The website cannot access
// this handler. A pending native reply wakes the frame; there is no polling timer.
((perform) => {
  if (!['http:', 'https:', 'about:'].includes(location.protocol)) return;
  if (!crypto.randomUUID) crypto.randomUUID = () => {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = Array.from(b, v => v.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  };
  const id = crypto.randomUUID();
  const post = value => webkit.messageHandlers.grokBrowserFrame.postMessage(JSON.stringify({id, ...value}));
  let generation = 0;
  let active = false;
  async function start(fresh = false) {
    if (active) return;
    active = true;
    const run = ++generation;
    let completion = {};
    try {
      while (active && run === generation) {
        const command = JSON.parse(await post({kind:'ready', url:location.href, main:window === top, fresh, ...completion}));
        fresh = false;
        if (!active || run !== generation || command.stop) break;
        const value = perform(command.action, command.args);
        completion = {request:command.request, value};
      }
    } catch { /* navigation or closing the tab ends the native channel */ }
    finally { if (run === generation) active = false; }
  }
  addEventListener('pagehide', () => {
    active = false; ++generation;
    post({kind:'gone'}).catch(() => {});
  });
  addEventListener('pageshow', () => start());
  start(true);
})
