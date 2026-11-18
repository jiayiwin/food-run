// 美术清单：由 tools/art/build.py 生成，别手改。
// 空的时候所有东西回退到代码绘制，游戏照样能玩。
//   bg[路段][层] = { src, w, h, par, dy }：w/h 逻辑像素（横向无缝平铺的一格），par 视差，dy 底边相对地面线的偏移
//   chars[角色] = { src, parts, heads }：见 js/render/rig.js 的 drawPerson 注释
export const ART_MANIFEST = { base: 'art/', bg: {}, chars: {} };
