// 家庭剧本：今晚回哪个家、谁在门口等你、路上家里交代了什么、门口问什么、晚饭吃什么。纯数据 + 纯函数，node 测试直接用。
// 一局 = 一个家庭（FAMILIES）里的一个故事（stories），键写成「家庭.故事」，例如 'parents.soy'。逻辑在 js/game/story.js。
//
// 文案约束（test/family.test.js 强制，男 / 女主角两套称呼都算）：
//   门口终题：台词 ≤6 字、选项 ≤4 字、反应 ≤14 字
//   来电台词 / 来电反应 / 开局一句 / 饭桌一句 / 家里那边（含「家里：」）/ 规则台词 ≤14 字
//   家庭名 ≤4、一句介绍 ≤14、攻略 ≤14、待办名 ≤3、商品名 ≤4、商品说明 ≤7、菜名 ≤8、称号 ≤6、分享短句 ≤8、故事名 ≤6
// 提到主角性别的词写成 {键}（{爸爸} 是孩子叫你、{兄弟} 是室友叫你、{乖孙}、{好小子}、{老婆}……），画字时按当前主角换，见 js/data/address.js。
// 注意「爸爸」两种意思：爸妈家里的爸爸是你爸（照写），有娃家里朵朵叫你的才是 {爸爸}。
// 三条铁律在这里的落法：
//   ① 钩子不加新动作：只借用来电（左右滑）、便利店（点货架）、跳起来够东西
//   ② 钩子不加停住点：家里要的东西摆在原来的便利店里；拾取物不停世界
//   ③ 交代、提醒、拾取物都按主角跑到的位置触发；家庭逻辑不消耗 run.rng
// 家庭不改到家时间：来电效果所有家庭同一个常量 HOME_CALL；门口选项不许带 eff / cost；买家里要的东西不加时钟分钟。
import { RES } from './tune.js';

const q = (id, line, a, b, more = {}) => ({ id, line, opts: [a, b], ...more });
const o = (text, tag, good, react, more = {}) => ({ text, tag, good, react, lol: 0, ...more });

// ── 家里来电：所有家庭只换台词，效果完全一样（和原来的妈妈来电相同）────────
export const HOME_CALL = {
  pick: { slow: 3, slowK: 0.75, flag: 'momHappy' },   // flag 沿用历史名：mom* = 家里
  hang: { flag: 'momAngry' },
};
export const ERRAND_CALL = { pick: '嗯嗯，记住了', hang: '（嘟——嘟——）' };   // 交代事情的来电：接 / 挂后的反应（挂了事情照样记下）

// ── 成员：门口和饭桌上出现的人（id 不能和 NPCS 重名；外观在 js/render/looks.js 按同一个 id 配，立绘是 AI 出图）──
//   ruleLines：门口终题被规则改写判定时说的话（饿了说真话 / 记仇 / 借口疲劳 / 钱不够 / 超时）
export const MEMBERS = {
  mom: {
    name: '妈妈', role: '终极守门员', traits: ['刀子嘴', '豆腐心'], hint: '说实话就有饭吃',
    ruleLines: { hungry: '饿坏了吧？快进来', grudge: '又来这套？', tired: '骗谁呢', broke: '回家还要钱？', timeout: '……傻站着干嘛' },
  },
  dad: {
    name: '爸爸', role: '沉默后援', traits: ['话少', '偷偷留菜'], hint: '他的快递比你重要',
    ruleLines: { hungry: '先吃饭，别说了', grudge: '又来？', tired: '编，接着编', broke: '找你妈要去', timeout: '……发啥愣' },
  },
  dapeng: {
    name: '大鹏', role: '室友 · 程序员', traits: ['夜猫子', '嘴硬心软'], hint: '讲义气，好处分他一半',
    ruleLines: { hungry: '先吃，泡面分你', grudge: '又来这套', tired: '这话你说八百遍了', broke: '没钱就别装大款', timeout: '……发啥呆呢' },
  },
  juzi: {
    name: '橘子', role: '主子 · 胖橘猫', traits: ['饭点准', '记仇'], hint: '先喂它，再顾自己', cat: true,
    ruleLines: { hungry: '（它陪你一起饿着）', grudge: '（它甩了甩尾巴）', tired: '（它打了个哈欠）', broke: '（它看你钱包空空）', timeout: '（它转身走了）' },
  },
  duoduo: {
    name: '朵朵', role: '女儿 · 5岁', traits: ['较真', '记性好'], hint: '答应孩子的事，她都记得',
    ruleLines: { hungry: '{爸爸}快吃饭！', grudge: '你又这么说', tired: '你说过了！', broke: '我存钱罐借你', timeout: '（朵朵拽你袖子）' },
  },
  laolao: {
    name: '姥姥', role: '帮你带娃', traits: ['嗓门大', '护孙女'], hint: '嘴甜一点，饭就热乎',
    ruleLines: { hungry: '饿了吧？先吃饭', grudge: '又来这套？', tired: '这话我听腻了', broke: '妈这有零钱', timeout: '……愣着干啥' },
  },
  nainai: {
    name: '奶奶', role: '投喂担当 · 80岁', traits: ['耳背', '最疼你'], hint: '奶奶给啥就吃啥',
    ruleLines: { hungry: '快！先吃个鸡腿', grudge: '又说这个？', tired: '奶奶耳背，心不背', broke: '奶奶给你钱', timeout: '啥？大点声！' },
  },
};

