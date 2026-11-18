// PixiJS 按需打包入口（tools/build-libs.mjs 用）。只要渲染核心：不要 events / accessibility 这类依赖 DOM 的模块。
export * from '@pixi/core';
export * from '@pixi/display';
export * from '@pixi/sprite';
export * from '@pixi/graphics';
export * from '@pixi/text';
export * from '@pixi/mesh';
export * from '@pixi/mesh-extras';
// 微信小游戏禁止 new Function / eval：用预编译的 uniform 同步函数替换
import '@pixi/unsafe-eval';
