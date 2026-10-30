import { ExtensionAuthGate } from '../../features/auth/ExtensionAuthGate';
import authStyles from '../../features/auth/extension-auth.css?inline';
import { submitOfficialLogin, loginErrors } from '../../../server/login.mjs';
import { loginPageState, nativeLoginKey } from '../../../extension/login-page.mjs';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Workspace } from '../Workspace';
import { extensionRequest, onOfficialLoginRequired } from '../../services/extension-client';
import { createPoller, type PollOutcome } from './poller';
import theme from '../../styles/theme.css?inline';
import styles from '../../styles/styles.css?inline';
import pages from '../../styles/pages.css?inline';
import help from '../../components/ui/help.css?inline';
import averageGrade from '../../components/ui/average-grade.css?inline';
import preview from '../../components/files/file-preview.css?inline';
import table from '../../components/data/table.css?inline';
import rewardAllocation from '../../features/lesson/reward-allocation.css?inline';
import lessonMaterials from '../../features/lesson/lesson-materials.css?inline';
import live from '../live.css?inline';
import workspace from '../workspace.css?inline';
import navigation from '../components/workspace-navigation.css?inline';
import login from '../../features/auth/login.css?inline';
import schedule from '../../features/schedule/schedule.css?inline';
import materials from '../../features/materials/teaching-materials.css?inline';
import homework from '../../features/homework/homework.css?inline';
import students from '../../features/students/students.css?inline';
import dossier from '../../features/dossier/teacher-dossier.css?inline';
import income from '../../features/dossier/income.css?inline';
import searchableSelect from '../../components/ui/searchable-select.css?inline';
// PDF.js uses this handler directly when Workers are unavailable in a content
// script. Keeping it in the isolated world avoids page CSP and extension URL imports.
// @ts-expect-error PDF.js does not publish worker module declarations.
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs';

(globalThis as unknown as { pdfjsWorker: unknown }).pdfjsWorker = pdfjsWorker;

type Bootstrap = {
  host: HTMLDivElement; conceal: HTMLStyleElement; active: boolean;
  adopt: (failure: () => void) => void; ready: () => void; release: () => void;
};

