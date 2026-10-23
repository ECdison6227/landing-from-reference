# 配套工具

工具依赖在本技能仓库内安装，二维码依赖使用独立 Python 虚拟环境。脚本不会自动安装包，也不会修改产品项目的依赖。

## 视频抽帧

```bash
npm ci
npx playwright install chromium
node scripts/frames.mjs ./reference.mp4 ./output/frames 2 --browser chromium
```

- 位置参数：录屏、输出目录、采样间隔秒数（默认 2 秒）。
- `--browser msedge` 使用本机 Edge；`--browser chrome` 使用本机 Chrome；`--browser chromium` 使用 Playwright Chromium。Windows 默认 Edge，其他系统默认 Chromium。
- `--from /path/to/package.json` 可复用已有项目安装的 Playwright，无须在产品项目里重新装包。
- `--max-frames 240` 限制最大帧数，长录屏可以增大采样间隔或显式提高上限。
- 输出逐帧 JPEG、`contact-sheet.jpg` 总览与 `frames.json` 时间索引。

视频仅通过临时的 `127.0.0.1` 服务供浏览器解码，不上传。格式支持取决于所选浏览器；MP4 解码失败时可尝试系统 Edge 或 Chrome。截图能呈现关键状态，不能完整代替原录屏的动效观察。

## 二维码裁切与校验

```bash
python scripts/qr.py ./contact.png ./output/qr.png
python scripts/qr.py ./contact.png ./output/qr.png 0.1 0.2 0.9 0.8
```

可选的四个数字是相对于图片宽高的 `左 上 右 下` 边界，范围为 0–1。默认处理整图；遇到多个二维码时指定区域，确保区域内只有目标二维码。

默认保留颜色，增加白色边距，并验证输出与原区域的二维码内容一致后才写入文件。支持 `--size 520` 调整输出尺寸，`--monochrome` 生成黑白图；若处理后不能正确解码，命令失败。

默认只打印校验状态，不打印二维码携带的链接。确实需要查看时使用 `--show-payload`，不要将输出的真实群链接提交到公开仓库。

二维码工具验证的是编码内容，不验证目标链接能否打开、群是否已满或邀请码是否过期。发布前仍需在最终页面实际扫码检查。