// ── 门口情况：在门口终题预出题时（离门约 1.6 秒）拍一次快照 s，按顺序判定 ──────
//   s = { flags, clockMin（预计到家时刻）, par, home: { early, promise, late }, sat, boxes, shops, rides, wet, errand, seed }
//   强情况按家庭自己的 order 取第一个；都不成立时，在成立的弱情况里按种子轮换（不消耗 run.rng）
export const SITUATIONS = {
  always: () => true,
  intact: s => s.boxes >= RES.boxes,
  angry: s => !!s.flags.momAngry,
  promise: s => !!s.flags.momHappy && s.clockMin > s.par + s.home.promise,
  broken: s => s.boxes < RES.boxes,
  wet: s => !!s.wet,
  takeout: s => !!s.flags.takeout,
  late: s => s.clockMin > s.par + s.home.late,
  hungry: s => s.sat < RES.hungry,
  early: s => s.clockMin <= s.par + s.home.early,
  bought: s => s.shops > 0,
  rode: s => s.rides > 0,
  normal: () => true,
};
export const STRONG = ['angry', 'promise', 'broken', 'wet', 'takeout', 'late', 'hungry', 'early'];
export const WEAK = ['bought', 'rode', 'normal'];
// 门口判定规则：选项带 rule 时，规则成立才算真话（js/game/choice.js 的 judgeRaw 查这张表）
export const RULES = {
  powerbank: c => !!(c.flags && c.flags.powerbank),   // 借过阿杰充电宝：「没电了」是真话
  bought: c => (c.shops || 0) > 0,                    // 路上真进店给自己买过东西：「去买东西」是真话
};