function start() {
  if (location.origin !== 'https://omni.top-academy.ru' || window.top !== window) return;
  const context = globalThis as unknown as { omniWorkspaceStarted?: boolean; omniWorkspaceBootstrap?: Bootstrap };
  if (context.omniWorkspaceStarted) return;
  const bootstrap = context.omniWorkspaceBootstrap;
  context.omniWorkspaceStarted = true;
  const runtime = (window.chrome as unknown as { runtime: { id: string; onMessage: { addListener: (listener: (message: { action?: string }, sender: { id?: string; tab?: unknown }, respond: (value: unknown) => void) => void) => void } } }).runtime;
  runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id === runtime.id && !sender.tab && message.action === 'workspace-ping') respond({ ready: true });
  });
  void extensionRequest('capabilities', {}).catch(() => {});
  const hostId = 'omni-workspace-root';
  let host: HTMLDivElement | undefined;
  let root: Root | undefined;
  let conceal: HTMLStyleElement | undefined;
  let mode: 'loading' | 'login' | 'workspace' | undefined;
  let official = false;
  let manualOfficial = false;
  let lastOfficialState: ReturnType<typeof loginPageState> | undefined;
  let checking = false;
  let generation = 0;
  let loadingTimer: ReturnType<typeof setTimeout> | undefined;
  let loginController: AbortController | undefined;
  const originals = new Map<HTMLElement, { inert: boolean; ariaHidden: string | null }>();

  function restore() {
    generation++;
    loginController?.abort(); loginController = undefined;
    clearTimeout(loadingTimer);
    try { root?.unmount(); }
    finally {
      root = undefined; mode = undefined;
      host?.remove(); host = undefined;
      conceal?.remove(); conceal = undefined;
      bootstrap?.release();
      for (const [node, state] of originals) {
        node.inert = state.inert;
        if (state.ariaHidden === null) node.removeAttribute('aria-hidden'); else node.setAttribute('aria-hidden', state.ariaHidden);
      }
      originals.clear();
    }
  }
  function showOfficial(explicit = false) {
    official = true;
    lastOfficialState = loginPageState(document, location.pathname);
    manualOfficial ||= explicit;
    try {
      if (sessionStorage.getItem(nativeLoginKey) === '1') sessionStorage.removeItem(nativeLoginKey);
      manualOfficial ||= sessionStorage.getItem(nativeLoginKey) === 'manual';
      if (explicit) sessionStorage.setItem(nativeLoginKey, 'manual');
    } catch { /* Native content must remain usable without storage. */ }
    restore();
    if (explicit && !location.pathname.startsWith('/login') && loginPageState(document, location.pathname) !== 'official') location.assign('/login/index');
  }
  function hideOriginals() {
    if (!host || !document.body) return;
    for (const node of document.body.children) {
      if (node === host || !(node instanceof HTMLElement) || originals.has(node)) continue;
      originals.set(node, { inert: node.inert, ariaHidden: node.getAttribute('aria-hidden') });
      node.inert = true;
      node.setAttribute('aria-hidden', 'true');
    }
  }
  function ensureShell() {
    if (root) return;
    host = bootstrap?.active ? bootstrap.host : document.createElement('div');
    host.id = hostId;
    const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `:host{all:initial;display:block;position:fixed;inset:0;z-index:2147483647;overflow:auto;isolation:isolate;color-scheme:light} ${styles}\n${help}\n${pages}\n${live}\n${workspace}\n${navigation}\n${login}\n${schedule}\n${materials}\n${homework}\n${students}\n${dossier}\n${income}\n${preview}\n${table}\n${averageGrade}\n${rewardAllocation}\n${searchableSelect}\n${lessonMaterials}\n${theme}\n${authStyles}\n@media print{:host{position:static!important;overflow:visible!important;height:auto!important}}`;
    const container = document.createElement('div'); container.id = 'root';
    shadow.replaceChildren(style, container);
    conceal = bootstrap?.active ? bootstrap.conceal : document.createElement('style');
    conceal.textContent = `html,body{overflow:hidden!important}body>:not(#${hostId}){display:none!important}@media print{html,body{overflow:visible!important}}`;
    if (!conceal.isConnected) document.documentElement.append(conceal);
    if (!host.isConnected) document.documentElement.append(host);
    if (document.body && host.parentElement !== document.body) document.body.append(host);
    bootstrap?.adopt(() => showOfficial());
    hideOriginals();
    root = createRoot(container, { onUncaughtError: () => showOfficial() });
  }
  async function login(username: string, password: string) {
    if (official || mode !== 'login' || loginPageState(document, location.pathname) !== 'login') { showOfficial(); return; }
    if (loginController) return;
    const version = generation;
    const controller = new AbortController(); loginController = controller;
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const result = await submitOfficialLogin({ username, password }, controller.signal);
      if (official || version !== generation) return;
      if (controller.signal.aborted) throw new Error(loginErrors.LOGIN_UNAVAILABLE);
      if (loginPageState(document, location.pathname) !== 'login') { showOfficial(); return; }
      if (!result.success) {
        if (['CHALLENGE', 'AUTH_REQUIRED', 'LOGIN_PERMISSION'].includes(result.code || '')) { showOfficial(); return; }
        throw new Error(loginErrors[result.code || 'LOGIN_UNAVAILABLE'] || loginErrors.LOGIN_UNAVAILABLE);
      }
      renderGate('loading');
      location.assign('/');
    } finally {
      password = '';
      clearTimeout(timeout);
      if (loginController === controller) loginController = undefined;
    }
  }
  function renderGate(next: 'loading' | 'login') {
    if (official || mode === next && root) return;
    ensureShell(); generation++; mode = next;
    clearTimeout(loadingTimer);
    if (next === 'loading') loadingTimer = setTimeout(() => showOfficial(), 30000);
    else bootstrap?.ready();
    root!.render(<React.StrictMode><Workspace key="connecting" connectionPending={next === 'loading'} connectionForm={next === 'login' ? <ExtensionAuthGate onLogin={login}/> : undefined} onNativeLogin={() => showOfficial(true)}/></React.StrictMode>);
  }
  function mountWorkspace(warning?: string) {
    if (official || mode === 'workspace') return;
    ensureShell(); generation++; mode = 'workspace';
    clearTimeout(loadingTimer); bootstrap?.ready();
    manualOfficial = false;
    try { sessionStorage.removeItem(nativeLoginKey); } catch { /* Visual preference only. */ }
    root!.render(<React.StrictMode><Workspace key="connected"/></React.StrictMode>);
    if (warning) {
      const alert = document.createElement('div'); alert.setAttribute('role', 'alert');
      alert.style.cssText = 'position:fixed;bottom:16px;left:16px;right:16px;z-index:200;background:var(--omni-warning-soft,#fffaef);border:1px solid var(--omni-warning-border,#efdbb2);border-radius:8px;padding:14px 18px;color:var(--omni-warning-text,#805d20);font:13px/1.6 sans-serif;display:flex;align-items:center;gap:16px';
      const text = document.createElement('span'); text.textContent = warning;
      const dismiss = document.createElement('button'); dismiss.textContent = 'Закрыть'; dismiss.onclick = () => alert.remove();
      alert.append(text, dismiss); host!.shadowRoot!.append(alert);
    }
  }
  async function check(): Promise<PollOutcome> {
    const state = loginPageState(document, location.pathname);
    let bypass = false;
    try { bypass = sessionStorage.getItem(nativeLoginKey) === 'manual'; } catch { /* In-memory manual choice still applies. */ }
    if ((manualOfficial || bypass) && location.pathname.startsWith('/login')) { showOfficial(); return 'local'; }
    if (official) {
      const changed = state !== lastOfficialState;
      lastOfficialState = state;
      if (manualOfficial || !changed || (state !== 'login' && state !== 'workspace')) return 'local';
      // Automatic fallback is temporary; a positively recognized page can resume.
      official = false;
    }
    if (state === 'official') { showOfficial(); return 'local'; }
    if (state === 'login') {
      if (bypass) showOfficial(); else renderGate('login');
      return 'local';
    }
    if (host && !host.isConnected) { showOfficial(); return 'local'; }
    if (mode === 'workspace') return 'local';
    renderGate('loading');
    if (state === 'loading' || checking || document.readyState !== 'complete' || document.hidden) return 'local';
    const version = generation;
    checking = true;
    try {
      const status = await extensionRequest<{ connected: boolean; state: string; warning?: string }>('status', {});
      if (official || version !== generation) return 'local';
      if (loginPageState(document, location.pathname) === 'official') { showOfficial(); return 'local'; }
      if (status.state === 'challenge') { showOfficial(); return 'local'; }
      if (!status.connected) return 'retry';
      mountWorkspace(status.warning);
      return 'mounted';
    } catch (reason) {
      return (reason as { code?: string }).code === 'BUSY' ? 'busy' : 'retry';
    } finally { checking = false; }
  }
  onOfficialLoginRequired(() => { if (!official) renderGate('loading'); });
  const observer = new MutationObserver(() => {
    if (official) { if (!manualOfficial) poller.nudge(); return; }
    const state = loginPageState(document, location.pathname);
    if (state === 'official') showOfficial();
    else if (host && !host.isConnected) showOfficial();
    else { hideOriginals(); if (mode !== 'workspace' || state === 'login') poller.nudge(); }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'class', 'name'] });
  let poller = createPoller(check);
  poller.start();
  window.addEventListener('pagehide', () => { poller.stop(); observer.disconnect(); restore(); });
  window.addEventListener('pageshow', event => {
    if (event.persisted) {
      official = false;
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'class', 'name'] });
      poller = createPoller(check); poller.start();
    } else poller.nudge();
  });
  window.addEventListener('focus', () => poller.nudge());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poller.nudge(); });
}
start();
