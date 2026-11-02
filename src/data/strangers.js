// 路人与动物：一次性遭遇，不进常驻名单（没有冷落衰减、怨气、闯入），每次见面注意力从 50 开始。
// 处理得「刚好」会掉道具；太热会被硬控扣饥饿。文案走梗。
export const STRANGERS = {
  cat: {
    id: 'cat', name: '流浪猫', icon: '🐈', transient: true, animal: true, init: 50,
    traitText: '动物：蹭上来就走不了', blurb: '垃圾桶旁的橘猫，哈基米本米。',
    faces: { hot: '😻', safe: '🐈', cold: '🙀' },
    react: { up: '「喵～」它开始蹭你的裤腿。', down: '它看了你一眼，甩甩尾巴。', transfer: '它不理会这些人类的事。', heard: '它在旁边舔爪子。', intrude: '一只橘猫从花坛里钻出来，蹭上你的腿。' },
    hot: { title: '被橘猫硬控', text: '它躺下翻肚皮了。你蹲下摸了十分钟，饭在凉。', hunger: -6 },
    perfectLine: '它优雅地走开了，像从没见过你。', coldLine: '它冲你哈了一声。',
    drop: 'snack', dropLine: '叼来一根没吃完的鱼丸串。你……收下了。',
    mini: { title: '摸一下就走', hint: '按住摸，它会越来越上头；在「刚好」松手，然后走。', hold: '呼噜呼噜……', early: '它冲你哈了一声。', late: '它翻肚皮了，你走不掉了。' },
  },
  dog: {
    id: 'dog', name: '小区柯基', icon: '🐕', transient: true, animal: true, init: 50,
    traitText: '动物：热情过头会扑', blurb: '楼下那只，见谁都像见亲人。',
    faces: { hot: '🐶', safe: '🐕', cold: '🐕‍🦺' },
    react: { up: '它的尾巴摇成了螺旋桨。', down: '它歪了歪头。', transfer: '它只认吃的。', heard: '它在旁边嗅来嗅去。', intrude: '一只柯基拖着主人冲了过来。' },
    hot: { title: '被柯基扑倒', text: '它扑上来舔了你一脸。主人跑来道歉，聊了八分钟狗。', hunger: -7 },
    perfectLine: '它被一只蝴蝶吸引走了。', coldLine: '它委屈地汪了一声。',
    drop: 'coffee', dropLine: '它主人说「谢谢你没吓它」，塞给你一张咖啡券。',
    mini: { title: '摸一下就走', hint: '按住摸，尾巴摇得越来越快；在「刚好」松手，然后走。', hold: '汪汪汪！', early: '它委屈地汪了一声。', late: '它扑上来了。' },
  },
  flyer: {
    id: 'flyer', name: '发传单小哥', icon: '📄', transient: true, init: 50,
    traitText: '陌生人：接了传单就有后续', blurb: '「帅哥美女了解一下」专业户。',
    faces: { hot: '🤩', safe: '🙂', cold: '😑' },
    react: { up: '「哥！你是今天第一个理我的人！」', down: '「好的好的，打扰了。」', transfer: '「那位也要吗？」', heard: '他在旁边继续塞传单。', intrude: '一张传单从斜刺里递到你面前。' },
    hot: { title: '被拉去扫码', text: '扫码、关注、填手机号、领一包纸巾。十分钟。', hunger: -6 },
    perfectLine: '「谢谢哈。」他转向下一个人。', coldLine: '他把传单收了回去，眼神有点受伤。',
    drop: 'coffee', dropLine: '传单背面有张免费咖啡券。',
    mini: { title: '擦肩而过', hint: '他的目光在人群里扫。趁他看别处的时候，走。', caught: '「帅哥美女！就你了！」', stall: '你站了太久，他把你当成了目标。' },
  },
  grandpa: {
    id: 'grandpa', name: '问路大爷', icon: '👴', transient: true, init: 50,
    traitText: '陌生人：一问就是一段人生', blurb: '问路只是开场白。',
    faces: { hot: '😄', safe: '🧓', cold: '😕' },
    react: { up: '「小伙子/小姑娘，你们单位在哪儿啊？」', down: '「哦，往那边走啊，谢谢。」', transfer: '「那我问问那位。」', heard: '他拄着拐在旁边等。', intrude: '一位大爷拍了拍你的肩：「同志，请问……」' },
    hot: { title: '被大爷唠了一路', text: '从问路聊到他孙子考研。你给他画了张地图。', hunger: -6 },
    perfectLine: '「好嘞，谢谢你啊。」', coldLine: '「现在的年轻人……」他摇摇头走了。',
    drop: 'snack', dropLine: '塞给你一把花生：「吃点，年轻人别饿着。」',
    mini: { title: '擦肩而过', hint: '大爷在找人问路。趁他看别处的时候，走。', caught: '「同志！同志！」', stall: '你犹豫的样子太好认了。' },
  },
  dancer: {
    id: 'dancer', name: '广场舞阿姨', icon: '💃', transient: true, init: 50,
    traitText: '陌生人：认识你妈', blurb: '小区情报中心主任。',
    faces: { hot: '🤗', safe: '🙂', cold: '🙄' },
    react: { up: '「哎哟这不是那谁家孩子吗！」', down: '「回来啦，快上去吧。」', transfer: '「那位也是你同事？」', heard: '她的眼神在你和旁边的人之间来回扫。', intrude: '广场舞音乐停了，一位阿姨朝你走来。' },
    hot: { title: '被阿姨盘问', text: '「有对象了吗？工资多少？」她拍了张照，发给了你妈。', hunger: -5, mom: 12 },
    perfectLine: '她转身去拉下一个人入伙了。', coldLine: '「这孩子怎么不爱说话。」她跟同伴嘀咕。',
    drop: 'sunglasses', dropLine: '「天黑了还戴墨镜」——她把捡到的墨镜塞给了你。',
    mini: { title: '擦肩而过', hint: '阿姨一边跳一边扫视全场。趁她转身的时候，走。', caught: '「哎哟！这不是——」', stall: '你在广场边上站成了一个显眼包。' },
  },
  rider: {
    id: 'rider', name: '外卖小哥', icon: '🛵', transient: true, init: 50,
    traitText: '陌生人：比你还急', blurb: '时间比你紧，饭比你多。',
    faces: { hot: '😅', safe: '🙂', cold: '😤' },
    react: { up: '「哥帮个忙，这单是不是你们楼的？」', down: '「好的谢谢！」他一脚油门。', transfer: '「那位是吗？」', heard: '他在旁边看手机倒计时。', intrude: '一辆电瓶车急刹在你面前。' },
    hot: { title: '帮外卖小哥找门牌', text: '你带他绕了三栋楼。他的订单超时了，你的饭也凉了。', hunger: -6 },
    perfectLine: '「好嘞！」他像风一样消失。', coldLine: '「行吧。」他骂骂咧咧地走了。',
    drop: 'powerbank', dropLine: '「哥你拿着，我车上还有。」一个充电宝。',
    mini: { title: '擦肩而过', hint: '小哥在找门牌，目光来回扫。趁他看手机的时候，走。', caught: '「哥！等等！」', stall: '你站在路中间，他只能问你了。' },
  },
  borrower: {
    id: 'borrower', name: '借手机的陌生人', icon: '📱', transient: true, init: 50,
    traitText: '陌生人：越热情越可疑', blurb: '「手机没电了，借打个电话」。',
    faces: { hot: '😏', safe: '😐', cold: '😒' },
    react: { up: '「谢谢谢谢，你人真好。」他的眼神往你手机上飘。', down: '「哦，那算了。」', transfer: '「那位有手机吗？」', heard: '他在旁边搓着手。', intrude: '一个人凑上来：「朋友，手机借用一下？」' },
    hot: { title: '被借手机的缠上', text: '电话打了十分钟，还要加你微信。你的手机热得像关东煮。', hunger: -5 },
    perfectLine: '他耸耸肩，去问下一个人。', coldLine: '「这么防备干嘛。」',
    drop: 'earbuds', dropLine: '他落下一副耳机。你决定……先用着。',
    mini: { title: '擦肩而过', hint: '他在挑目标。趁他看别人的时候，走。', caught: '「朋友！就你了！」', stall: '你盯着他看太久，他觉得你有戏。' },
  },
};