// ── 钩子（家里交代的事）：交代 → 路上顺手办 → 门口兑现 ─────────────────
//   give.by：'call' 这一局第一个来电槽固定是这位家人，台词换成 give.line；'start' 开局卡上交代（故事的 intro）
//   carrier.kind：'store' 便利店货架第 3 格换成它；'pickup' 路上悬着一件东西，跳起来够（at 是位置锚点）
//   办了：晚饭 +1 档；忘了：晚饭最高到 2 档（最好的那道菜做不成）。不碎饭盒、不扣饱腹、不耽误时间
export const ERRAND_EFFECT = { done: { mood: 1 }, miss: { cap: 2 } };
export const ERRANDS = {
  soy: {
    id: 'soy', name: '酱油', icon: { shape: 'bottle', color: '#5a2e1a', label: '酱' }, from: 'mom',
    give: { by: 'call', line: '下班带瓶酱油！' },
    carrier: { kind: 'store', item: { id: 'soy', name: '酱油', price: 6, note: '妈妈要的' } },
    door: {
      done: q('mom_soy1', '酱油呢？', o('在这呢', '真话', true, '这孩子，懂事'), o('你猜', '顶嘴', 'mid', '……给我拿来')),
      miss: q('mom_soy2', '酱油呢？', o('忘了', '真话', true, '……红烧肉做不成了'), o('卖完了', '装傻', false, '楼下就有卖的', { lol: 1 })),
    },
    dinner: { done: '爸爸说：红烧肉真香', miss: '没酱油，红烧肉泡汤了' },
    title: '打酱油的', share: { done: '酱油也带了', miss: '酱油忘买了' },
  },
  parcel: {
    id: 'parcel', name: '快递', icon: { shape: 'box', color: '#c98a4b', label: '件' }, from: 'dad',
    give: { by: 'call', line: '快递到了，帮我拿下' },
    carrier: { kind: 'pickup', at: 'stage:home:0.25', shape: 'parcel' },   // 楼道口的快递堆
    door: {
      done: q('dad_box1', '快递呢？', o('在这', '真话', true, '{好小子}！'), o('你猜', '顶嘴', 'mid', '别闹，给我')),
      miss: q('dad_box2', '快递呢？', o('忘了', '真话', true, '……明天我自己拿'), o('没到', '装傻', false, '短信说到了啊', { lol: 1 })),
    },
    dinner: { done: '爸爸拆了一晚上快递', miss: '爸爸下楼自己拿快递' },
    title: '快递搬运工', share: { done: '顺手拿了快递', miss: '快递又没拿' },
  },
  tissue: {
    id: 'tissue', name: '纸', icon: { shape: 'roll', color: '#ffffff', label: '纸' }, from: 'dapeng',
    give: { by: 'call', line: '纸没了！速带！！' },
    carrier: { kind: 'store', item: { id: 'tissue', name: '卫生纸', price: 6, note: '大鹏急用' } },
    door: {
      done: q('dp_tis1', '纸！纸呢！', o('接着', '真话', true, '……你是我{亲哥}'), o('没买', '装傻', 'mid', '别闹，快给我')),
      miss: q('dp_tis2', '纸！纸呢！', o('忘了', '真话', true, '……我自己下楼'), o('用报纸', '顶嘴', 'mid', '……你是魔鬼', { lol: 3 })),
    },
    dinner: { done: '大鹏说今晚他请客', miss: '大鹏说：下次你等着' },
    title: '送纸侠', share: { done: '救了室友一命', miss: '室友还在等纸' },
  },
  takeaway: {
    id: 'takeaway', name: '外卖', icon: { shape: 'bag', color: '#ffb347', label: '饭' }, from: 'dapeng',
    give: { by: 'call', line: '外卖在快递柜，帮我拿' },
    carrier: { kind: 'pickup', at: 'stage:park:0.28', shape: 'bag' },     // 小区里快递柜旁挂着的外卖袋（快递柜代码画）
    door: {
      done: q('dp_bag1', '外卖拿了？', o('拿了', '真话', true, '{好兄弟}！分你鸡腿'), o('吃了', '顶嘴', 'mid', '……你最好是开玩笑', { lol: 2 })),
      miss: q('dp_bag2', '我饭呢？', o('下顿我请', '顺从', true, '……这可是你说的'), o('被偷了', '装傻', false, '你嘴角有油', { lol: 3 })),
    },
    dinner: { done: '大鹏分了你一个鸡腿', miss: '大鹏饿着肚子打游戏' },
    title: '外卖代拿', share: { done: '帮室友拿了饭', miss: '室友的饭凉了' },
  },
  catfood: {
    id: 'catfood', name: '猫罐头', icon: { shape: 'can', color: '#f39c12', label: '猫' }, from: 'juzi',
    give: { by: 'start' },
    carrier: { kind: 'store', item: { id: 'catfood', name: '猫罐头', price: 6, note: '橘子要的' } },
    door: {
      done: q('jz_food1', '（闻到罐头）', o('开罐头', '顺从', true, '（呼噜声震天响）'), o('先等等', '装傻', 'mid', '（它一直扒你的腿）')),
      miss: q('jz_food2', '（舔空碗）', o('分你肉吃', '顺从', true, '（它勉强原谅了你）'), o('明天买', '真话', 'mid', '（它背对着你坐下）')),
    },
    dinner: { done: '橘子吃得比你还香', miss: '橘子分走了你的肉' },
    title: '罐头供应商', share: { done: '猫罐头带回来了', miss: '猫罐头忘买了' },
  },
  gift: {
    id: 'gift', name: '礼物', icon: { shape: 'sticker', color: '#ff6b9d', label: '礼' }, from: 'duoduo',
    give: { by: 'start' },
    carrier: { kind: 'store', item: { id: 'sticker', name: '贴纸', price: 3, note: '朵朵要的' } },
    door: {
      done: q('dd_gift1', '礼物呢？', o('贴纸！', '真话', true, '哇！小猫贴纸！'), o('没有', '装傻', 'mid', '……你藏哪了？')),
      miss: q('dd_gift2', '礼物呢？', o('明天买', '真话', true, '拉钩！不许骗人'), o('在天上', '装傻', false, '我才不信', { lol: 2 })),
    },
    dinner: { done: '朵朵把贴纸贴满了脸', miss: '朵朵噘着嘴吃完了饭' },
    title: '礼物准时达', share: { done: '给娃带了礼物', miss: '礼物忘了' },
  },
  candy: {
    id: 'candy', name: '润喉糖', icon: { shape: 'candy', color: '#e67e22', label: '糖' }, from: 'nainai',
    give: { by: 'call', line: '{乖孙}，带包润喉糖' },
    carrier: { kind: 'store', item: { id: 'candy', name: '润喉糖', price: 5, note: '奶奶要的' } },
    door: {
      done: q('nn_candy1', '糖买了没？', o('买了', '真话', true, '{乖孙}真孝顺'), o('没买', '装傻', 'mid', '逗奶奶呢')),
      miss: q('nn_candy2', '糖买了没？', o('忘了', '真话', true, '奶奶有，不怕'), o('卖完了', '装傻', false, '这孩子，学会骗人了')),
    },
    dinner: { done: '奶奶含着糖直夸你', miss: '奶奶说：人回来就行' },
    title: '孝顺{乖孙}', share: { done: '给奶奶带了糖', miss: '奶奶的糖忘了' },
  },
};

