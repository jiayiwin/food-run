// 资源清单。缺图时 UI 自动退回 emoji，缺音乐时静音。
export const CHAR_SHEET = id => `assets/char/${id}.webp`;
// 三栏精灵：过热 / 安全 / 过冷
export const SHEET_COL = { hot: 0, safe: 1, cold: 2 };
export const BG = {
  office: 'assets/bg/office.jpg',
  lobby: 'assets/bg/lobby.jpg',
  street: 'assets/bg/street.jpg',
  home: 'assets/bg/home.jpg',
  title: 'assets/bg/title.jpg',
};
export const BG_BY_ACT = { 1: 'office', 2: 'street', 3: 'home' };
export const BGM = {
  calm: 'assets/bgm/calm.mp3',
  tense: 'assets/bgm/tense.mp3',
};
