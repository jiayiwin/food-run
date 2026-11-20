import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('微信环境模拟：无 DOM、CommonJS 加载，机器人跑完整局不报错、不缺图', () => {
  // 缺省（全程关、机器人坐电梯）、走楼梯（楼梯间的墙面、拖把水桶）、周二坐电梯 + 女主角（追逐槽、定格教学、轿厢里的女主角）、周三（路口）、
  // 带薪摸鱼 + 女主角、选关页、老玩家的标题页（没选过主角：先到选主角页）、新玩家的选主角页、女主角的标题页；
  // 家庭剧本：一人一猫·猫罐头见底（猫、货架印章、HUD 便签、门口和饭桌）、合租屋·帮拿外卖 + 女主角（拾取物、快递柜）、有娃家·要礼物 + 女主角（开局交代、高脚椅、视频手机）
  // 发布前回归：序章 + 女主角（定格教学、答错不追）、今日挑战回奶奶家（润喉糖）、好友卡带家的标题页（女主角）、爸妈家·爸爸的快递（跳起来够）
  for (const q of [null, 'scene=play&seed=4&bot=1&route=stairs', 'scene=play&level=tue&seed=5&bot=2&route=lift&gender=f', 'scene=play&level=wed&seed=6&bot=2', 'scene=play&level=mon&seed=7&bot=1&assist=1&gender=f', 'scene=levels', 'scene=title&save=old', 'scene=hero&save=new', 'scene=title&gender=f',
    'scene=play&seed=3&bot=2&story=cat.catfood', 'scene=play&seed=5&bot=2&story=share.takeaway&gender=f', 'scene=play&seed=6&bot=1&story=kid.gift&gender=f',
    'scene=play&level=prologue&seed=8&bot=2&gender=f', 'scene=play&seed=2&bot=2&daily=1&story=nainai.candy', 'scene=title&gender=f&seed=5&t=18:52&d=0&lv=full&cv=6&h=share.tissue', 'scene=play&seed=9&bot=1&story=parents.parcel']) {
    const r = spawnSync(process.execPath, ['tools/wxsim.mjs', ...(q ? ['--query', q] : [])], { encoding: 'utf8', timeout: 120000 });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  }
});
