# 狂奔吧，打工人

微信小游戏：横版跑酷 + 限时二选一。18:00 下班，躲开障碍、用两秒编好借口，别被同事追上，回家吃上热饭。

策划案见 [docs/GDD.md](docs/GDD.md)。

## 技术栈

| 层 | 用的什么 |
|---|---|
| 平台 | 微信小游戏原生（`game.js` 入口），JavaScript ES 模块 |
| 渲染 | **PixiJS 7（WebGL）**，按需打包在 `js/libs/pixi.js`（约 336KB）；WebGL 起不来自动退回 Canvas 2D |
| 绘制接口 | `js/gfx/`：即时绘制接口（按调用顺序画），底层复用精灵池直接提交 WebGL 批处理；矢量画第一次用到时烘焙成贴图 |
| 角色 | 程序化骨骼（关节角度 → 姿势），每个部件一张贴图（AI 美术或烘焙的矢量画），三种表情头 |
| 美术 | 扁平贴纸风（A），AI 绘图（GPT-Image 2.5）生成 → `tools/art/build.py` 清理光晕 / 切片 / 打包 → `art/` + `js/data/art.js` |
| 音频 | 2 首 BGM（跑酷 / 标题和到家，mp3 循环）+ WebAudio 实时合成音效 |
| 逻辑 | 纯 JS，可复现（种子随机数），每帧按真实时间切成 ≤1/60 秒的小步推进 |

## 在微信开发者工具里跑

1. 打开微信开发者工具 → 导入项目 → 选本目录（`project.config.json` 里是游客 appid，正式发布换成自己的）。
2. 项目类型是「小游戏」，入口 `game.js`。本地设置里保持「ES6 转 ES5」「增强编译」打开。
3. `dev/`、`tools/`、`test/`、`docs/`、`art-src/` 已在打包时忽略，主包约 2.6MB（上限 4MB）。
4. 第一次真机测试按 [docs/微信首测清单.md](docs/微信首测清单.md) 过一遍。开发版和体验版左下角显示渲染方式和帧率，报错会弹窗。

## 在浏览器里调试（不用开发者工具）

```
npm run dev          # http://localhost:5173/dev/
```

`dev/wx-shim.js` 在浏览器里模拟了用到的 `wx.*` 接口，游戏代码不用改。键盘：↑/空格 跳、↓ 滑铲、←/→ 选、1/2/3 便利店、P 暂停。

调试参数（加在 `/dev/` 后面）：

| 参数 | 作用 |
|---|---|
| `?w=375&h=812&notch=1` | 模拟屏幕尺寸和刘海 |
| `?scene=play&seed=5` | 直接开一局（固定种子） |
| `&tutorial=1` | 新手局 |
| `&bot=1` / `2` / `3` | 机器人代打：老手 / 完美 / 完美操作但每题选错 |
| `&gfx=canvas` | 强制用 Canvas 2D 后端（对照 / 兜底测试） |
| `&wxstrict=1` | 藏掉微信里没有的 DOM 全局变量，检验渲染层不依赖它们 |
| `&hitbox=1` | 显示判定框（障碍红、主角绿），核对美术图和碰撞 |
| `&art=/dev/art-candidates/A/manifest.json` | 换一份美术清单（对比风格） |
| `?gallery` `?scenery` `?props` | 旧版矢量人物姿势、场景、障碍陈列（`dev/legacy/`） |

截图（无头 Chrome，精确手机视口）：

```
node tools/shot.mjs out --w 375 --h 812 --notch --url "/dev/?scene=play&seed=3&bot=1" --script steps.json
```

steps.json 支持 `wait` / `key` / `tap` / `swipe` / `eval` / `shot`；`eval` 里可以用 `__game.scene.skip(秒, 条件)` 快进到想看的时刻。

## 测试

```
npm test
```

- 手感：跳高 / 滞空 / 滑铲时长 / 急降接滑铲 / 输入缓冲 / 土狼时间
- 路线：相邻障碍满足反应时间间距，读题窗口里没有障碍
- 文案长度：台词 ≤14 字、选项 ≤8 字（家门口 ≤6 / ≤4）
- 判定顺序：资源 > 记仇 > 疲劳 > 基础
- 公平性：完美操作零碰撞；干净地跑，每题都选错也一定甩得掉；新手局能跑完；掉井能爬出来
- 手势：按住 70ms 提前起跳、不重复触发、滑动不误跳
- 内容：每日词条的规则和可通关性、借口图鉴目录
- 微信环境模拟：`node tools/wxsim.mjs`，无 DOM、逐文件转 CommonJS，机器人跑完整局

平衡性扫描（4 档机器人各 40 局，含每日词条对比）：`node tools/balance.mjs`

## 美术管线

```
python tools/art/build.py build art-src/spec.json    # 原图 → art/（游戏用）+ js/data/art.js（清单）
python tools/art/build.py slice <部件表.png> <目录>   # 把部件表 / 楼体表切成单块
python tools/art/build.py clean <in.png> <out.png>   # 去掉 AI 透明底的灰色光晕
node tools/build-libs.mjs                            # 重新打包 PixiJS
```

`art-src/spec.json` 写每张图在游戏里的尺寸、锚点和角色部件顺序；清单为空时游戏全部回退到代码绘制。

## 目录

```
game.js / game.json / project.config.json   小游戏入口与配置
js/platform/   唯一直接碰 wx 的地方（画布、触摸、存档、音频、分享）+ WebAudio 合成音效
js/core/       随机数、手势识别、固定步长循环
js/data/       数值表、障碍、NPC 台词、事件文案（改平衡 / 加台词只动这里）
js/game/       纯逻辑：主角物理、路线生成、选择判定、一局的状态机、机器人
js/gfx/        渲染接口：WebGL（PixiJS）/ Canvas 2D 两个后端、贴图烘焙
js/libs/       第三方库（PixiJS 按需打包，生成文件）
js/render/     画面：人物骨骼、场景、障碍、HUD、气泡和卡片、特效、美术加载
js/scenes/     标题 / 跑一局 / 下班战报 / 借口图鉴
art/           打包好的美术（生成文件）
audio/         BGM（跑酷、标题和到家，循环）
art-src/       美术原图和打包规格（不进包）
dev/ tools/ test/ docs/   调试、截图、测试、策划案（不进包）
```
