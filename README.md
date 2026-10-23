# landing-from-reference

把“参考录屏 → 理解产品 → 重设计 Landing → 浏览器验收 → 按需交付”的方法，整理成可复用的 Agent 技能。

适合已有产品源码、希望借鉴另一个网站的版式、卡片和动效来制作产品介绍页的场景。支持产品内首页和独立展示页，不限定框架或视觉风格。

## 包里有什么

| 文件 | 用途 |
| --- | --- |
| `SKILL.md` | 技能入口、工作步骤和任务边界 |
| `references/brief-template.md` | 下次开工可直接填写的材料模板 |
| `references/reference-analysis.md` | 拆解录屏与映射产品功能的表格 |
| `references/implementation.md` | 组件复用、入口返回、动效与验收要点 |
| `references/delivery.md` | 独立 HTML、表单和服务器发布流程 |
| `references/lessons.md` | 端口、Windows、并行修改等实际经验 |
| `references/tools.md` | 配套工具安装与命令 |
| `scripts/frames.mjs` | 从录屏抽帧，生成带时间标签的总览图 |
| `scripts/qr.py` | 裁切二维码，并核对原图与输出的解码结果 |

这份包提取了真实项目中的流程和工具，未包含产品源码、参考录屏、真实群二维码、服务器账号或报名记录。使用参考素材时，请自行确保有相应使用权限。

## 安装技能

把整个仓库放进所用 Agent 的技能目录，文件夹名保持 `landing-from-reference`。例如在使用 `~/.codex/skills` 的环境：

```bash
git clone https://github.com/franzkotkowski330-collab/landing-from-reference.git ~/.codex/skills/landing-from-reference
```

其他使用 `SKILL.md` 的工具可将同一文件夹放进其技能目录。也可以下载 [ZIP 技能包](https://github.com/franzkotkowski330-collab/landing-from-reference/releases/latest)，解压后安装。

技能正文可以直接使用；只有需要抽帧或二维码处理时，才安装对应工具的依赖。

## 下次怎么用

根据 [开工模板](references/brief-template.md) 填写材料，然后发送：

```text
请使用 landing-from-reference 技能，为我的产品重设计 Landing 页面。
产品名：示例产品
源码：本机的项目目录，或附上的 ZIP
参考：录屏文件路径；有公开网址时一并提供
页面性质：替换产品首页，“开始使用”进入编辑器，编辑器可返回首页
品牌：沿用产品的字体和主色，可重新安排版式与动效
报名：不需要
交付：先本地预览，由我决定是否部署
语言：中文为主，可少量英文
```

支持斜杠命令的工具可用 `/landing-from-reference`；支持技能提及的工具可用 `$landing-from-reference`。是否自动识别由具体工具决定。

## 安装配套工具

需要 Node.js 22+；二维码工具需要 Python 3.10+。在本仓库内安装，避免把临时依赖装进产品项目：

```bash
npm ci
npx playwright install chromium
python -m venv .venv
```

Windows PowerShell：

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
node scripts/frames.mjs "C:\materials\reference.mp4" "C:\materials\frames" 2 --browser msedge
.\.venv\Scripts\python.exe scripts/qr.py "C:\materials\contact.png" "C:\materials\qr.png"
```

macOS / Linux：

```bash
.venv/bin/python -m pip install -r requirements.txt
node scripts/frames.mjs ./reference.mp4 ./output/frames 2 --browser chromium
.venv/bin/python scripts/qr.py ./contact.png ./output/qr.png
```

详细参数与限制见 [工具说明](references/tools.md)。

## 工具验证

```bash
npm test
```

二维码测试需要测试依赖，在虚拟环境中执行：

```bash
python -m pip install -r requirements-dev.txt
python -m unittest discover -s tests -p "test_*.py"
```

这里的 `python` 请替换为虚拟环境中的解释器路径。测试使用临时生成的视频和二维码，不依赖私人素材。

技能可以指导实现独立 HTML 和部署，但没有附带通用站点生成器或自动部署程序；实际页面仍需根据具体产品实现。
