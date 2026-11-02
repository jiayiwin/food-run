// 日程与场景。结构见 docs/GDD.md 第 6 节。数值不变，文案加梗。
// option: { text, d: { npcId: delta }, hunger }
// beat: { line } 或 { lines: { hot, safe, cold } }（按第 1 拍后主角 NPC 的区间）

export const SCHEDULE = [
  { act: 1, time: '18:00', choices: ['s1'] },
  { act: 1, time: '18:08', choices: ['s2a', 's2b'] },
  { act: 1, time: '18:15', choices: ['s3a', 's3b'] },
  { act: 1, time: '18:25', choices: ['s4a', 's4b'] },
  { act: 2, time: '18:40', choices: ['s5a', 's5b'] },
  { act: 2, time: '18:55', choices: ['s6a', 's6b'] },
  { act: 2, time: '19:10', choices: ['s7a', 's7b'] },
  { act: 3, time: '19:25', choices: ['s8a', 's8b'] },
  { act: 3, time: '19:35', choices: ['s9'] },
];

export const ACT_NAMES = { 1: '公司', 2: '路上', 3: '到家' };

// 每拍选择倒计时（毫秒）。越往后越短。
export const TIMER = { 1: 10000, 2: 8500, 3: 7500, call: 7000, firstBeatBonus: 3000, mini: 9000 };
// 超时「慌了」的随机权重：热情型陷阱更容易中招
export const PANIC_WEIGHTS = [50, 20, 30];
// 第 2 拍闯入概率：有人过热时他主动找来 / 否则随机路人
export const INTRUDE = { hot: 0.6, random: 0.2 };

