import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Workspace } from '../Workspace';
import { extensionRequest, onOfficialLoginRequired } from '../../services/extension-client';
import { createPoller, type PollOutcome } from './poller';
import styles from '../../styles/styles.css?inline';
import pages from '../../styles/pages.css?inline';
import preview from '../../components/files/file-preview.css?inline';
import live from '../live.css?inline';
import workspace from '../workspace.css?inline';
import login from '../../features/auth/login.css?inline';
import schedule from '../../features/schedule/schedule.css?inline';
import materials from '../../features/materials/teaching-materials.css?inline';
import homework from '../../features/homework/homework.css?inline';
import dossier from '../../features/dossier/teacher-dossier.css?inline';
import searchableSelect from '../../components/ui/searchable-select.css?inline';
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
    style.textContent = `:host{all:initial;display:block;position:fixed;inset:0;z-index:2147483647;overflow:auto;isolation:isolate;color-scheme:light} ${styles}\n${pages}\n${live}\n${workspace}\n${login}\n${schedule}\n${materials}\n${homework}\n${dossier}\n${preview}\n${searchableSelect}\n@media print{:host{position:static!important;overflow:visible!important;height:auto!important}}`;
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
  async function check(): Promise<PollOutcome> {
    if (nativeLogin()) { if (host) restore(); return 'local'; }
    if (host && !host.isConnected) restore();
    // A hidden tab sends nothing; it is checked again as soon as it is shown (see visibilitychange below).
    if (host || checking || document.readyState !== 'complete' || document.hidden) return 'local';
    checking = true;
    try {
      const status = await extensionRequest<{ connected: boolean; state: string; warning?: string }>('status', {});
      if (!status.connected) return 'retry';
      mount(status.warning);
      return 'mounted';
    } catch (reason) {
      // Loading, busy, or an expired session; keep official recovery usable.
      return (reason as { code?: string }).code === 'BUSY' ? 'busy' : 'retry';
    }
    finally { checking = false; }
  }
  onOfficialLoginRequired(restore);
  const observer = new MutationObserver(() => {
    if (host) {
      if (nativeLogin() || !host.isConnected) restore(); else hideOriginals();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  // Retry after native login, Angular navigation, or a teacher-switch reload.
  // In particular, a new document must wait for the old mutation's BUSY lock.
  // Requests which found nothing to mount back off (1.5 s up to 30 s); local checks and BUSY stay at 1.5 s.
  const poller = createPoller(check);
  poller.start();
  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    poller.stop(); observer.disconnect(); restore();
  });
  window.addEventListener('pageshow', () => poller.nudge());
  window.addEventListener('focus', () => poller.nudge());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poller.nudge(); });
}
start();
