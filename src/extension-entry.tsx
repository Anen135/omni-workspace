import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Workspace } from './main';
import { extensionRequest, onOfficialLoginRequired } from './extension-client';
import styles from './styles.css?inline';
import pages from './pages.css?inline';
import preview from './file-preview.css?inline';
import live from './live.css?inline';
import workspace from './workspace.css?inline';
import login from './login.css?inline';
import schedule from './schedule.css?inline';
import materials from './teaching-materials.css?inline';
// PDF.js uses this handler directly when Workers are unavailable in a content
// script. Keeping it in the isolated world avoids page CSP and extension URL imports.
// @ts-expect-error PDF.js does not publish worker module declarations.
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs';

(globalThis as unknown as { pdfjsWorker: unknown }).pdfjsWorker = pdfjsWorker;

function start() {
  if (location.origin !== 'https://omni.top-academy.ru' || window.top !== window) return;
  const context = globalThis as unknown as { omniWorkspaceStarted?: boolean };
  if (context.omniWorkspaceStarted) return;
  context.omniWorkspaceStarted = true;
  const runtime = (window.chrome as unknown as { runtime: { id: string; onMessage: { addListener: (listener: (message: { action?: string }, sender: { id?: string; tab?: unknown }, respond: (value: unknown) => void) => void) => void } } }).runtime;
  runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id === runtime.id && !sender.tab && message.action === 'workspace-ping') respond({ ready: true });
  });
  // A native login document also clears any failed logout notice left by its
  // predecessor, without granting content scripts access to session storage.
  void extensionRequest('capabilities', {}).catch(() => {});
  const hostId = 'omni-workspace-root';
  let host: HTMLDivElement | undefined;
  let root: Root | undefined;
  let conceal: HTMLStyleElement | undefined;
  let checking = false;
  const originals = new Map<HTMLElement, { inert: boolean; ariaHidden: string | null }>();
  const nativeLogin = () => location.pathname.startsWith('/login') || location.pathname.startsWith('/auth/logout') || !!document.querySelector('input[type=password]') || /DDOS.GUARD/i.test(document.title);

  function restore() {
    root?.unmount(); root = undefined;
    host?.remove(); host = undefined;
    conceal?.remove(); conceal = undefined;
    for (const [node, state] of originals) {
      node.inert = state.inert;
      if (state.ariaHidden === null) node.removeAttribute('aria-hidden'); else node.setAttribute('aria-hidden', state.ariaHidden);
    }
    originals.clear();
  }
  function hideOriginals() {
    if (!host) return;
    for (const node of document.body.children) {
      if (node === host || !(node instanceof HTMLElement) || originals.has(node)) continue;
      originals.set(node, { inert: node.inert, ariaHidden: node.getAttribute('aria-hidden') });
      node.inert = true;
      node.setAttribute('aria-hidden', 'true');
    }
  }
  function mount(warning?: string) {
    if (host || nativeLogin() || !document.body) return;
    host = document.createElement('div'); host.id = hostId;
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `:host{all:initial;display:block;position:fixed;inset:0;z-index:2147483647;overflow:auto;isolation:isolate;color-scheme:light} ${styles}\n${pages}\n${live}\n${workspace}\n${login}\n${schedule}\n${materials}\n${preview}\n@media print{:host{position:static!important;overflow:visible!important;height:auto!important}}`;
    const container = document.createElement('div'); container.id = 'root';
    shadow.append(style);
    if (warning) {
      const alert = document.createElement('div'); alert.setAttribute('role', 'alert');
      alert.style.cssText = 'position:fixed;bottom:16px;left:16px;right:16px;z-index:200;background:#fffaef;border:1px solid #efdbb2;border-radius:8px;padding:14px 18px;color:#805d20;font:13px/1.6 sans-serif;display:flex;align-items:center;gap:16px';
      const text = document.createElement('span'); text.textContent = warning;
      const dismiss = document.createElement('button'); dismiss.textContent = 'Закрыть'; dismiss.onclick = () => alert.remove();
      alert.append(text, dismiss); shadow.append(alert);
    }
    shadow.append(container);
    document.body.append(host);
    conceal = document.createElement('style');
    conceal.textContent = `html,body{overflow:hidden!important}body>:not(#${hostId}){display:none!important}@media print{html,body{overflow:visible!important}}`;
    document.head.append(conceal);
    hideOriginals();
    root = createRoot(container);
    root.render(<React.StrictMode><Workspace/></React.StrictMode>);
  }
  async function check() {
    if (nativeLogin()) { if (host) restore(); return; }
    if (host && !host.isConnected) restore();
    if (host || checking || document.readyState !== 'complete') return;
    checking = true;
    try {
      const status = await extensionRequest<{ connected: boolean; state: string; warning?: string }>('status', {});
      if (status.connected) mount(status.warning);
    } catch { /* Loading, busy, or an expired session; keep official recovery usable. */ }
    finally { checking = false; }
  }
  onOfficialLoginRequired(restore);
  const observer = new MutationObserver(() => {
    if (host) {
      if (nativeLogin() || !host.isConnected) restore(); else hideOriginals();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  void check();
  // Retry after native login, Angular navigation, or a teacher-switch reload.
  // In particular, a new document must wait for the old mutation's BUSY lock.
  const timer = setInterval(() => { void check(); }, 1500);
  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    clearInterval(timer); observer.disconnect(); restore();
  });
  window.addEventListener('pageshow', () => { void check(); });
}
start();
