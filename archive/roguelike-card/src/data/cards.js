// 牌表。数值以 docs/GDD.md 第 7 节为准。
export const CARD_TYPES = {
  excuse: '借口',
  social: '社交',
  item: '道具',
  ultimate: '绝招',
  subject: '学科',
};

export const SUBJECTS = { math: '数学', chinese: '语文', english: '英语' };

export const CARDS = {
  // ── 借口 ──
  jiali:       { id: 'jiali', name: '家里有事', type: 'excuse', cost: 1, persuade: 6, face: -3, icon: '🏠', flavor: '「家里……有点事。」' },
  xianzou:     { id: 'xianzou', name: '我先走了', type: 'excuse', cost: 2, persuade: 10, face: -5, icon: '🚪', flavor: '「那我先走了哈。」' },
  jishi:       { id: 'jishi', name: '家有急事', type: 'excuse', cost: 1, persuade: 8, face: -4, icon: '🚨', flavor: '「真的是急事！」' },
  weiteng:     { id: 'weiteng', name: '胃疼', type: 'excuse', cost: 1, persuade: 7, face: -2, icon: '🤢', flavor: '「哎呦，胃又疼了。」' },
  yisheng:     { id: 'yisheng', name: '约了医生', type: 'excuse', cost: 2, persuade: 14, face: -6, icon: '🩺', flavor: '「六点半的号，迟到就作废。」' },
  mama:        { id: 'mama', name: '我妈打电话', type: 'excuse', cost: 1, persuade: 5, face: -3, skipNpc: true, icon: '📱', flavor: '「喂妈？我这就回。」' },
  mingtian:    { id: 'mingtian', name: '明天再说', type: 'excuse', cost: 1, persuade: 6, face: -3, draw: 1, icon: '📅', flavor: '「明天一上班就弄。」' },
  huibao:      { id: 'huibao', name: '汇报进展', type: 'excuse', cost: 1, persuade: 3, face: 0, special: 'report', icon: '📊', flavor: '「老板，今天那个需求已经……」', extra: '对老板：说服 7，疑心 −3' },
  meitingjian: { id: 'meitingjian', name: '装作没听见', type: 'excuse', cost: 1, persuade: 2, composure: 8, face: -2, icon: '🙉', flavor: '「啊？你刚说什么？」' },
  // ── 社交 ──
  enen:        { id: 'enen', name: '嗯嗯好的', type: 'social', cost: 1, composure: 5, face: 0, icon: '👌', flavor: '「嗯嗯，好的好的。」' },
  shouji:      { id: 'shouji', name: '看手机', type: 'social', cost: 1, composure: 3, draw: 1, face: 0, icon: '📲', flavor: '低头，假装回消息。' },
  weixiao:     { id: 'weixiao', name: '微笑点头', type: 'social', cost: 0, composure: 4, face: 0, icon: '🙂', flavor: '职业微笑，核心稳定。' },
  shenhuxi:    { id: 'shenhuxi', name: '深呼吸', type: 'social', cost: 1, composure: 6, face: 2, icon: '🌬️', flavor: '吸气——呼气——' },
  zhuanyi:     { id: 'zhuanyi', name: '转移话题', type: 'social', cost: 1, skipNpc: true, face: 0, icon: '↪️', flavor: '「对了，你昨天那个……」' },
  kua:         { id: 'kua', name: '夸一句', type: 'social', cost: 1, persuade: 3, face: 5, icon: '👏', flavor: '「你这想法真不错！」' },
  jiazhuang:   { id: 'jiazhuang', name: '假装忙', type: 'social', cost: 2, composure: 12, face: 0, icon: '💻', flavor: '疯狂敲键盘。' },
  laren:       { id: 'laren', name: '拉人入局', type: 'social', cost: 1, persuade: 5, face: -1, special: 'bomb', icon: '🧨', flavor: '「这事你得问他，他最懂。」', extra: '对话多同事：说服 15' },
  // ── 道具 ──
  erji:        { id: 'erji', name: '耳机', type: 'item', cost: 1, composure: 7, drawNext: 1, face: 0, icon: '🎧', flavor: '戴上耳机，世界清净。' },
  chongdianbao:{ id: 'chongdianbao', name: '充电宝', type: 'item', cost: 0, persuade: 3, face: 0, eventTag: 'power', icon: '🔋', flavor: '「我手机快没电了，先走。」', extra: '事件「手机没电」免罚' },
  yusan:       { id: 'yusan', name: '雨伞', type: 'item', cost: 0, persuade: 2, face: 0, eventTag: 'umbrella', icon: '☂️', flavor: '「要下雨了，我得赶紧。」', extra: '事件「暴雨」免罚' },
  danche:      { id: 'danche', name: '共享单车券', type: 'item', cost: 1, persuade: 3, face: 0, eventTag: 'bike', icon: '🚲', flavor: '「车还有五分钟过期！」', extra: '事件「地铁延误」免罚' },
  lingshi:     { id: 'lingshi', name: '零食', type: 'item', cost: 0, hunger: 8, exhaust: true, face: 0, icon: '🍫', flavor: '先垫一口。', extra: '用后从牌组移除' },
  // ── 绝招 ──
  houlianpi:   { id: 'houlianpi', name: '厚脸皮', type: 'ultimate', cost: 2, persuade: 20, face: -10, icon: '😤', flavor: '「不好意思，我真的要走了。」' },
  yanji:       { id: 'yanji', name: '演技爆发', type: 'ultimate', cost: 3, persuade: 30, face: -8, icon: '🎭', flavor: '眼含热泪：「我家猫等我喂……」' },
  sizhuang:    { id: 'sizhuang', name: '死装', type: 'ultimate', cost: 2, persuade: 10, composure: 99, face: -4, icon: '🗿', flavor: '面无表情，一个字都不接。' },
  // ── 学科（老师专属，临时牌）──
  math:        { id: 'math', name: '数学', type: 'subject', cost: 0, persuade: 4, face: 0, subject: 'math', icon: '➗', flavor: '「这题……等于 7？」', extra: '答中提问：说服 12，面子 +3' },
  chinese:     { id: 'chinese', name: '语文', type: 'subject', cost: 0, persuade: 4, face: 0, subject: 'chinese', icon: '📖', flavor: '「落霞与孤鹜齐飞——」', extra: '答中提问：说服 12，面子 +3' },
  english:     { id: 'english', name: '英语', type: 'subject', cost: 0, persuade: 4, face: 0, subject: 'english', icon: '🔤', flavor: '「How are you? Fine, thank you.」', extra: '答中提问：说服 12，面子 +3' },
};

