// NPC 表。数值以 docs/GDD.md 第 5 节为准。路人与动物见 strangers.js，合并进 NPCS 但不在 NPC_ORDER。
import { STRANGERS } from './strangers.js';
export const HOT = 70;   // > HOT 过热
export const COLD = 30;  // < COLD 过冷

export function zoneOf(att) {
  if (att > HOT) return 'hot';
  if (att < COLD) return 'cold';
  return 'safe';
}

export const ZONE_LABEL = { hot: '太热', safe: '刚好', cold: '太冷' };
export const ZONE_HINT = { hot: '会拉住你，饭要凉', safe: '合格', cold: '会记仇，回头找你' };

const CORE = {
  boss: {
    id: 'boss', name: '老板', icon: '👔', init: 55,
    faces: { hot: '😏', safe: '😐', cold: '🤨' },
    react: {
      up: '「哦？说说，展开讲讲。」他来了兴趣，椅子拉近了一点。',
      down: '「嗯。」他看了眼表。',
      transfer: '「小张？叫他过来。」',
      heard: '他在旁边听着，眉毛动了一下。',
      intrude: '老板从背后出现：「正好，你们聊什么？拉我进群。」',
    },
    trait: 'riseFast', traitText: '上升快：你多汇报一句，他就多给你画一张饼',
    blurb: '职场黑话十级，一次闭环让你今晚别想闭眼。',
    hot: { title: '被老板留下再说两句', text: '「等等，再说两句，咱们把颗粒度对齐一下。」他把电脑包又放回了桌上。', hunger: -14 },
    overload: { at: 90, title: '被留下加班', text: '「我看你今天状态不错，留下来把方案改完再走，年轻人要有抓手。」四十分钟后你才出来，活人感 −100。', hunger: -20, reset: 60 },
    trouble: { title: '老板在群里艾特你', text: '部门群：「@你 进度呢？」所有人都看见了。有人回了个 🐴。', self: 80 },
    perfectLine: '他点点头，低头回消息。你顺利走过，饭还热着。',
    coldLine: '他皱了一下眉，没说话。这个眼神你记住了，他也记住了。',
  },
  zhang: {
    id: 'zhang', name: '小张', fullName: '话痨同事小张', icon: '🗣️', init: 50,
    faces: { hot: '🤩', safe: '😄', cold: '😶' },
    react: {
      up: '「对吧对吧！我就说！家人们谁懂啊！」',
      down: '「行行行，你忙，我不理解但我尊重。」',
      transfer: '「？？？关我什么事？你礼貌吗？」',
      heard: '他在旁边一边喝水一边听。',
      intrude: '「哎哎，聊什么呢？算我一个！」小张挤了进来。',
    },
    trait: 'contagious', traitText: '受传染：别人一热，他跟着上头',
    blurb: '办公室显眼包，吃瓜永动机。',
    hot: { title: '被小张拉住吐槽', text: '「你听我说完这一个！」八分钟。你一个字没插进去，像在看单口直播。', hunger: -10, att: -10 },
    trouble: { title: '小张去老板那儿说了你', text: '「我觉得他最近状态不太好，老躲人，班味都淡了。」老板看了你一眼。', self: 50, others: { boss: 20 } },
    perfectLine: '「那行，明天聊！」他挥挥手，瓜留到明天。',
    coldLine: '「你这人，越来越淡了。」他嘟囔了一句。',
  },
  lin: {
    id: 'lin', name: '小林', fullName: '暗恋你的同事小林', icon: '🌸', init: 65,
    faces: { hot: '😳', safe: '🙂', cold: '🥺' },
    react: {
      up: '她的耳朵更红了。尊嘟假嘟？',
      down: '「哦……好。」淡淡的死感。',
      transfer: '「我、我吗？」',
      heard: '她在旁边假装看手机。',
      intrude: '「那个……我、我也在这儿。」小林不知什么时候站在了旁边。',
    },
    trait: 'unstable', traitText: '极不稳定：一会儿上头一会儿下头，冷落她怨气翻倍',
    blurb: '偷感很重的暗恋，反应比短剧女主还夸张。',
    hot: { title: '小林等你一起走', text: '「我、我也去那个方向！」她跟了上来。接下来一段路，所有人都看见你们俩，弹幕刷满「磕到了」。', hunger: -6, companion: true },
    trouble: { title: '小林在部门群艾特你', text: '部门群：「@你 你走了吗？我在楼下。」底下冒出一排「？」和一个「磕到了」。', self: 50, others: { all: 8 } },
    perfectLine: '「那、那明天见。」她小声说。',
    coldLine: '她把头转开了，耳朵还是红的，不知道是害羞还是破防。',
  },
  teacher: {
    id: 'teacher', name: '老师', fullName: '高中班主任', icon: '📚', init: 40, lateJoin: true,
    faces: { hot: '😁', safe: '🙂', cold: '😔' },
    react: {
      up: '「好好好！老师就喜欢你这样的！」',
      down: '「忙，忙，老师理解，年轻人要搞钱。」',
      transfer: '「哪个同学？也是我带的？」',
      heard: '老师站在一边，像在听课。',
      intrude: '「哟！这不是……」老师从人群里挤过来。',
    },
    trait: 'slow', traitText: '慢热：话不多，但一开口就是「上岸了没」，很难甩掉',
    blurb: '慢热，但热起来就要你回学校给学弟学妹讲「怎么上岸」。',
    hot: { title: '被老师要求补课', text: '「正好，有道题你帮老师看看，现在的孩子都不会，你们那届还是卷得动的。」', hunger: -12 },
    trouble: { title: '老师发来 800 字长消息', text: '「老师知道你忙，但做人不能忘本……」八百字，你读完了，还回了个「收到」。', self: 50, hunger: -8 },
    perfectLine: '「去吧去吧，常回学校看看。」',
    coldLine: '「现在的年轻人啊……」她叹了口气。',
  },
  mom: {
    id: 'mom', name: '妈', icon: '📱', init: 45,
    faces: { hot: '😤', safe: '😊', cold: '😑' },
    react: {
      up: '「哎，妈就爱听你说这些。」',
      down: '「行了行了，知道你忙。」',
      transfer: '「你让他跟我说？」',
      heard: '手机屏幕亮了。是妈。',
      intrude: '手机响了，铃声是霸总短剧 BGM。妈：「吃了没？」所有人都看过来。',
    },
    trait: 'caller', traitText: '冷落她就来电话；不接就连环 call，短剧看多了',
    blurb: '霸总短剧十级学者，不接电话的后果到家才知道。',
    hot: { title: '被妈派去买菜', text: '「正好，顺路去菜场带两根葱、一块姜、半斤排骨……」你被硬控在菜场十五分钟。', hunger: -10 },
    trouble: { title: '妈连打了 5 个电话', text: '你终于接起来。「你是不是出事了！我都准备报警了！」解释了十分钟。', self: 50, hunger: -12, flag: 'momAngry' },
    perfectLine: '「行，菜马上好，你路上慢点。」饭桌在等你。',
    coldLine: '「……嗯。」她挂了。比平时早。',
  },
};

export const NPCS = { ...CORE, ...STRANGERS };
export const NPC_ORDER = ['boss', 'zhang', 'lin', 'teacher', 'mom'];