// ── 晚饭：art 是美术图 id（js/data/art.js 的 props），color / side 是图没加载时代码画碗的颜色 ──
const M = {
  noodles: { art: 'meal_noodles', color: '#f2c14e', side: '#e8a33d' },
  leftovers: { art: 'meal_leftovers', color: '#a8c66c', side: '#c9a26b' },
  tomatoegg: { art: 'meal_tomatoegg', color: '#ff7a59', side: '#ffd84d' },
  hongshaorou: { art: 'meal_hongshaorou', color: '#b5482f', side: '#7fbf5a' },
  takeout: { art: 'meal_takeout', color: '#ffb347', side: '#e05a47' },
  malatang: { art: 'meal_malatang', color: '#d9432b', side: '#f2c14e' },
  hotpot: { art: 'meal_hotpot', color: '#c0392b', side: '#f7d046' },
  dumplings: { art: 'meal_dumplings', color: '#f5efe0', side: '#c9a26b' },
  feast: { art: 'meal_feast', color: '#e0703a', side: '#7fbf5a' },
};
const meal = (name, k) => ({ name, ...M[k] });

// 爸妈家的饭盒题：平常日的「碎了」和周一「饭盒带回来」共用同一个对象（同一个题 id）
const MOM7 = q('mom7', '饭盒呢？', o('摔碎了', '真话', true, '人没摔着就行'), o('落公司了', '装傻', false, '那盒子用了十年！', { lol: 1 }));

