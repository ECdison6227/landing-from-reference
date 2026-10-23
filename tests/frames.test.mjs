import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const script = fileURLToPath(new URL('../scripts/frames.mjs', import.meta.url));
const browserName = process.env.FRAMES_TEST_BROWSER ?? (process.platform === 'win32' ? 'msedge' : 'chromium');
const run = args => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 60000 });

test('help works without a video, and invalid intervals fail before opening files', () => {
  const help = run(['--help']);
  assert.equal(help.status, 0); assert.match(help.stdout, /Usage:/);
  for (const step of ['NaN', 'Infinity', '0']) {
    const result = run(['missing.mp4', 'unused-output', step]);
    assert.equal(result.status, 1); assert.match(result.stderr, /interval/);
  }
});

test('extracts a generated silent video, writes a contact sheet and refuses to overwrite', { timeout: 90000 }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'landing-frames-test-'));
  const browser = await chromium.launch({ headless: true, ...(browserName === 'chromium' ? {} : { channel: browserName }) });
  try {
    const context = await browser.newContext({ viewport: { width: 640, height: 360 }, recordVideo: { dir, size: { width: 640, height: 360 } } });
    const page = await context.newPage();
    await page.setContent('<body style="margin:0;background:#de5544"><h1>Example A</h1></body>');
    await page.waitForTimeout(650);
    await page.evaluate(() => { document.body.style.background = '#2244cc'; document.querySelector('h1').textContent = 'Example B'; });
    await page.waitForTimeout(650);
    const video = page.video();
    await context.close();
    const source = await video.path(), output = path.join(dir, 'frames');
    const result = run([source, output, '0.3', '--browser', browserName]);
    assert.equal(result.status, 0, result.stderr);
    const info = JSON.parse(readFileSync(path.join(output, 'frames.json'), 'utf8'));
    assert.equal(info.width, 640); assert.equal(info.height, 360);
    assert.equal(info.frames.length, Math.ceil(info.duration / 0.3));
    assert.ok(info.frames.length >= 3);
    for (const frame of info.frames) assert.equal(readFileSync(path.join(output, frame.file)).subarray(0, 2).toString('hex'), 'ffd8');
    assert.notDeepEqual(readFileSync(path.join(output, info.frames[0].file)), readFileSync(path.join(output, info.frames.at(-1).file)));
    assert.equal(readFileSync(path.join(output, 'contact-sheet.jpg')).subarray(0, 2).toString('hex'), 'ffd8');
    const before = readdirSync(output);
    const repeat = run([source, output, '0.3', '--browser', browserName]);
    assert.equal(repeat.status, 1); assert.match(repeat.stderr, /choose a new folder/);
    assert.deepEqual(readdirSync(output), before);
  } finally {
    await browser.close();
    // The directory comes from mkdtemp and contains only this test's generated files.
    rmSync(dir, { recursive: true, force: true });
  }
});
