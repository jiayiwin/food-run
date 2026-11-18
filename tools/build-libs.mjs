// 打包第三方库到 js/libs/（小游戏里没有 npm，直接把产物放进包里）：node tools/build-libs.mjs
import { build } from 'esbuild';
const r = await build({
  entryPoints: ['tools/pixi-entry.mjs'],
  bundle: true, minify: true, format: 'esm', target: 'es2017',
  outfile: 'js/libs/pixi.js', legalComments: 'eof', metafile: true,
  banner: { js: '// PixiJS 7.4.2（MIT）按需打包，生成文件，别手改：node tools/build-libs.mjs' },
});
const bytes = Object.values(r.metafile.outputs)[0].bytes;
console.log(`js/libs/pixi.js ${(bytes / 1024).toFixed(0)}KB`);