export const STARTING_DECK = [
  'jiali', 'jiali', 'jiali',
  'enen', 'enen', 'enen',
  'shouji', 'shouji',
  'xianzou',
  'chongdianbao',
];

// 奖励池：类型权重，再在类型内均匀抽
export const REWARD_TYPE_WEIGHTS = [
  { w: 45, v: 'excuse' },
  { w: 35, v: 'social' },
  { w: 15, v: 'item' },
  { w: 5, v: 'ultimate' },
];

export function cardsOfType(type) {
  return Object.values(CARDS).filter(c => c.type === type);
}

// 牌面文字（自动拼接，保证与数值一致）
export function describe(card) {
  const parts = [];
  if (card.persuade) parts.push(`说服 ${card.persuade}`);
  if (card.composure) parts.push(`镇定 ${card.composure}`);
  if (card.skipNpc) parts.push('对方本回合意图失效');
  if (card.draw) parts.push(`抽 ${card.draw} 张`);
  if (card.drawNext) parts.push(`下回合多抽 ${card.drawNext} 张`);
  if (card.hunger) parts.push(`饥饿 ${card.hunger > 0 ? '+' : ''}${card.hunger}`);
  if (card.face) parts.push(`面子 ${card.face > 0 ? '+' : ''}${card.face}`);
  if (card.extra) parts.push(card.extra);
  return parts.join('，');
}

let uidCounter = 1;
export function makeCard(id, temp = false) {
  return { id, uid: `${id}#${uidCounter++}`, temp };
}
export function resetUid(n = 1) { uidCounter = n; }
