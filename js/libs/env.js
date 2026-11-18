// 微信小游戏运行环境兜底：必须在所有模块之前加载（PixiJS 模块一加载就会用到 globalThis）。
/* global GameGlobal */
if (typeof globalThis === 'undefined' && typeof GameGlobal !== 'undefined') GameGlobal.globalThis = GameGlobal;
