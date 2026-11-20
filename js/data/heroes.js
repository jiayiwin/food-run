// 主角两套外观（矢量兜底的颜色和配件；AI 立绘是 art-src/spec.json 的 chars.player / chars.playerF）。
// 男主角 player、女主角 playerF：同一身行头（蓝西装、白衬衫、黄书包、藏青裤、红鞋），同一套骨骼比例；
// 女主角高马尾 + 领口小红蝴蝶结（男主角是领带）。开局选、首页底部能改，按存档 save.gender 取（见 js/render/looks.js）
export const HERO_LOOKS = {
  player: { skin: '#ffd2b0', hair: '#2b2233', hairStyle: 'messy', shirt: '#ffffff', jacket: '#4b7bec', pants: '#2f3b52', shoes: '#ff6b5a', tie: '#ff6b5a', bag: '#f7b731', scale: 1 },
  playerF: { skin: '#ffd2b0', hair: '#2b2233', hairStyle: 'ponytail', shirt: '#ffffff', jacket: '#4b7bec', pants: '#2f3b52', shoes: '#ff6b5a', bow: '#ff6b5a', bag: '#f7b731', scale: 1 },
};
