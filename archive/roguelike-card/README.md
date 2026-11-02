# Project: Belly First — 《今天必须吃到饭》

Roguelike 卡牌 + 叙事。每次下班是一局：在「公司 → 路上 → 到家」的分叉路图上选节点，遭遇 NPC 时出牌说服对方放你走。饥饿值是时钟，面子值是弹药，最后一口饭才算赢。

方向来源：《下班了，我要吃饭》六方向概念文档中的 ①。详细规则与数值见 [docs/GDD.md](docs/GDD.md)。

## 运行

纯前端，无构建步骤，无依赖。

```
npm run dev        # 启动本地静态服务器 → http://localhost:5173/
npm test           # 规则验收用例 + 随机 / 贪心 AI 各 200 局模拟
```

直接双击 `index.html` 不行（ES Module 需要 http），请用上面的 dev 服务器或任意静态服务器。

## 目录

```
index.html          入口页
style.css           样式（深色单主题）
src/
  main.js           事件分发 + localStorage 存档
  ui.js             state → HTML 渲染
  run.js            单局状态机：地图行走 / 事件 / 补给 / 奖励 / 结算 / 序列化
  battle.js         遭遇引擎：能量、抽牌、镇定、意图、疑心、阶段 BOSS
  map.js            分叉路图生成
  rng.js            可序列化的随机数
  data/cards.js     牌表（28 张）
  data/npcs.js      NPC 表（9 个）
  data/events.js    事件表（10 个）
test/
  agent.js          自动试玩 AI（random / greedy）
  rules.test.js     验收用例（对应 GDD 第 12 节）
tools/serve.js      零依赖静态服务器
docs/GDD.md         详细设计文档（数值定稿）
docs/design.html    设计文档网页版（发布为 Artifact 用）
```

## 规则一页纸

- 饥饿 100 起，每进一个节点 −3，遭遇每回合 −1，归零即败。低于 20 时 2 费牌和绝招不可用。
- 面子 60 起。借口消耗面子；< 30 借口费用 +1 且 NPC 更难缠；> 80 NPC 也更难缠。
- 每回合 3 能量、抽 5 张。NPC 意图公开：唠叨（回粘性）/ 拖时间（扣饥饿）/ 追问（扣面子，镇定可挡）。
- 同一借口全局用过 2 次后说服减半。
- 老板：每张借口牌 +1 疑心，满 5 加班。「汇报进展」压疑心。
- 老师：发 3 张学科牌，答中提问大额说服。
- 家门 BOSS 三阶段；路上接过家人电话可跳过阶段 2。

## 后续版本（不在 v0.1）

局外解锁、牌升级、商店与货币、每日种子排行榜（需 Koa2 后端）、微信小游戏移植（Canvas 重写 UI 层，`src/` 逻辑层不变）、美术与音效。
