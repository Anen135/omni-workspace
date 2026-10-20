import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const fixture = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkspaceSidebar } from '/src/app/components/WorkspaceSidebar';
import { WorkspaceHeader } from '/src/app/components/WorkspaceHeader';
import { WorkspaceMobileNav, WorkspacePageHeading } from '/src/app/components/WorkspacePageHeading';
import { HelpPage } from '/src/features/help/HelpPage';
import '/src/styles/styles.css';
import '/src/styles/pages.css';
import '/src/components/ui/help.css';
import '/src/app/live.css';
import '/src/app/workspace.css';
import '/src/app/components/workspace-navigation.css';
function Fixture() {
  const [tab, setTab] = useState('lesson');
  const [hasHomework, setHasHomework] = useState(true);
  window.setHomeworkNotice = setHasHomework;
  const onDemo = () => { window.demoOpened = true; };
  const account = { id: 'fixture', name: 'Fixture teacher', branch: 'Fixture branch' };
  return <div className="live-workspace app-shell">
    <WorkspaceSidebar account={account} tab={tab} onNavigate={setTab} onDemo={onDemo} hasHomework={hasHomework}/>
    <main><WorkspaceHeader account={account} teachers={[]} busy={false} authNeeded={false} desktop={false} extension={false} onRefresh={() => {}} onTeacherChange={() => {}} onAccountChange={() => {}}/>
      <div className="page-content"><WorkspaceMobileNav tab={tab} onNavigate={setTab} onDemo={onDemo}/><WorkspacePageHeading tab={tab}/><HelpPage onDemo={onDemo}/></div>
    </main>
  </div>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
`;
const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 5205, strictPort: true,
  watch: { ignored: ['**/dist*/**', '**/tmp/**', '**/.omni-browser/**'] } }, plugins: [{
  name: 'workspace-navigation-fixture',
  resolveId(id) { if (id === '/navigation-fixture.tsx') return id; },
  load(id) { if (id === '/navigation-fixture.tsx') return fixture; },
}] });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(10000);
  const errors = [], omniRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().includes('/api/omni/')) omniRequests.push(request.url()); });
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('**/navigation-fixture.html', route => route.fulfill({ contentType: 'text/html', body: '<html lang="ru"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/navigation-fixture.tsx"></script></html>' }));
  await page.goto('http://127.0.0.1:5205/navigation-fixture.html');
  await page.mouse.move(500, 300);
  const sidebar = page.locator('.sidebar');
  const buttons = sidebar.locator('nav button');
  await buttons.first().waitFor();
  const titles = ['Мой урок', 'Расписание', 'Студенты', 'Домашние задания', 'Материалы', 'Досье преподавателя', 'Справка'];
  assert.equal(await buttons.count(), titles.length);
  assert.equal(await sidebar.evaluate(element => element.getBoundingClientRect().width), 72);
  for (const title of titles) assert.equal(await sidebar.getByRole('button', { name: title, exact: true }).count(), 1, 'collapsed navigation keeps its exact accessible name');
  const geometry = await buttons.evaluateAll(elements => elements.map(button => {
    const box = button.getBoundingClientRect();
    const icon = button.querySelector('.workspace-nav-icon').getBoundingClientRect();
    return { center: icon.x + icon.width / 2, offset: icon.x + icon.width / 2 - (box.x + box.width / 2) };
  }));
  assert.ok(geometry.every(item => Math.abs(item.offset) < .6), 'every collapsed row centers its icon');
  assert.ok(geometry.every(item => Math.abs(item.center - geometry[0].center) < .6), 'all rows share one icon axis');
  assert.equal(await sidebar.locator('.sidebar-bottom > button').count(), 0, 'demo is removed from sidebar');
  assert.equal(await page.locator('.live-mobile-nav button').count(), 0, 'demo is removed from mobile navigation');
  assert.equal(await sidebar.locator('.workspace-homework-dot').count(), 1);
  const homework = sidebar.getByRole('button', { name: 'Домашние задания', exact: true });
  assert.equal(await homework.evaluate(button => document.getElementById(button.getAttribute('aria-describedby')).textContent), 'Есть непроверенные домашние работы');
  assert.equal(await page.locator('.omni-brand-mark').count(), 2, 'sidebar and header use the shared vector');
  await mkdir('tmp/navigation', { recursive: true });
  await page.screenshot({ path: 'tmp/navigation/desktop-collapsed.png' });
  await homework.hover();
  assert.equal(await sidebar.evaluate(element => element.getBoundingClientRect().width), 240);
  await page.screenshot({ path: 'tmp/navigation/desktop-expanded.png' });
  await page.evaluate(() => window.setHomeworkNotice(false));
  await sidebar.locator('.workspace-homework-dot').waitFor({ state: 'detached' });
  assert.equal(await homework.getAttribute('aria-describedby'), null);
  await sidebar.getByRole('button', { name: 'Справка', exact: true }).click();
  assert.equal(await page.locator('h1').innerText(), 'Справка');
  const demo = page.getByRole('button', { name: 'Пример интерфейса', exact: true });
  assert.match(await demo.locator('..').innerText(), /вымышленных учениках/);
  await page.mouse.move(500, 300);
  await demo.click();
  assert.equal(await page.evaluate(() => window.demoOpened), true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('combobox', { name: 'Раздел' }).selectOption('groups');
  assert.equal(await page.locator('h1').innerText(), 'Студенты');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile navigation and header fit the viewport');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'tmp/navigation/mobile.png' });
  const png = await readFile('public/icon.png');
  assert.equal(png.readUInt32BE(16), 128);
  assert.equal(png.readUInt32BE(20), 128);
  assert.match(await readFile('public/brand.svg', 'utf8'), /viewBox="0 0 128 128"/);
  assert.deepEqual(errors, []);
  assert.deepEqual(omniRequests, []);
  console.log('PASS: centered collapsed navigation, exact accessible names, real-queue indicator, help demo link, shared vector/128px icon, desktop/mobile layout; no Omni calls.');
} finally { await browser?.close(); await server.close(); }
