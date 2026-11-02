// 事件牌：每幕场景 30% 概率多出一张，choose 阶段可用一次，不占对话拍。
// kind: instant（立刻结算）| risky（成功/失败两种结果）| cost（花代价保证效果）
export const EVENT_CHANCE = 0.3;

export const EVENTS = {
  earlyexit: {
    id: 'earlyexit', icon: '🚪', name: '找个借口提前溜',
    kind: 'risky',
    desc: '有 60% 把握直接结束这场，不管当前状态；失败被抓，主角 +15',
    failText: '「等等！你去哪儿！」你的借口没蒙过去。',
    okText: '「那个……我电话！」你拔腿就跑。没人追。',
    apply: (state, rng, ctx = {}) => {
      if (rng.next() < 0.60) {
        state.scene.eventDodged = true;
        return { ok: true, ended: true };
      }
      const primary = state.scene.present[0];
      state.npcs[primary].att = Math.min(100, state.npcs[primary].att + 15);
      return { ok: false, ended: false };
    },
  },
  recallevent: {
    id: 'recallevent', icon: '💬', name: '突然记起件事',
    kind: 'instant',
    desc: '主角 −15（保证），对方完全意外，不扣饥饿',
    okText: '「对了！我想起来……」你说了一件没有人能反驳的事。对方还没回过神，你已经走了。',
    apply: (state, rng, ctx = {}) => {
      const sc = state.scene; const id = sc.present[0];
      state.npcs[id].att = Math.max(0, state.npcs[id].att - 15);
      return { ok: true, ended: false };
    },
  },
  phonecall: {
    id: 'phonecall', icon: '📞', name: '假装接电话',
    kind: 'cost',
    desc: '扣 8 饥饿，本拍对方正向归零（你假装有急事）',
    okText: '「喂？哦，哦！我马上！」你接通了一个不存在的电话。对方只好闭嘴。',
    apply: (state, rng, ctx = {}) => {
      state.hunger = Math.max(0, state.hunger - 8);
      state.scene.mods.busyBeat = state.scene.beat;
      return { ok: true, ended: false };
    },
  },
  dropitem: {
    id: 'dropitem', icon: '🎁', name: '意外捡到东西',
    kind: 'instant',
    desc: '随机获得一件道具（上限 3），同时主角 −5',
    okText: '「这是谁的……」你低头捡起一样东西，顺手揣进包里。对方的注意力分散了一秒。',
    apply: (state, rng, ctx = {}) => {
      const { ITEMS, ITEM_IDS, MAX_ITEMS } = ctx;
      if (state.items.length < MAX_ITEMS) {
        const id = rng.pick(ITEM_IDS.filter(i => !state.items.includes(i)));
        if (id) state.items.push(id);
      }
      const primary = state.scene.present[0];
      state.npcs[primary].att = Math.max(0, state.npcs[primary].att - 5);
      return { ok: true, ended: false };
    },
  },
  nameothers: {
    id: 'nameothers', icon: '👥', name: '把话题引向别人',
    kind: 'instant',
    desc: '主角 −20，所有当前活跃 NPC 各 +8（代价是全场注意力提升）',
    okText: '「你觉得……大家对这件事怎么看？」对方眼神一动，已经开始想名单了。你默默往旁边挪了一步。',
    apply: (state, rng, ctx = {}) => {
      const { NPCS, activeNpcs, clamp } = ctx;
      const primary = state.scene.present[0];
      state.npcs[primary].att = Math.max(0, state.npcs[primary].att - 20);
      for (const id of activeNpcs(state)) {
        if (id !== primary) state.npcs[id].att = clamp(state.npcs[id].att + 8);
      }
      return { ok: true, ended: false };
    },
  },
  distraction: {
    id: 'distraction', icon: '💥', name: '路过的事故',
    kind: 'risky',
    desc: '有 50% 概率所有人注意力转移（全场 −10）；50% 没事发生',
    okText: '「哗——！」不知道从哪里传来一声响。所有人下意识回头，你顺势溜出了对话圈。',
    failText: '什么都没发生。你在原地等了三秒，显得格外突出。',
    apply: (state, rng, ctx = {}) => {
      if (rng.next() < 0.50) {
        const { activeNpcs, clamp } = ctx;
        for (const id of activeNpcs(state)) {
          state.npcs[id].att = clamp(state.npcs[id].att - 10);
        }
        return { ok: true, ended: false };
      }
      return { ok: false, ended: false };
    },
  },
};

export const EVENT_IDS = Object.keys(EVENTS);
