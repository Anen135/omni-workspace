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
    const release = () => {
      if (!active) return;
      active = false;
      clearTimeout(watchdog);
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
      style.textContent = `:host{all:initial;position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:${dark ? '#13151d' : '#f7f8fc'};color:${dark ? '#edf0f7' : '#192132'};font:14px/1.6 sans-serif}main{text-align:center;padding:24px}strong{display:block;font-size:42px;letter-spacing:-2px}strong span{color:#9274ec}p{opacity:.7}.spinner{width:28px;height:28px;margin:20px auto;border:3px solid #9274ec40;border-top-color:#9274ec;border-radius:50%;animation:spin 1s linear infinite}button{font:inherit;cursor:pointer;border:1px solid #9274ec60;border-radius:8px;padding:9px 14px;background:none;color:inherit}button:focus-visible{outline:3px solid #9274ec;outline-offset:3px}@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.spinner{animation:none}}`;
      const main = document.createElement('main');
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
      main.append(brand, spinner, status, escape); shadow.append(style, main);
      conceal = document.createElement('style'); conceal.id = 'omni-workspace-conceal';
      conceal.textContent = 'html,body{overflow:hidden!important}body>:not(#omni-workspace-root){display:none!important}@media print{html,body{overflow:visible!important}}';
      globalThis.omniWorkspaceBootstrap = { host, conceal, get active() { return active; },
        adopt(callback) { adopted = true; failure = callback; observer?.disconnect(); },
        ready() { clearTimeout(watchdog); }, release };
      document.documentElement.append(conceal, host);
      observer = new MutationObserver(() => { if (!adopted && hasLoginChallenge(document)) release(); });
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'class', 'name'] });
    } catch { release(); }
  }
}