// ── 家庭 ───────────────────────────────────────────────────────────
//   door：门口会出现的成员，第一个是默认答题人（题上的 who 覆盖）；cast：这个家里成员的身份小字覆盖（可选）
//   order：门口强情况的优先级（体现性格）；questions：情况 → 题
//   dinner：饭桌一句 { bad, top, any }（top = 晚饭 ≥2 档）；away：没能到家时家里那边 { caught, starve }
//   marks.bad：门口答坏的角标；share：分享标题模板（{t} 到家时刻、{meal} 菜名）
//   stories：weight 是自由下班 / 今日挑战里的抽签权重，0 = 只在关卡里用。故事的 door：[[情况, 题, 饭桌一句?]] 先于家庭的题
export const FAMILIES = {
  parents: {
    id: 'parents', name: '爸妈家', blurb: '和爸妈住，有人管饭', hint: '说实话就有饭吃', weight: 30,
    door: ['mom', 'dad'],
    caller: { who: 'mom', line: '吃饭没？快回来！', pick: '嗯嗯嗯，马上到', hang: '（嘟——嘟——）' },
    order: ['angry', 'promise', 'broken', 'wet', 'takeout', 'late', 'hungry', 'early'],
    questions: {
      angry: q('mom2', '电话咋不接？', o('没电了', '装傻', false, '骗谁呢', { rule: 'powerbank', goodReact: '……充电去' }), o('我错了', '真话', true, '……吃饭')),
      promise: q('mom6', '说好马上到呢', o('被拦住了', '真话', true, '……谁拦你？先吃饭'), o('我很快啊', '装傻', false, '你这叫马上？', { lol: 2 })),
      broken: MOM7,
      wet: q('mom5', '裤子咋湿了？', o('出汗了', '装傻', false, '汗是泥色的？', { lol: 2 }), o('车溅的', '真话', true, '……快去换')),
      takeout: q('mom3', '又点外卖？', o('同事点的', '装傻', false, '我信你个鬼'), o('我饿嘛', '真话', true, '……热好了')),
      late: q('mom4', '几点了都！', o('路上堵', '装傻', false, '你走路堵？'), o('跑回来的', '真话', true, '……快吃')),
      hungry: q('dad1', '吃了没？', o('还没', '真话', true, '……锅里有'), o('吃了', '装傻', false, '那鸡腿我吃了', { lol: 2 }), { who: 'dad' }),
      early: q('mom8', '咋这么早？', o('准点下班', '真话', true, '好，多吃点'), o('被开除了', '顶嘴', false, '？？你说啥？！', { lol: 3 })),
      bought: q('mom9', '偷吃了吧？', o('垫了一口', '真话', true, '那少盛半碗？'), o('没有啊', '装傻', false, '嘴角还有渣呢', { lol: 2 })),
      rode: q('dad2', '骑电驴了？', o('蹭的车', '真话', true, '……下回戴头盔'), o('走回来的', '装傻', false, '头发都吹成这样了'), { who: 'dad' }),
      normal: q('mom1', '洗手了没？', o('洗了', '装傻', false, '骗谁呢'), o('马上洗', '真话', true, '快去，菜热着')),
    },
    meals: [meal('泡面', 'noodles'), meal('剩菜热一热', 'leftovers'), meal('番茄炒蛋', 'tomatoegg'), meal('红烧肉', 'hongshaorou')],
    takeout: meal('放门卫的外卖', 'takeout'),
    marks: { bad: '挨骂了' },
    dinner: { bad: '妈妈念叨了一整顿饭', top: '爸爸把鸡腿夹给了你', any: '电视里在放新闻' },
    away: { caught: '妈妈把菜热了三遍', starve: '妈妈打了十个电话' },
    titles: [
      { name: '妈妈的乖崽', test: f => f.good === true && f.happy },
      { name: '饭盒又碎了', test: f => (f.key === 'broken' || f.key === 'story:broken') && f.broken >= 2 },
    ],
    share: '我{t}到家，妈妈做了{meal}',
    stories: {
      normal: { name: '平常日', weight: 2 },
      soy: { name: '带瓶酱油', errand: 'soy', weight: 1 },
      parcel: { name: '爸爸的快递', errand: 'parcel', weight: 1 },
      // ── 关卡：小X 一家的一周（weight 0：只在关卡里出现）──
      prologue: {
        name: '入职第一天', weight: 0, intro: ['mom', '第一天上班，早点回！'], mealMin: 2,
        door: [['always', q('mom10', '第一天咋样？', o('挺好的', '真话', true, '那就好，洗手吃饭'), o('累死了', '真话', true, '累就对了，快吃')), '爸爸说：上班了，是大人了']],
      },
      mon: {
        name: '饭盒带回来', weight: 0, intro: ['mom', '饭盒记得带回来！'],
        door: [
          ['intact', q('mom11', '饭盒都在？', o('都在这', '真话', true, '……难得，洗手吃饭'), o('碎光了', '顶嘴', false, '你手里拎的是啥？', { lol: 2 })), '妈妈把饭盒洗好装上了'],
          ['broken', MOM7],                                  // 碎了：不管挂没挂电话、失没失约，都先问饭盒（这一关教的就是碎饭盒）
        ],
      },
      tue: { name: '爸爸的快递', weight: 0, errand: 'parcel' },
      wed: {
        name: '奶奶来住', weight: 0, intro: ['mom', '奶奶今天来住！'], errand: 'candy', guests: ['nainai'],
        meals: { 3: meal('奶奶包的饺子', 'dumplings') },
      },
    },
  },

  share: {
    id: 'share', name: '合租屋', blurb: '和室友大鹏合租', hint: '讲义气，好处分他一半', weight: 20,
    door: ['dapeng'],
    caller: { who: 'dapeng', line: '{兄弟}，几点到家？', pick: '「锅里给你留了面」', hang: '（嘟——嘟——）' },
    order: ['angry', 'promise', 'broken', 'wet', 'takeout', 'late', 'hungry', 'early'],
    questions: {
      angry: q('dp1', '咋不回消息？', o('在跑步', '真话', true, '……卷王，佩服'), o('没看见', '装傻', false, '显示已读了{兄弟}', { lol: 2 })),
      promise: q('dp2', '不说快了吗？', o('耽搁了', '真话', true, '……面我先吃了一半'), o('我快啊', '装傻', false, '你对快有误解', { lol: 2 })),
      broken: q('dp3', '咋这么狼狈？', o('被追了', '真话', true, '……打工人不易'), o('练跑酷', '顶嘴', 'mid', '……下回带上我', { lol: 1 })),
      wet: q('dp4', '掉河里了？', o('被车溅了', '真话', true, '热水给你烧上了'), o('游回来的', '顶嘴', 'mid', '……你赢了', { lol: 2 })),
      takeout: q('dp5', '点外卖了？', o('拼一单', '顺从', true, '满减凑上了！'), o('没点', '装傻', false, '袋子在你手上呢')),
      late: q('dp6', '又加班？', o('别提了', '真话', true, '来，冰可乐一罐'), o('自愿的', '顺从', false, '你被洗脑了吧', { lol: 2 })),
      hungry: q('dp7', '饿成狗了？', o('快饿死了', '真话', true, '泡面给你泡上了'), o('还行', '装傻', false, '你肚子在叫啊')),
      early: q('dp8', '你被裁了？', o('准点走的', '真话', true, '……羡慕，吃饭'), o('是啊', '顶嘴', false, '那房租咋办？！', { lol: 3 })),
      bought: q('dp9', '买的啥？', o('分你一半', '顺从', true, '{好兄弟}一辈子！'), o('我自己吃', '真话', false, '……绝交三分钟', { lol: 1 })),
      rode: q('dp10', '蹭车回的？', o('外卖小哥', '真话', true, '……下回帮我带份饭'), o('跑回来的', '装傻', false, '头盔印还在脸上', { lol: 1 })),
      normal: q('dp11', '电费AA？', o('马上转', '顺从', true, '收到！爽快！'), o('下月吧', '没钱', false, '上月你也这么说', { lol: 2 })),   // 「马上转」只是一句话，不扣钱：门口不做花钱选项
    },
    meals: [meal('泡面加根肠', 'noodles'), meal('拼单麻辣烫', 'malatang'), meal('大鹏的番茄面', 'tomatoegg'), meal('出租屋小火锅', 'hotpot')],
    takeout: meal('拼单外卖', 'takeout'),
    marks: { bad: '被鄙视' },
    dinner: { bad: '大鹏戴上耳机不理你', top: '大鹏开了两罐冰可乐', any: '大鹏在放下饭综艺' },
    away: { caught: '大鹏把你那份吃了', starve: '大鹏给你点了外卖' },
    titles: [
      { name: '合租好搭子', test: f => f.good === true && (f.errand === 'done' || ['bought', 'takeout', 'normal'].includes(f.key)) },
      { name: '电费钉子户', test: f => f.key === 'normal' && f.good === false },
    ],
    share: '我{t}到家，和室友吃{meal}',
    stories: {
      normal: { name: '平常日', weight: 2 },
      tissue: { name: '卫生纸没了', errand: 'tissue', weight: 1 },
      takeaway: { name: '帮拿外卖', errand: 'takeaway', weight: 1 },
    },
  },

  cat: {
    id: 'cat', name: '一人一猫', blurb: '独居，橘子在等你开饭', hint: '先喂它，再顾自己', weight: 15,
    door: ['juzi'],
    caller: { who: 'juzi', name: '猫咪摄像头', line: '橘子在推你的杯子！', pick: '（对着摄像头喊：住手！）', hang: '（啪——）' },
    // 没有「失约」：猫不会和你约时间。好选项多标「顺从」不标「家里」：路上用过两次「我妈等我」，到猫面前也不会被判成借口疲劳
    order: ['angry', 'wet', 'takeout', 'late', 'hungry', 'early'],
    questions: {
      angry: q('jz1', '（满地碎片）', o('抱抱它', '顺从', true, '（它心虚地蹭蹭你）'), o('骂它', '顶嘴', false, '（它冲你哈气）', { lol: 2 })),
      wet: q('jz2', '（躲得远远）', o('先洗澡', '真话', true, '（洗完它才过来）'), o('抱一下', '顺从', false, '（嫌弃湿漉漉的你）', { lol: 1 })),
      takeout: q('jz3', '（扒外卖袋）', o('先喂它', '顺从', true, '（它满意地眯起眼）'), o('先吃外卖', '真话', false, '（它坐在你外卖上）', { lol: 3 })),
      late: q('jz4', '喵！！', o('先开罐头', '顺从', true, '（埋头狂吃，原谅你了）'), o('先躺会', '装傻', false, '（它跳上来踩你肚子）', { lol: 2 })),
      hungry: q('jz5', '喵？', o('一起吃', '真话', true, '（它坐你对面陪你）'), o('你先吃', '顺从', 'mid', '（你又饿了十分钟）')),
      early: q('jz6', '（愣住了）', o('陪你玩', '顺从', true, '（叼来了逗猫棒）'), o('补个觉', '装傻', false, '（它在你身上跑酷）', { lol: 2 })),
      bought: q('jz7', '（闻袋子）', o('摸摸它', '顺从', true, '（它忘了袋子的事）'), o('给你的', '装傻', false, '（闻了闻，嫌弃走开）', { lol: 1 })),
      normal: q('jz8', '喵～', o('摸摸头', '顺从', true, '（呼噜呼噜呼噜）'), o('玩手机', '装傻', false, '（它把手机推下桌）', { lol: 2 })),
    },
    meals: [meal('泡面', 'noodles'), meal('速冻水饺', 'dumplings'), meal('番茄炒蛋盖饭', 'tomatoegg'), meal('一个人的红烧肉', 'hongshaorou')],
    takeout: meal('被猫盯着的外卖', 'takeout'),
    marks: { bad: '被嫌弃' },
    dinner: { bad: '橘子占了你的椅子', top: '橘子趴在你脚边', any: '一个人也要好好吃饭' },
    away: { caught: '橘子守着空碗等你', starve: '橘子把罐头柜扒开了' },
    titles: [
      { name: '金牌铲屎官', test: f => f.good === true && f.tier >= 2 },
      { name: '被猫嫌弃', test: f => f.good === false },
    ],
    share: '我{t}到家，橘子等我开饭',
    stories: {
      normal: { name: '平常日', weight: 2 },
      catfood: { name: '猫罐头见底', errand: 'catfood', intro: ['juzi', '猫咪摄像头：罐头吃光了！'], weight: 1 },
    },
  },

  kid: {
    id: 'kid', name: '有娃家', blurb: '女儿朵朵5岁，姥姥帮带', hint: '答应孩子的事，她都记得', weight: 20,
    door: ['duoduo', 'laolao'],
    // 配偶今晚加班：不在门口，只在饭桌 ≥2 档的视频通话里（男主角是老婆、女主角是老公，两张 AI 头像；和饭桌一句 dinner.top 同一条线）
    caller: { who: 'duoduo', name: '朵朵的电话手表', line: '{爸爸}你几点回来？', pick: '「马上到，拉钩！」', hang: '（电话手表：嘟——）' },
    order: ['promise', 'angry', 'late', 'takeout', 'wet', 'broken', 'hungry', 'early'],
    questions: {
      promise: q('dd1', '你说马上到！', o('{爸爸}错了', '真话', true, '那明天陪我搭积木'), o('表坏了', '装傻', false, '（哇——地哭了）', { lol: 1 })),
      angry: q('dd2', '你不要我了？', o('怎么会', '真话', true, '（扑进你怀里）'), o('在忙', '工作', false, '（嘴一瘪要哭了）')),
      late: q('ll1', '才回来？', o('妈您辛苦', '顺从', true, '……嘴倒挺甜，吃饭'), o('加班了', '工作', false, '就你忙？娃谁管？'), { who: 'laolao' }),
      takeout: q('ll2', '又吃外卖？', o('妈做的香', '顺从', true, '算你识货，吃饭！'), o('给朵朵的', '装傻', false, '孩子能吃这个？！', { lol: 2 }), { who: 'laolao' }),
      wet: q('ll3', '咋弄这么湿？', o('车压水坑', '真话', true, '快换，别冻着娃'), o('没事', '装傻', false, '感冒了谁带孩子？'), { who: 'laolao' }),
      broken: q('dd3', '饭盒碎啦？', o('碎了', '真话', true, '我给你粘！'), o('没碎', '装傻', false, '我都看见了', { lol: 1 })),
      hungry: q('dd4', '{爸爸}饿了？', o('饿瘪了', '真话', true, '我的饼干给你！'), o('不饿', '装傻', false, '那我替你吃了！', { lol: 1 })),
      early: q('dd5', '{爸爸}放学了？', o('放学啦', '顺从', true, '那陪我玩恐龙！'), o('是下班', '真话', 'mid', '……下班是啥？', { lol: 2 })),
      bought: q('dd6', '带啥好吃的？', o('一起吃', '顺从', true, '耶！{爸爸}最好！'), o('是我的', '顶嘴', false, '（抱着你腿不撒手）', { lol: 2 })),
      normal: q('dd7', '{爸爸}抱抱！', o('来抱抱', '顺从', true, '耶——！'), o('先洗手', '真话', true, '……好吧，快点')),
    },
    meals: [meal('速冻饺子', 'dumplings'), meal('剩菜热一热', 'leftovers'), meal('番茄炒蛋', 'tomatoegg'), meal('姥姥的红烧肉', 'hongshaorou')],
    takeout: meal('偷点的外卖', 'takeout'),
    marks: { bad: '娃不开心' },
    dinner: { bad: '姥姥一直在叹气', top: '{老婆}在视频里笑了', any: '朵朵把胡萝卜夹给你' },
    away: { caught: '朵朵抱着恐龙睡着了', starve: '姥姥让朵朵打你电话' },
    titles: [
      { name: '说到做到', test: f => f.happy && f.key !== 'promise' && f.good === true },
      { name: '超人{爸爸}', test: f => f.good === true && (f.grade === 'S' || f.grade === 'A') },
    ],
    share: '我{t}到家，陪朵朵吃{meal}',
    stories: {
      normal: { name: '平常日', weight: 2 },
      gift: { name: '要礼物', errand: 'gift', intro: ['duoduo', '{爸爸}，带礼物回来！'], weight: 1 },
    },
  },

  nainai: {
    id: 'nainai', name: '奶奶家', blurb: '周五回奶奶家吃饭', hint: '奶奶给啥就吃啥', weight: 15,
    door: ['nainai'],
    caller: { who: 'nainai', line: '到哪了？饺子下锅了', pick: '「慢点跑，别摔着」', hang: '（嘟——嘟——）' },
    order: ['angry', 'promise', 'hungry', 'wet', 'takeout', 'late', 'broken', 'early'],
    questions: {
      angry: q('nn1', '吓死奶奶了', o('奶奶别怕', '顺从', true, '（奶奶抹了抹眼角）'), o('手机静音', '装傻', false, '奶奶打了二十遍！')),
      promise: q('nn2', '饺子都坨了', o('是我慢了', '真话', true, '不怕，奶奶再下一锅'), o('我不饿', '装傻', false, '不饿也得吃！', { lol: 1 })),
      hungry: q('nn3', '瘦成啥样了', o('饿瘦的', '真话', true, '快！先吃个鸡腿'), o('我在减肥', '身体', false, '减啥肥！吃！', { lol: 2 })),
      wet: q('nn4', '咋淋成这样？', o('换身衣服', '顺从', true, '穿你爷爷那件！', { lol: 1 }), o('没事没事', '装傻', false, '别犟！快换上！')),
      takeout: q('nn5', '又吃外头的？', o('不好吃', '顺从', true, '就是！还是家里好'), o('挺好吃', '真话', false, '（奶奶不高兴了）')),
      // 「去买东西」：路上真进店给自己买过东西才是真话（规则 bought）；「加班嘛」标真话（借口全疲劳时这道题也有能过的）
      late: q('nn6', '等你一下午', o('去买东西', '家里', false, '两手空空的？', { rule: 'bought', goodReact: '……又乱花钱' }), o('加班嘛', '真话', 'mid', '公司不管饭啊？')),
      broken: q('nn7', '饭盒咋碎了？', o('摔了一跤', '真话', true, '摔哪了？奶奶看看'), o('不小心', '装傻', 'mid', '人没事就好')),
      early: q('nn8', '今天不忙？', o('想奶奶了', '真话', true, '奶奶给你留了鸡腿'), o('请假了', '装傻', false, '工作要紧啊！')),
      bought: q('nn9', '乱花啥钱', o('孝敬您的', '顺从', true, '……这孩子，懂事'), o('顺手买的', '真话', 'mid', '下回别乱花钱')),
      normal: q('nn10', '吃饱没？', o('还能吃', '顺从', true, '好孩子！再来一碗'), o('饱了', '装傻', false, '饱啥饱，再吃点！', { lol: 1 })),
    },
    // 奶奶家没有泡面：最差的一顿也是热了三遍的饺子
    meals: [meal('热了三遍的饺子', 'dumplings'), meal('奶奶包的饺子', 'dumplings'), meal('一大桌菜', 'feast'), meal('奶奶的红烧肉', 'hongshaorou')],
    takeout: meal('奶奶热过的外卖', 'takeout'),
    marks: { bad: '奶奶急了' },
    dinner: { bad: '爷爷说：吃你的饭', top: '奶奶往你碗里堆菜', any: '奶奶一直看着你吃' },
    away: { caught: '奶奶在楼下等到天黑', starve: '爷爷去路口接你了' },
    titles: [
      { name: '奶奶的心头肉', test: f => f.good === true && f.happy },
      { name: '撑到扶墙', test: f => f.tier === 3 },
    ],
    share: '我{t}到奶奶家，吃了{meal}',
    stories: {
      normal: { name: '平常日', weight: 2 },
      candy: { name: '润喉糖', errand: 'candy', weight: 1 },
    },
  },
};

