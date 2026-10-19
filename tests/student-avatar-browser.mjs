import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// Fictional component fixtures; every external request is blocked or fulfilled locally.
const fixture = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { StudentTable } from '/src/features/lesson/StudentTable.tsx';
import { HomeworkTable } from '/src/features/homework/HomeworkTable.tsx';
import '/src/styles/styles.css';
import '/src/app/workspace.css';
function Fixture() {
  const [photo, setPhoto] = useState('/fixtures/good.png');
  window.setAvatarPhoto = setPhoto;
  const students = [
    { id_stud: 101, fio_stud: 'Alex One', photo_pas: '/fixtures/own.png' },
    { id_stud: 102, fio_stud: 'Alex Two', photo_pas: '/fixtures/good.png' },
    { id_stud: 103, fio_stud: 'Case Missing' },
    { id_stud: 'invalid', fio_stud: 'Invalid Identity' },
    { id_stud: 104, fio_stud: 'Own Photo', photo_pas: '/fixtures/own.png', photo: '/fixtures/alias.png' },
    { id_stud: 105, fio_stud: 'Alias Only', photo: '/fixtures/alias.png' },
  ];
  const photos = new Map([['101', photo], ['102', '/fixtures/broken.png'], ['', '/fixtures/invalid.png'], ['invalid', '/fixtures/invalid.png'], ['Own Photo', '/fixtures/name.png']]);
  const homework = students.map((student, index) => ({ key: 'work-' + index, studentId: String(student.id_stud), studentName: student.fio_stud,
    groupName: 'Fixture group', subject: '', theme: 'Fixture work', submittedAt: '', mark: null, source: { ...student, answer_text: 'Fixture answer' }, canGrade: false }));
  return <div className="live-workspace">
    <section id="lesson"><StudentTable items={students} busy={false} onOpen={() => { window.studentOpened = true; }} studentPhotos={photos}/></section>
    <section id="homework"><HomeworkTable section={{ data: [], error: null }} items={homework} render={value => value.answer_text} studentPhotos={photos}/></section>
  </div>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
`;
const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 5199, strictPort: true, watch: { ignored: ['**/.omni-browser/**'] } }, plugins: [{
  name: 'student-avatar-fixture',
  resolveId(id) { if (id === '/student-avatar-fixture.tsx') return id; },
  load(id) { if (id === '/student-avatar-fixture.tsx') return fixture; },
}] });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(10000);
  const errors = [], externalRequests = [], photoRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'fonts.googleapis.com') return route.abort();
    if (url.origin === 'https://omni.top-academy.ru' && url.pathname.startsWith('/fixtures/')) {
      photoRequests.push({ path: url.pathname, headers: route.request().headers() });
      if (url.pathname === '/fixtures/broken.png') return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=', 'base64') });
    }
    if (url.hostname !== '127.0.0.1') { externalRequests.push(url.href); return route.abort(); }
    return route.continue();
  });
  await page.route('**/student-avatar-fixture.html', route => route.fulfill({ contentType: 'text/html', body: '<html><div id="root"></div><script type="module" src="/student-avatar-fixture.tsx"></script></html>' }));
  await page.goto('http://127.0.0.1:5199/student-avatar-fixture.html');
  for (const section of ['#lesson', '#homework']) {
    const row = name => page.locator(section + ' tbody tr').filter({ hasText: name });
    const image = row('Alex One').locator('.student-avatar img');
    await image.waitFor();
    await image.evaluate(img => img.decode());
    assert.equal(await image.getAttribute('src'), 'https://omni.top-academy.ru/fixtures/good.png', 'ID map takes precedence over own photo');
    assert.equal(await image.getAttribute('alt'), '');
    assert.equal(await image.getAttribute('loading'), 'lazy');
    assert.equal(await image.getAttribute('referrerpolicy'), 'no-referrer');
    assert.equal(await image.evaluate(img => getComputedStyle(img).objectFit), 'cover');
    assert.equal(await image.locator('..').evaluate(avatar => getComputedStyle(avatar).borderRadius), '50%');
    await row('Alex Two').locator('.student-avatar img').waitFor({ state: 'detached' });
    assert.equal(await row('Alex Two').locator('.student-avatar').innerText(), 'AT');
    assert.equal(await row('Case Missing').locator('.student-avatar').innerText(), 'CM');
    assert.equal(await row('Invalid Identity').locator('.student-avatar img').count(), 0, 'invalid IDs cannot join a photo map');
    assert.equal(await row('Own Photo').locator('.student-avatar img').getAttribute('src'), 'https://omni.top-academy.ru/fixtures/own.png');
    assert.equal(await row('Alias Only').locator('.student-avatar img').count(), 0, 'only photo_pas supplies photos');
  }
  await page.locator('#lesson .student-name').filter({ hasText: 'Alex One' }).click();
  assert.equal(await page.evaluate(() => window.studentOpened), true);
  const preview = page.locator('#homework tbody tr').filter({ hasText: 'Alex One' }).locator('.homework-preview-button');
  await preview.hover();
  await page.locator('.homework-quick-preview').waitFor();
  assert.equal(await page.locator('.homework-quick-preview').innerText().then(text => text.includes('Fixture answer')), true);
  await page.keyboard.press('Escape');
  await page.locator('.homework-quick-preview').waitFor({ state: 'detached' });
  await page.evaluate(() => window.setAvatarPhoto('/fixtures/broken.png'));
  await page.waitForFunction(() => [...document.querySelectorAll('tbody tr')].filter(row => row.textContent.includes('Alex One')).every(row => !row.querySelector('.student-avatar img')));
  await page.evaluate(() => window.setAvatarPhoto('/fixtures/good.png'));
  for (const section of ['#lesson', '#homework']) {
    const image = page.locator(section + ' tbody tr').filter({ hasText: 'Alex One' }).locator('.student-avatar img');
    await image.waitFor();
    await image.evaluate(img => img.decode());
  }
  assert.equal(photoRequests.some(request => request.path === '/fixtures/invalid.png' || request.path === '/fixtures/name.png' || request.path === '/fixtures/alias.png'), false);
  assert.equal(photoRequests.every(request => !request.headers.referer), true, 'avatar requests omit referrers');
  assert.deepEqual(externalRequests, []);
  assert.deepEqual(errors, []);
  console.log('student-avatar-browser: PASS (both tables, validated ID joins, own photo_pas, fallback/reset, preview, no referrers)');
} finally {
  await browser?.close();
  await server.close();
}
