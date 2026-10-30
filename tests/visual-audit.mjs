import { spawnSync } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';

// Invalidate previous evidence before building, including when the build fails.
const directory = 'tmp/visual-audit';
await mkdir(directory, { recursive: true });
await rm(`${directory}/report.json`, { force: true });
const startedAt = new Date().toISOString();
const status = async (state, error) => {
  await writeFile(`${directory}/run-status.json`, JSON.stringify({ state, startedAt, updatedAt: new Date().toISOString(), error }, null, 2));
  if (state !== 'passed') await writeFile(`${directory}/index.html`, `<!doctype html><meta charset="utf-8"><title>Visual audit: ${state}</title><h1>Visual audit: ${state}</h1><p>Previous screenshots are not evidence for this run. See run-status.json.</p>`);
};
const run = args => {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: { ...process.env, OMNI_VISUAL_AUDIT_ONLY: '1' } });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Visual audit subprocess failed (${result.signal ?? result.status})`);
};
await status('running');
try {
  if (!process.env.npm_execpath) throw new Error('Run npm run test:visual so the build uses the active npm installation.');
  run([process.env.npm_execpath, 'run', 'build:extension']);
  run(['tests/extension-browser.mjs']);
  await status('passed');
} catch (error) {
  await rm(`${directory}/report.json`, { force: true });
  await status('failed', error instanceof Error ? error.message : String(error));
  console.error(error);
  process.exitCode = 1;
}