export const STRANGER_SCENES = {
  x_cat: {
    id: 'x_cat', npc: 'cat', place: '垃圾桶旁', bg: 'street', stranger: true,
    intro: '垃圾桶旁蹲着一只橘猫。它看见你，站起来，尾巴竖成天线。',
    beats: [{
      line: '「喵～」（它朝你走来，哈基米本米）',
      options: [
        { text: '蹲下摸，猫猫头硬控我', d: { cat: 25 }, hunger: -3 },
        { text: '绕开，目不斜视', d: { cat: -8 } },
        { text: '把关东煮渣扔给它', d: { cat: 5 }, hunger: -2 },
      ],
    }],
  },
  x_dog: {
    id: 'x_dog', npc: 'dog', place: '楼下草坪', bg: 'home', stranger: true,
    intro: '楼下的柯基认出了你，整条狗开始摇。',
    beats: [{
      line: '「汪！」（它拖着主人冲过来）',
      options: [
        { text: '张开双臂迎接', d: { dog: 25 }, hunger: -3 },
        { text: '侧身让过，脚步不停', d: { dog: -8 } },
        { text: '指着别处：「看！猫！」', d: { dog: -15 } },
      ],
    }],
  },
  x_flyer: {
    id: 'x_flyer', npc: 'flyer', place: '地铁口', bg: 'street', stranger: true,
    intro: '地铁口。一个小哥举着一沓传单，锁定了你。',
    beats: [{
      line: '「帅哥美女了解一下，健身游泳瑜伽，今天办卡送……」',
      options: [
        { text: '「送什么？」停下脚步', d: { flyer: 25 }, hunger: -4 },
        { text: '「谢谢不用。」接过传单继续走', d: { flyer: -6 } },
        { text: '「我同事刚说想办卡。」指向身后', d: { flyer: -15 } },
      ],
    }],
  },
  x_grandpa: {
    id: 'x_grandpa', npc: 'grandpa', place: '路口', bg: 'street', stranger: true,
    intro: '路口。一位大爷拿着手机凑过来，屏幕亮度 100%。',
    beats: [{
      line: '「同志，请问这个地方怎么走？我孙子让我……」',
      options: [
        { text: '接过手机，帮他从头设置导航', d: { grandpa: 25 }, hunger: -5 },
        { text: '「往前右拐。」指一下', d: { grandpa: -6 } },
        { text: '「那边保安知道。」', d: { grandpa: -12 } },
      ],
    }],
  },
  x_dancer: {
    id: 'x_dancer', npc: 'dancer', place: '小区广场', bg: 'home', stranger: true,
    intro: '小区广场。音乐震天，一位阿姨从队伍里脱出，朝你走来。她认识你妈。',
    beats: [{
      line: '「哎哟，回来啦！你妈说你最近……有对象了吗？」',
      options: [
        { text: '「阿姨您跳得真好！」', d: { dancer: 25 }, hunger: -4 },
        { text: '「阿姨好，我妈等我吃饭。」', d: { dancer: -6 } },
        { text: '「我同事还单着，要不……」', d: { dancer: -15 } },
      ],
    }],
  },
  x_rider: {
    id: 'x_rider', npc: 'rider', place: '小区门口', bg: 'home', stranger: true,
    intro: '小区门口。一辆电瓶车急刹，外卖小哥满头汗。',
    beats: [{
      line: '「哥！这个三单元在哪儿？我还有两分钟！」',
      options: [
        { text: '「我带你去！」', d: { rider: 25 }, hunger: -5 },
        { text: '「那栋，红门。」指一下', d: { rider: -6 } },
        { text: '「问保安。」', d: { rider: -12 } },
      ],
    }],
  },
  x_borrower: {
    id: 'x_borrower', npc: 'borrower', place: '天桥', bg: 'street', stranger: true,
    intro: '天桥上。一个人凑过来，笑容标准得像模板。',
    beats: [{
      line: '「朋友，手机没电了，借我打个电话？就一分钟。」',
      options: [
        { text: '「好的！」递过去，胆子肥嘟嘟', d: { borrower: 25 }, hunger: -4 },
        { text: '「不好意思，我也没电了。」', d: { borrower: -8 } },
        { text: '「那边有公用电话。」', d: { borrower: -12 } },
      ],
    }],
  },
};

export const STRANGER_IDS = Object.keys(STRANGER_SCENES);
// 路人抽取权重：动物翻倍
export const STRANGER_WEIGHTS = STRANGER_IDS.map(id => ({ w: STRANGERS[STRANGER_SCENES[id].npc].animal ? 2 : 1, v: id }));
export const ANIMAL_IDS = Object.values(STRANGERS).filter(n => n.animal).map(n => n.id);
