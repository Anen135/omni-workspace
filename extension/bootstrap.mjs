import { hasLoginChallenge, nativeLoginKey } from './login-page.mjs';

if (location.origin === 'https://omni.top-academy.ru' && window.top === window && !globalThis.omniWorkspaceBootstrap) {
  let bypass = false;
  try {
    const choice = sessionStorage.getItem(nativeLoginKey);
    if (choice === '1') sessionStorage.removeItem(nativeLoginKey); // Legacy automatic fallback is not an explicit preference.
    bypass = choice === 'manual' && location.pathname.startsWith('/login');
  } catch { /* Native escape still works in this document. */ }
  if (!bypass && document.documentElement && !hasLoginChallenge(document)) {
    let active = true;
    let adopted = false;
    let failure;
    let observer;
    let host;
    let conceal;
    let delayedReveal;
    let revealPending = false;
    const cancelReveal = () => { revealPending = false; clearTimeout(delayedReveal); };
    const release = () => {
      if (!active) return;
      active = false;
      clearTimeout(watchdog);
      cancelReveal();
      observer?.disconnect();
      conceal?.remove();
      host?.remove();
    };
    const watchdog = setTimeout(() => { try { failure?.(); } finally { release(); } }, 30000);
    try {
      host = document.createElement('div'); host.id = 'omni-workspace-root';
      const shadow = host.attachShadow({ mode: 'open' });
      let dark = matchMedia('(prefers-color-scheme: dark)').matches;
      try { const preference = localStorage.getItem('omni-color-theme'); if (preference === 'dark' || preference === 'light') dark = preference === 'dark'; } catch { /* System colors. */ }
      host.setAttribute('data-omni-theme', dark ? 'dark' : 'light');
      const style = document.createElement('style');
      style.textContent = `:host{all:initial;position:fixed;inset:0;z-index:2147483647;display:grid;grid-template-columns:246px minmax(0,1fr);grid-template-rows:73px minmax(0,1fr);background:${dark ? '#13151d' : '#f7f8fc'};color:${dark ? '#edf0f7' : '#192132'};font:14px/1.6 sans-serif}*{box-sizing:border-box}[hidden]{display:none!important}.outline-sidebar,.outline-header{background:${dark ? '#1b1e28' : '#fff'};border-color:${dark ? '#2c3040' : '#e7e9f2'};border-style:solid;pointer-events:none}.outline-sidebar{grid-column:1;grid-row:1/-1;border-width:0 1px 0 0;padding:35px 32px}.outline-header{grid-column:2;grid-row:1;border-width:0 0 1px;padding:31px 38px}.outline-line{height:10px;width:100px;border-radius:5px;background:currentColor;opacity:.055}.outline-sidebar .outline-line{width:144px;margin:36px 0}.outline-sidebar .outline-line:first-child{width:76px;margin:0 0 52px;height:16px}.outline-sidebar .outline-line:nth-child(3){width:116px}.outline-sidebar .outline-line:nth-child(4){width:132px}main{grid-column:2;grid-row:2;display:grid;place-items:center;min-width:0;overflow:auto;padding:24px;text-align:center}.loader{max-width:440px}.brand{display:flex;align-items:center;justify-content:center;gap:12px}strong{display:block;font-size:42px;letter-spacing:-2px}strong span{color:#9274ec}p{opacity:.7;margin:0 0 16px}.spinner{width:28px;height:28px;margin:20px auto;border:3px solid #9274ec40;border-top-color:#9274ec;border-radius:50%;animation:spin 1s linear infinite}button{font:inherit;cursor:pointer;border:1px solid #9274ec60;border-radius:8px;padding:9px 14px;background:none;color:inherit}button:focus-visible{outline:3px solid #9274ec;outline-offset:3px}@keyframes spin{to{transform:rotate(360deg)}}@media(min-width:1500px){:host{grid-template-columns:260px minmax(0,1fr)}}@media(max-width:1200px){:host{grid-template-columns:212px minmax(0,1fr)}.outline-sidebar{padding-inline:25px}.outline-header{padding-inline:24px}}@media(max-width:760px){:host{grid-template-columns:minmax(0,1fr)}.outline-sidebar{display:none}.outline-header{grid-column:1;padding-inline:16px}main{grid-column:1}}@media(prefers-reduced-motion:reduce){.spinner{animation:none}}`;
      const sidebar = document.createElement('aside'); sidebar.className = 'outline-sidebar'; sidebar.setAttribute('aria-hidden', 'true'); sidebar.setAttribute('inert', '');
      const header = document.createElement('header'); header.className = 'outline-header'; header.setAttribute('aria-hidden', 'true'); header.setAttribute('inert', '');
      for (let index = 0; index < 5; index++) { const line = document.createElement('div'); line.className = 'outline-line'; sidebar.append(line); }
      const headerLine = document.createElement('div'); headerLine.className = 'outline-line'; header.append(headerLine);
      const main = document.createElement('main');
      main.setAttribute('role', 'status'); main.setAttribute('aria-label', 'Загрузка Omni Workspace');
      const loader = document.createElement('div'); loader.className = 'loader';
      const logo = document.createElement('div'); logo.className = 'brand'; logo.setAttribute('aria-hidden', 'true');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      for (const [key, value] of Object.entries({ width: '48', height: '48', viewBox: '0 0 128 128', fill: 'none', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(key, value);
      const shapes = [
        ['rect', { width: '128', height: '128', rx: '36', fill: '#6C4DF6' }],
        ['path', { d: 'M91 64A27 27 0 1 1 64 37', stroke: 'white', 'stroke-width': '16', 'stroke-linecap': 'round' }],
        ['circle', { cx: '91', cy: '37', r: '9', fill: '#CEC4FF' }],
      ];
      for (const [tag, attributes] of shapes) { const shape = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [key, value] of Object.entries(attributes)) shape.setAttribute(key, value); svg.append(shape); }
      const brand = document.createElement('strong'); brand.textContent = 'omni';
      const dot = document.createElement('span'); dot.textContent = '.'; brand.append(dot);
      const spinner = document.createElement('div'); spinner.className = 'spinner'; spinner.setAttribute('aria-hidden', 'true');
      const status = document.createElement('p'); status.setAttribute('role', 'status'); status.textContent = 'Загружаем Omni Workspace…';
      const escape = document.createElement('button'); escape.type = 'button'; escape.textContent = 'Открыть официальный вход';
      escape.onclick = () => {
        try { sessionStorage.setItem(nativeLoginKey, 'manual'); } catch { /* Restore without storage. */ }
        release();
        if (!location.pathname.startsWith('/login') && !hasLoginChallenge(document)) location.assign('/login/index');
      };
      status.hidden = true; status.className = 'startup-recovery-message'; status.setAttribute('role', 'presentation'); status.textContent = 'Загрузка занимает больше времени. Можно подождать или открыть обычный Omni.';
      escape.hidden = true; escape.className = 'startup-native-escape';
      logo.append(svg, brand); loader.append(logo, spinner, status, escape); main.append(loader); shadow.append(style, sidebar, header, main);
      conceal = document.createElement('style'); conceal.id = 'omni-workspace-conceal';
      conceal.textContent = 'html,body{overflow:hidden!important}body>:not(#omni-workspace-root){display:none!important}@media print{html,body{overflow:visible!important}}';
      globalThis.omniWorkspaceBootstrap = { host, conceal, get active() { return active; },
        adopt(callback) { adopted = true; failure = callback; cancelReveal(); observer?.disconnect(); },
        ready() { clearTimeout(watchdog); cancelReveal(); }, release };
      document.documentElement.append(conceal, host);
      revealPending = true;
      delayedReveal = setTimeout(() => {
        if (!active || adopted || !revealPending) return;
        revealPending = false;
        status.hidden = false; escape.hidden = false;
      }, 3000);
      observer = new MutationObserver(() => { if (!adopted && hasLoginChallenge(document)) release(); });
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'class', 'name'] });
    } catch { release(); }
  }
}