// 通用家庭称号（有钩子的局）：排在家庭称号之后
export const FAMILY_TITLES = [
  { name: '忘性大王', test: f => f.errand === 'miss' && f.good !== true },
];
export const DEFAULT_STORY = 'parents.normal';
export const DOOR_MARKS = { good: '开饭！', mid: '还行' };   // 门口结果角标（答坏的每家不同，见 marks.bad）

// ── 图鉴和兼容 ──────────────────────────────────────────────────
// 某个成员在所有家庭、故事、钩子里会被问到的门口题（借口图鉴一人一页；键 = 题 id，同一个题对象只算一次）
export function doorQuestionsBy(who) {
  const out = {};
  const add = (qq, w) => { if (w === who) out[qq.id] = qq; };
  for (const f of Object.values(FAMILIES)) {
    for (const qq of Object.values(f.questions)) add(qq, qq.who || f.door[0]);
    for (const st of Object.values(f.stories)) for (const [, qq] of st.door || []) add(qq, qq.who || f.door[0]);
  }
  for (const e of Object.values(ERRANDS)) for (const qq of Object.values(e.door)) add(qq, qq.who || e.from);
  return out;
}
// 某个成员出现在哪些家里（门口的人，加上故事里来住的客人：周三的奶奶也出现在爸妈家）
export const familiesOf = who => Object.values(FAMILIES).filter(f => f.door.includes(who) || Object.values(f.stories).some(st => (st.guests || []).includes(who))).map(f => f.id);
// 某个成员住在哪个家（门口的人；图鉴：一条回答都没点亮、存档里也没回过他家的人显示剪影 +「还没回过这个家」）
export const homesOf = who => Object.values(FAMILIES).filter(f => f.door.includes(who)).map(f => f.id);
// 兼容：老代码和测试里的 MOM（npcs.js 转出）。questions 里是妈妈会问的全部门口题（按题 id）
export const MOM = { ...MEMBERS.mom, questions: doorQuestionsBy('mom') };
