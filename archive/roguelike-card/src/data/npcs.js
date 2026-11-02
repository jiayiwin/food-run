// NPC 表。数值以 docs/GDD.md 第 6 节为准。
// 意图 kind：talk（唠叨，粘性+）/ stall（拖时间，饥饿−）/ press（追问，面子−，被镇定抵挡）
//           / question（老师提问）/ overtime（老板加班）
export const NPCS = {
  colleague: {
    id: 'colleague', name: '话多同事', icon: '🧑‍💼', act: 1, stick: 18,
    intents: [
      { kind: 'talk', value: 4, text: '「哎你听说了吗，三楼那个——」' },
      { kind: 'stall', value: 4, text: '「等等等等，还没说完。」' },
      { kind: 'press', value: 6, text: '「你怎么老想走？不合群啊。」' },
    ],
    lines: { enter: '「正好！跟你说个事儿——」', win: '「……行吧，明天聊。」' },
  },
  intern: {
    id: 'intern', name: '实习生', icon: '🧑‍🎓', act: 1, stick: 12,
    intents: [
      { kind: 'press', value: 4, text: '「前辈，这个按钮为什么点不动？」' },
      { kind: 'stall', value: 3, text: '「您再帮我看一眼这个……」' },
    ],
    lines: { enter: '「前辈！能请教一下吗？」', win: '「好的前辈，明天再问您！」' },
  },
  boss: {
    id: 'boss', name: '老板', icon: '👔', act: 1, stick: 36, boss: true,
    intents: [
      { kind: 'stall', value: 6, text: '「有个小事，5 分钟。」' },
      { kind: 'press', value: 8, text: '「这个数据你再解释一下？」' },
      { kind: 'talk', value: 5, text: '「我年轻的时候啊……」' },
    ],
    overtime: { kind: 'overtime', value: 15, stick: 8, text: '「我看你今天状态不对。留下来，加个班。」' },
    lines: { enter: '「哦，正好，你过来一下。」', win: '「……行。明天早点来。」' },
  },
  salesman: {
    id: 'salesman', name: '推销员', icon: '📢', act: 2, stick: 15, socialHalf: true,
    intents: [
      { kind: 'talk', value: 3, text: '「了解一下健身卡？」' },
      { kind: 'stall', value: 4, text: '「就两分钟，扫个码！」' },
    ],
    lines: { enter: '「哎！耽误你一分钟！」', win: '「好吧好吧，下次一定。」' },
  },
  teacher: {
    id: 'teacher', name: '老师', icon: '📚', act: 2, stick: 20, exam: true,
    intents: [
      { kind: 'question', text: '「来，老师考考你——」' },
      { kind: 'talk', value: 3, text: '「你当年可是我最看好的学生。」' },
      { kind: 'press', value: 5, text: '「现在工作忙，书也不读了？」' },
    ],
    lines: { enter: '「哟，这不是我学生吗！」', win: '「去吧去吧，常回学校看看。」' },
  },
  auntie: {
    id: 'auntie', name: '邻居大妈', icon: '👵', act: 2, stick: 30, boss: true,
    intents: [
      { kind: 'talk', value: 6, text: '「回来啦？吃了没？」' },
      { kind: 'press', value: 5, text: '「这么晚才回来，工作不顺？」' },
      { kind: 'press', value: 10, text: '「我外甥人特好，加个微信？」' },
    ],
    lines: { enter: '「哎呀回来啦！正好，跟你说个事。」', win: '「行行行，快上去吃饭。」' },
  },
  courier: {
    id: 'courier', name: '快递员', icon: '📦', act: 3, stick: 10,
    intents: [
      { kind: 'stall', value: 3, text: '「你帮我找找，这个是不是你们楼的？」' },
      { kind: 'press', value: 3, text: '「这件签个字，就一下。」' },
    ],
    lines: { enter: '「哎同学！帮个忙！」', win: '「谢了谢了。」' },
  },
  roommate: {
    id: 'roommate', name: '室友', icon: '🛋️', act: 3, stick: 15,
    intents: [
      { kind: 'talk', value: 4, text: '「你回来得正好，我跟你讲今天……」' },
      { kind: 'stall', value: 3, text: '「等下等下，先看这个视频。」' },
    ],
    lines: { enter: '「回来啦！快快快！」', win: '「行，你先吃。」' },
  },
  home: {
    id: 'home', name: '家门 BOSS', icon: '🏠', act: 3, boss: true, final: true,
    phases: [
      {
        name: '饭还没好', icon: '🍳', stick: 25,
        enter: '推开门——锅还在烧。「再等十分钟！」',
        intents: [
          { kind: 'stall', value: 5, text: '「再等等，马上就好。」' },
          { kind: 'talk', value: 4, text: '「你先别急，坐。」' },
        ],
      },
      {
        name: '先把垃圾倒了', icon: '🗑️', stick: 20, skipIfCalled: true,
        enter: '「吃饭之前，先把垃圾倒了。」',
        intents: [
          { kind: 'press', value: 6, text: '「你怎么回事，说你两句还不乐意？」' },
          { kind: 'stall', value: 4, text: '「顺便把快递也拿一下。」' },
        ],
      },
      {
        name: '外卖迟到了', icon: '🛵', stick: 20,
        enter: '最后一道菜叫的外卖——「还有 3 公里」。',
        intents: [
          { kind: 'stall', value: 6, text: '「骑手说还有 2 公里。」' },
          { kind: 'talk', value: 5, text: '「要不先喝口水？」' },
        ],
      },
    ],
    lines: { enter: '到家了。但进门不等于吃到。', win: '第一口饭入嘴。' },
  },
};

export const NORMAL_POOL = {
  1: ['colleague', 'intern'],
  2: ['salesman', 'teacher'],
  3: ['courier', 'roommate'],
};
export const ACT_BOSS = { 1: 'boss', 2: 'auntie', 3: 'home' };