export const SCENES = {
  s1: {
    id: 's1', npc: 'boss', place: '工位', bg: 'office', others: ['zhang'],
    intro: '18:00 整。你把包的拉链拉上，脸上写满「精神离职」。老板从走廊那头走来，目光扫过你的屏幕。隔壁座的小张假装在敲键盘，耳朵竖得比天线还高。',
    beats: [
      {
        line: '「哦？还没走啊。那个需求，颗粒度对齐得怎么样了？」',
        options: [
          { text: '「老板我跟您闭环一下！」胆子肥嘟嘟地开始汇报', d: { boss: 25 }, hunger: -4 },
          { text: '「还行，明早九点给您完整版。」', d: { boss: -5 } },
          { text: '「这块的抓手是小张，他最有体感。」', d: { boss: -12, zhang: 30 } },
        ],
      },
      {
        lines: { hot: '「来来来，坐下细说。」他把旁边的椅子拉开了——这是要给你画饼的架势。', safe: '「嗯。」他低头看手机，已读乱回。', cold: '「……你最近，班味有点淡啊？」' },
        options: [
          { text: '「您看这个方案是不是很有抓手？」', d: { boss: 15 }, hunger: -3 },
          { text: '点头微笑，脚步往电梯方向偷感很重地挪', d: { boss: -8 } },
          { text: '「对了，小林刚说想跟您聊聊职业规划。」', d: { boss: -10, lin: 25 } },
        ],
      },
    ],
  },
  s2a: {
    id: 's2a', npc: 'zhang', place: '茶水间', bg: 'office',
    intro: '茶水间。小张端着杯子，看见你眼睛一亮，整个人像刚刷到热搜。',
    beats: [
      {
        line: '「家人们谁懂啊！三楼那个——你听说了没？」',
        options: [
          { text: '「什么什么？快说，我 CPU 都要烧了！」', d: { zhang: 20 }, hunger: -5 },
          { text: '「嗯嗯，明天再讲，我先接杯水。」', d: { zhang: -8 } },
          { text: '「这种瓜你得跟老板讲，他肯定上头。」', d: { zhang: -15, boss: 15 } },
        ],
      },
      {
        lines: { hot: '「这还只是前情提要！」他把杯子放下了，准备开 2 小时直播。', safe: '「哦，那你忙。」', cold: '「你最近怎么老躲着我？有被冒犯到。」' },
        options: [
          { text: '陪他吐槽两句，狠狠共情', d: { zhang: 10 }, hunger: -4 },
          { text: '「手机响了，我接个电话。」（并没有）', d: { zhang: -10 } },
          { text: '「小林刚也在问这个，你找她聊，她更懂。」', d: { zhang: -12, lin: 15 } },
        ],
      },
    ],
  },
  s2b: {
    id: 's2b', npc: 'lin', place: '打印室', bg: 'office',
    intro: '打印机嗡嗡响。小林在等她的文件，看见你，耳朵红了，偷感很重。',
    beats: [
      {
        line: '「你……你也来打印？尊嘟假嘟？」',
        options: [
          { text: '「对啊，好巧。」顺便聊两句，情绪价值拉满', d: { lin: 20 }, hunger: -3 },
          { text: '「嗯，拿了就走。」', d: { lin: -6 } },
          { text: '「小张找你，说有急事，特别急那种。」', d: { lin: -10, zhang: 15 } },
        ],
      },
      {
        lines: { hot: '「那个……要不要一起走？」她的声音小到像在发私信。', safe: '「哦。」她抱起文件。', cold: '她把文件抱在胸前，没再说话。淡淡的死感。' },
        options: [
          { text: '「你今天这个发卡好看，有被硬控到。」', d: { lin: 25 } },
          { text: '「我还有点事，先走一步。」', d: { lin: -8 } },
          { text: '「老板好像在找你，你快去。」', d: { lin: -12, boss: 10 } },
        ],
      },
    ],
  },
  s3a: {
    id: 's3a', npc: 'lin', place: '电梯间', bg: 'office',
    intro: '电梯还在 12 楼。小林不知从哪冒出来，站到你旁边，像个随机刷新的 NPC。',
    beats: [
      {
        line: '「你……今天也这么早走？」',
        options: [
          { text: '「是啊，一起？」（胆子肥嘟嘟）', d: { lin: 25 } },
          { text: '「嗯。」低头看手机，活人感归零', d: { lin: -5 } },
          { text: '「我等下一趟，你先。」', d: { lin: -15 }, hunger: -5 },
        ],
      },
      {
        lines: { hot: '「我、我也去那个方向！」（她不去那个方向）', safe: '电梯「叮」一声到了。', cold: '她看了看楼层数字，没说话。空气凝固了。' },
        options: [
          { text: '聊聊周末去哪 City 一下', d: { lin: 15 }, hunger: -3 },
          { text: '「我走楼梯，顺便运动。」（脆皮打工人的倔强）', d: { lin: -10 }, hunger: -4 },
          { text: '「小张好像在找你合计项目。」', d: { lin: -12, zhang: 10 } },
        ],
      },
    ],
  },
  s3b: {
    id: 's3b', npc: 'zhang', place: '楼梯', bg: 'office',
    intro: '你决定走楼梯。十楼拐角，小张正在打电话，看见你，挂了。显眼包本包。',
    beats: [
      {
        line: '「正好正好！跟你说个事！听劝，这事你必须听！」',
        options: [
          { text: '停下来听，全是感情没有技巧', d: { zhang: 15 }, hunger: -6 },
          { text: '「边走边说。」', d: { zhang: -5 }, hunger: -2 },
          { text: '「老板刚说找你呢，快去，别让他等。」', d: { zhang: -15, boss: 12 } },
        ],
      },
      {
        lines: { hot: '「还有一件事——」他掏出了手机准备给你看截图。', safe: '「行，那我先回去了。」', cold: '「你这人，淡人是吧？」' },
        options: [
          { text: '「你说得对！」附和一句，赛博点头', d: { zhang: 10 } },
          { text: '「下楼再说。」加快脚步', d: { zhang: -8 }, hunger: -2 },
          { text: '「小林好像也想听，你俩对齐一下。」', d: { zhang: -10, lin: 12 } },
        ],
      },
    ],
  },
  s4a: {
    id: 's4a', npc: 'boss', place: '大门口', bg: 'lobby', others: ['lin'],
    intro: '大厅。老板也在等车，抱着电脑包，一身班味。小林站在不远处，手里的伞转来转去。',
    beats: [
      {
        line: '「哦，你也走了？那个方案……我们是不是还可以再赋能一下？」',
        options: [
          { text: '「我刚好想到几点，跟您说说！」', d: { boss: 20 }, hunger: -6 },
          { text: '「明早九点，一定给您，包的。」', d: { boss: -6 } },
          { text: '「小张那边有新想法，让他跟您对齐。」', d: { boss: -12, zhang: 20 } },
        ],
      },
      {
        lines: { hot: '「上车，我捎你一段，路上聊。」——这就是传说中的 PUA 专车。', safe: '他的车来了。', cold: '「嗯。」他没抬头，但你知道他记住了。' },
        options: [
          { text: '「好啊！」上车（你是真的胆子肥嘟嘟）', d: { boss: 15 }, hunger: -8 },
          { text: '「不用不用，我坐地铁，顺便 City 一下。」', d: { boss: -8 } },
          { text: '「小林顺路，让她蹭您车吧。」', d: { boss: -10, lin: 20 } },
        ],
      },
    ],
  },
  s4b: {
    id: 's4b', npc: 'lin', place: '后门', bg: 'lobby',
    intro: '你从后门溜。台阶上坐着小林，像在等人。偷感很重的是你，还是她？',
    beats: [
      {
        line: '「啊，好巧，你也走后门？」',
        options: [
          { text: '「等人？我陪你等会儿。」', d: { lin: 25 }, hunger: -5 },
          { text: '「嗯，赶车。」', d: { lin: -6 } },
          { text: '「小张刚从正门走，你找他吗？」', d: { lin: -10, zhang: 10 } },
        ],
      },
      {
        lines: { hot: '「其实……我在等你。」——短剧开场白级别的直球。', safe: '「那、那你路上小心。」', cold: '她站起来走了，没回头。BGM 该切悲伤版了。' },
        options: [
          { text: '「啊？」愣住两秒，脑子里弹幕刷屏', d: { lin: 20 } },
          { text: '「明天见！」挥手快走', d: { lin: -10 } },
          { text: '「老板在正门等车，你去跟他打个招呼？」', d: { lin: -12, boss: 12 } },
        ],
      },
    ],
  },
  s5a: {
    id: 's5a', npc: 'teacher', place: '地铁站', bg: 'street',
    intro: '地铁站台。一个熟悉的背影转过来——高中班主任。你的 DNA 动了。',
    beats: [
      {
        line: '「哟！这不是我学生吗！现在在哪儿高就？上岸了没？」',
        options: [
          { text: '详细汇报人生近况，从高考讲到今天', d: { teacher: 20 }, hunger: -6 },
          { text: '「还行还行，老师您身体好吗？」', d: { teacher: -5 } },
          { text: '「我同事小张就是您学校毕业的！」', d: { teacher: -10, zhang: 10 } },
        ],
      },
      {
        lines: { hot: '「来来来，跟老师好好聊聊。」她的保温杯拧开了。', safe: '「不错不错，有空回学校看看。」', cold: '「现在的年轻人，见了老师话都不说，唉。」' },
        options: [
          { text: '「老师您当年那堂课，我到现在都记得……」', d: { teacher: 15 }, hunger: -5 },
          { text: '「车来了！老师再见！」', d: { teacher: -8 } },
          { text: '「我妈让我回去吃饭，她老念叨您。」', d: { teacher: -10, mom: 10 } },
        ],
      },
    ],
  },
  s5b: {
    id: 's5b', npc: 'zhang', place: '公交站', bg: 'street', others: ['lin'],
    intro: '公交站。小张居然也在。「咱俩顺路啊！」小林在站牌另一头，装作没看见你们。',
    beats: [
      {
        line: '「正好，上车继续聊，我这瓜还没吃完。」',
        options: [
          { text: '「聊！」', d: { zhang: 15 }, hunger: -6 },
          { text: '「我去对面坐地铁。」', d: { zhang: -10 }, hunger: -3 },
          { text: '「你不是跟小林一个方向吗？」', d: { zhang: -12, lin: 12 } },
        ],
      },
      {
        lines: { hot: '「我跟你说，老板今天……」压低声音，开启吃瓜模式。', safe: '「那行，明天见。」', cold: '「行吧，你走你的，我不理解但我尊重。」' },
        options: [
          { text: '「老板怎么了？」', d: { zhang: 12, boss: 8 } },
          { text: '戴上耳机，物理退退退', d: { zhang: -10 } },
          { text: '「你直接给老板发消息问问呗。」', d: { zhang: -8, boss: 15 } },
        ],
      },
    ],
  },
  s6a: {
    id: 's6a', npc: 'lin', place: '便利店', bg: 'street',
    intro: '便利店门口。小林拎着两份关东煮，正好出来。这剧情，短剧编剧都不敢这么写。',
    beats: [
      {
        line: '「这个……多买了一份，你要不要？」',
        options: [
          { text: '「好啊！」接过来，我哭死', d: { lin: 25 }, hunger: 8 },
          { text: '「不用不用，我回家吃，我妈做了。」', d: { lin: -8 } },
          { text: '「给小张吧，他刚说饿。」', d: { lin: -12, zhang: 10 } },
        ],
      },
      {
        lines: { hot: '「那、那我们一起走一段？」', safe: '「好吧……」', cold: '她把关东煮扔进了垃圾桶。蚌埠住了。' },
        options: [
          { text: '一起走一段', d: { lin: 15 }, hunger: -6 },
          { text: '「我还要去个地方。」（没有）', d: { lin: -10 } },
          { text: '「老师刚还在车站，你去打个招呼？」', d: { lin: -8, teacher: 10 } },
        ],
      },
    ],
  },
  s6b: {
    id: 's6b', npc: 'mom', place: '路口', bg: 'street',
    intro: '等红灯。手机震了。来电显示：妈。',
    beats: [
      {
        line: '「喂？到哪了？吃了没？我刚看那个短剧，那个战神回家也是先吃饭。」',
        options: [
          { text: '「刚下班，马上到。」慢慢汇报，顺便聊短剧', d: { mom: 15 }, hunger: -5 },
          { text: '「快到了！信号不好先挂了！」', d: { mom: -10 } },
          { text: '「我让小张帮我带了饭。」', d: { mom: -15, zhang: 8 } },
        ],
      },
      {
        lines: { hot: '「我再跟你说个事——你楼下张姨家那个闺女……」', safe: '「那你快点回来，菜都好了。」', cold: '「……你是不是不想跟妈说话？」' },
        options: [
          { text: '「您说。」继续听，当个孝子', d: { mom: 10 }, hunger: -5 },
          { text: '「地铁来了！」挂断', d: { mom: -8 } },
          { text: '「让我爸跟您说。」', d: { mom: -12 } },
        ],
      },
    ],
  },
  s7a: {
    id: 's7a', npc: 'teacher', place: '换乘通道', bg: 'street',
    intro: '换乘通道。老师居然也在换乘，向你挥手。这是什么缘分，硬控你两站。',
    beats: [
      {
        line: '「这么巧！老师正好要去那边，咱俩一起走！」',
        options: [
          { text: '「好啊老师！」', d: { teacher: 20 }, hunger: -6 },
          { text: '「老师我坐反方向。」', d: { teacher: -8 } },
          { text: '「小张就住那边，您可以问他路。」', d: { teacher: -10, zhang: 10 } },
        ],
      },
      {
        lines: { hot: '「那你明天来学校给学弟学妹讲讲？讲讲怎么上岸的。」', safe: '「去吧去吧。」', cold: '「唉，人心都变了。」' },
        options: [
          { text: '「可以可以！」（你并没有上岸）', d: { teacher: 15 } },
          { text: '「下周看看时间。」', d: { teacher: -6 } },
          { text: '「小林口才好，让她来讲。」', d: { teacher: -10, lin: 12 } },
        ],
      },
    ],
  },
  s7b: {
    id: 's7b', npc: 'mom', place: '步行', bg: 'street',
    intro: '你决定走最后一段。妈发来视频通话，还是那个霸总短剧的 BGM 当铃声。',
    beats: [
      {
        line: '「让妈看看你，脸怎么这么瘦，公司是不是不给饭吃？」',
        options: [
          { text: '接视频边走边聊', d: { mom: 15 }, hunger: -6 },
          { text: '「妈我走路呢，到家再说。」', d: { mom: -8 } },
          { text: '「我爸不是在家吗，你让他切菜。」', d: { mom: -10 } },
        ],
      },
      {
        lines: { hot: '「晚上我给你炖个汤，补一补。」', safe: '「行，等你。」', cold: '「不接妈的视频，忙什么呢，忙着搞钱？」' },
        options: [
          { text: '「好好好。」', d: { mom: 8 }, hunger: -3 },
          { text: '「到楼下了！」挂断', d: { mom: -10 } },
          { text: '「门口好多人我先看路。」', d: { mom: -6 }, hunger: -2 },
        ],
      },
    ],
  },
  s8a: {
    id: 's8a', npc: 'mom', place: '小区正门', bg: 'home', others: [],
    intro: '小区门口。妈的消息：「我在阳台看着你呢。」你抬头，果然。',
    beats: [
      {
        line: '「怎么走这么慢！特种兵呢？快上来！」',
        options: [
          { text: '抬头朝阳台挥手，拉满活人感', d: { mom: 15 } },
          { text: '「马上马上。」', d: { mom: -5 }, hunger: -2 },
          { text: '「邻居张姨拉着我说话。」', d: { mom: -10 } },
        ],
      },
      {
        lines: { hot: '「我下来接你！」', safe: '「门开着。」', cold: '「随便你吧。」' },
        options: [
          { text: '「您下来吧，正好帮我拎东西。」', d: { mom: 10 }, hunger: -4 },
          { text: '「别下来，我自己上。」', d: { mom: -8 } },
          { text: '发个「爱你」表情包', d: { mom: 5 } },
        ],
      },
    ],
  },
  s8b: {
    id: 's8b', npc: 'lin', place: '小区侧门', bg: 'home',
    intro: '侧门。你一愣：小林站在路灯下。「我……顺路。」这是什么重生之我在楼下等你。',
    beats: [
      {
        line: '「我就是……想确认你到家了。」',
        options: [
          { text: '「谢谢你，要不要上来喝口水？」', d: { lin: 30 }, hunger: -6 },
          { text: '「到了到了，你快回去吧。」', d: { lin: -10 } },
          { text: '「小张住隔壁楼，你去找他。」', d: { lin: -15, zhang: 15 } },
        ],
      },
      {
        lines: { hot: '「那……明天见？」她没走。', safe: '「嗯，明天见。」', cold: '她转身走了。弹幕：心疼小林。' },
        options: [
          { text: '「明天见！」挥手', d: { lin: 5 } },
          { text: '「拜拜。」', d: { lin: -5 } },
          { text: '「路上注意安全。」', d: { lin: 8 } },
        ],
      },
    ],
  },
  s9: {
    id: 's9', npc: 'mom', place: '家门', bg: 'home', final: true,
    intro: '钥匙转了两圈。门开了，饭菜的味道扑面而来。牛马一日，终于到站。',
    beats: [
      {
        lines: { hot: '「怎么这么晚！坐下，先跟妈说说今天。」', safe: '「回来啦！洗手，吃饭！」', cold: '「哦，回来了。饭在锅里。」' },
        options: [
          { text: '「妈我饿死了！」直奔饭桌', d: { mom: -5 } },
          { text: '先汇报今天，从老板讲到小林', d: { mom: 15 }, hunger: -6 },
          { text: '「我爸呢？」', d: { mom: -8 } },
        ],
      },
    ],
  },
};

// 妈过冷时插入的来电场景（不占时段）
export const CALL_SCENE = {
  id: 'call', npc: 'mom', place: '来电', bg: 'street', isCall: true,
  intro: '手机震个不停。来电显示：妈。你已经有一会儿没理她了，她那边估计已经在脑补短剧了。',
  beats: [
    {
      line: '「喂？怎么不回消息？是不是出事了？」',
      options: [
        { text: '接，好好说两句', d: { mom: 25 }, hunger: -6 },
        { text: '「在地铁上，信号不好。」已读乱回', d: { mom: 5 }, hunger: -2 },
        { text: '按掉', d: { mom: -5 }, grudge: 1 },
      ],
    },
  ],
};
