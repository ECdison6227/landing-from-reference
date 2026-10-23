// Local-only video sampling. No ffmpeg or file:// access permissions required.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const usage = 'Usage: node scripts/frames.mjs <video> <outDir> [seconds=2] [--browser msedge|chrome|chromium] [--from package.json] [--max-frames 240]';

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    help: { type: 'boolean', short: 'h' }, browser: { type: 'string' },
    from: { type: 'string' }, 'max-frames': { type: 'string', default: '240' },
  } });
  if (values.help) { console.log(usage); return; }
  const [video, outDir, seconds = '2'] = positionals;
  if (!video || !outDir || positionals.length > 3) throw new Error(usage);
  const step = Number(seconds), limit = Number(values['max-frames']);
  if (!Number.isFinite(step) || step < 0.2) throw new Error('Sampling interval must be a finite number >= 0.2 seconds.');
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('--max-frames must be a positive integer.');
  const source = path.resolve(video), target = path.resolve(outDir);
  if (!existsSync(source) || !statSync(source).isFile()) throw new Error('Video file does not exist.');
  const browserName = values.browser ?? (process.platform === 'win32' ? 'msedge' : 'chromium');
  if (!['msedge', 'chrome', 'chromium'].includes(browserName)) throw new Error('Unknown browser; choose msedge, chrome or chromium.');
  for (const file of ['contact-sheet.jpg', 'frames.json']) {
    if (existsSync(path.join(target, file))) throw new Error('Output already contains extracted frames; choose a new folder.');
  }
  const from = values.from ?? process.env.PLAYWRIGHT_FROM;
  const require = createRequire(from ? path.resolve(from) : import.meta.url);
  let chromium;
  for (const dependency of ['@playwright/test', 'playwright']) {
    try { ({ chromium } = require(dependency)); break; } catch { /* Try the other package. */ }
  }
  if (!chromium) throw new Error('Playwright not found. Run npm ci here or pass --from <package.json>.');
  const size = statSync(source).size;
  const mime = ({ '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/mp4' })[path.extname(source).toLowerCase()] ?? 'application/octet-stream';
  const server = createServer((req, res) => {
    if (req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><html><body><video id="video" muted preload="auto" src="/video"></video></body></html>');
      return;
    }
    if (req.url !== '/video') { res.writeHead(404); res.end(); return; }
    const range = req.headers.range;
    let start = 0, end = size - 1;
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!match) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return; }
      start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), end) : end;
      if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return; }
    }
    res.writeHead(range ? 206 : 200, { 'Content-Type': mime, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) });
    if (req.method === 'HEAD') { res.end(); return; }
    const stream = createReadStream(source, { start, end });
    stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
  });
  let browser;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    browser = await chromium.launch({ headless: true, ...(browserName === 'chromium' ? {} : { channel: browserName }), args: ['--mute-audio'] });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const v = document.querySelector('video');
      if (v.error) throw new Error('Selected browser cannot decode this video.');
      return v.readyState >= 2 && Number.isFinite(v.duration) && v.duration > 0 && v.videoWidth > 0;
    }, null, { timeout: 20000 });
    const info = await page.evaluate(() => {
      const v = document.querySelector('video');
      return { duration: v.duration, width: v.videoWidth, height: v.videoHeight };
    });
    const count = Math.ceil(info.duration / step);
    if (count > limit) throw new Error(`Video needs ${count} frames; increase the sampling interval or --max-frames (current ${limit}).`);
    mkdirSync(target, { recursive: true });
    const frames = [], index = [];
    for (let i = 0; i < count; i++) {
      const time = i * step;
      const data = await page.evaluate(async time => {
        const v = document.querySelector('video');
        if (Math.abs(v.currentTime - time) > 0.001) {
          await new Promise((resolve, reject) => {
            const clean = () => { clearTimeout(timer); v.removeEventListener('seeked', done); v.removeEventListener('error', fail); };
            const done = () => { clean(); resolve(); };
            const fail = () => { clean(); reject(new Error('Video seek failed.')); };
            const timer = setTimeout(fail, 15000);
            v.addEventListener('seeked', done); v.addEventListener('error', fail); v.currentTime = time;
          });
        }
        const scale = Math.min(1, 1280 / v.videoWidth), canvas = document.createElement('canvas');
        canvas.width = Math.round(v.videoWidth * scale); canvas.height = Math.round(v.videoHeight * scale);
        canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.85);
      }, time);
      const file = `f_${String(i).padStart(4, '0')}_${time.toFixed(1)}s.jpg`;
      writeFileSync(path.join(target, file), Buffer.from(data.split(',')[1], 'base64'));
      frames.push(data); index.push({ time, file });
    }
    const sheet = await page.evaluate(async ({ frames, step }) => {
      const imgs = await Promise.all(frames.map(src => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; })));
      const cols = Math.min(5, imgs.length), w = 300, h = Math.round(w * imgs[0].height / imgs[0].width);
      const canvas = document.createElement('canvas'); canvas.width = cols * w; canvas.height = Math.ceil(imgs.length / cols) * (h + 20);
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#111'; ctx.font = '12px sans-serif';
      imgs.forEach((img, i) => { const x = i % cols * w, y = Math.floor(i / cols) * (h + 20); ctx.drawImage(img, x, y + 20, w - 4, h); ctx.fillText(`${(i * step).toFixed(1)}s`, x + 4, y + 14); });
      return canvas.toDataURL('image/jpeg', 0.85);
    }, { frames, step });
    writeFileSync(path.join(target, 'contact-sheet.jpg'), Buffer.from(sheet.split(',')[1], 'base64'));
    writeFileSync(path.join(target, 'frames.json'), JSON.stringify({ ...info, interval: step, frames: index }, null, 2) + '\n');
    console.log(`${count} frames + contact-sheet.jpg + frames.json`);
  } finally {
    try { await browser?.close(); } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
