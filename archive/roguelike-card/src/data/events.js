// 事件表。数值以 docs/GDD.md 第 9 节为准。
// 选项字段：label / hint（效果预览）/ requiresTag（牌组里有带该 eventTag 的牌才出现，并消耗一张）
//          / effects { hunger, face, decay, flag, addCard } / result（结果文案）
export const EVENTS = {
  gossip: {
    id: 'gossip', act: 1, icon: '☕', title: '茶水间八卦',
    text: '路过茶水间，两个同事压低声音：「……然后他居然把那个文件——」。他们看见了你，招手。',
    options: [
      { label: '听一耳朵', hint: '面子 +8，饥饿 −5', effects: { face: 8, hunger: -5 }, result: '你知道了一个惊天秘密。肚子更饿了。' },
      { label: '装没听见', hint: '无变化', effects: {}, result: '你目视前方，脚步没停。' },
    ],
  },
  elevator_full: {
    id: 'elevator_full', act: 1, icon: '🛗', title: '电梯满了',
    text: '电梯门打开，里面塞得像沙丁鱼罐头。',
    options: [
      { label: '等下一趟', hint: '饥饿 −6', effects: { hunger: -6 }, result: '下一趟来了。又满了。再下一趟……' },
      { label: '走楼梯', hint: '饥饿 −3，获得「深呼吸」', effects: { hunger: -3, addCard: 'shenhuxi' }, result: '十二层楼梯。你学会了深呼吸。' },
    ],
  },
  snack_offer: {
    id: 'snack_offer', act: 1, icon: '🍪', title: '同事递零食',
    text: '隔壁座的同事递过来一包饼干：「刚买的，尝尝？」',
    options: [
      { label: '接过来', hint: '饥饿 +10，面子 −3', effects: { hunger: 10, face: -3 }, result: '很香。你欠了一个人情。' },
      { label: '婉拒', hint: '面子 +3', effects: { face: 3 }, result: '「不用不用，你吃。」你很有礼貌，也很饿。' },
    ],
  },
  subway_delay: {
    id: 'subway_delay', act: 2, icon: '🚇', title: '地铁延误',
    text: '站台广播：「因前方列车故障，本线路延误约 15 分钟。」人群发出一声叹息。',
    options: [
      { label: '用共享单车券', hint: '消耗一张「共享单车券」，免罚', requiresTag: 'bike', effects: {}, result: '你骑上单车，把地铁站甩在身后。' },
      { label: '硬等', hint: '饥饿 −12', effects: { hunger: -12 }, result: '15 分钟变成了 25 分钟。' },
      { label: '蹭同事的车', hint: '面子 −10', effects: { face: -10 }, result: '「顺路吗？」「……顺吧。」一路尴尬。' },
    ],
  },
  rainstorm: {
    id: 'rainstorm', act: 2, icon: '🌧️', title: '突降暴雨',
    text: '刚出地铁口，天像被捅破了。',
    options: [
      { label: '撑开雨伞', hint: '消耗一张「雨伞」，免罚', requiresTag: 'umbrella', effects: {}, result: '伞一开，风雨无阻。' },
      { label: '淋雨冲', hint: '饥饿 −8', effects: { hunger: -8 }, result: '你像一条湿透的鱼一样冲回家。' },
      { label: '蹭同事的伞', hint: '面子 −5', effects: { face: -5 }, result: '两个人挤一把伞，各湿半边。' },
    ],
  },
  family_call: {
    id: 'family_call', act: 2, icon: '📞', title: '家人来电',
    text: '手机震了。来电显示：妈。',
    options: [
      { label: '接', hint: '饥饿 −6，到家时家人更体谅', effects: { hunger: -6, flag: 'familyCalled' }, result: '「嗯……嗯……快到了……嗯。」通话 8 分钟。' },
      { label: '挂', hint: '现在没事，到家时有「惊喜」', effects: { flag: 'familyHungUp' }, result: '你按了静音。总感觉背后一凉。' },
    ],
  },
  convenience: {
    id: 'convenience', act: 2, icon: '🏪', title: '便利店',
    text: '便利店的灯光温暖。关东煮在冒泡。',
    options: [
      { label: '进去买点', hint: '饥饿 +15，每节点饥饿衰减 +1', effects: { hunger: 15, decay: 1 }, result: '一根鱼丸下肚。胃口被打开了，更想吃正餐。' },
      { label: '路过', hint: '无变化', effects: {}, result: '你忍住了。' },
    ],
  },
  phone_dead: {
    id: 'phone_dead', act: 2, icon: '🪫', title: '手机没电',
    text: '导航正要拐弯，屏幕黑了。',
    options: [
      { label: '掏出充电宝', hint: '消耗一张「充电宝」，免罚', requiresTag: 'power', effects: {}, result: '续上了。' },
      { label: '盲走', hint: '饥饿 −6', effects: { hunger: -6 }, result: '凭记忆走，多绕了两条街。' },
    ],
  },
  elevator_broken: {
    id: 'elevator_broken', act: 3, icon: '🚧', title: '电梯坏了',
    text: '楼道里贴着：「电梯维修中，预计 20 分钟。」',
    options: [
      { label: '爬楼', hint: '饥饿 −8', effects: { hunger: -8 }, result: '十八层。腿在抖。' },
      { label: '等修', hint: '饥饿 −4，面子 −3', effects: { hunger: -4, face: -3 }, result: '维修师傅让你帮忙递了三次扳手。' },
    ],
  },
  neighbor_kid: {
    id: 'neighbor_kid', act: 3, icon: '🧒', title: '邻居小孩拦路',
    text: '楼下小孩张开双臂：「不许过！陪我玩！」',
    options: [
      { label: '陪玩一分钟', hint: '面子 +5，饥饿 −4', effects: { face: 5, hunger: -4 }, result: '一分钟变成了五分钟。小孩说你是好人。' },
      { label: '绕开', hint: '无变化', effects: {}, result: '你从花坛边绕了过去。身后传来哭声。' },
    ],
  },
};

export const EVENT_POOL = {
  1: ['gossip', 'elevator_full', 'snack_offer'],
  2: ['subway_delay', 'rainstorm', 'family_call', 'convenience', 'phone_dead'],
  3: ['elevator_broken', 'neighbor_kid'],
};
