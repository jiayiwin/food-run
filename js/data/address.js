// 主角称呼表：男 / 女主角各一套（存档 save.gender：'m' / 'f'，没选过按男主角）。
// 文案里写 {键}：键就是男主角那一版的词；同一个词因为说话的人不同、女主角那一版不一样时，键前面加说话人，如 {外卖:兄弟}。
// 换词只在「画字」那一层做（gfx.text / measure / warm、draw.js 的 text 和折行、分享标题），逻辑层的文字原样保留 {键}：
// 借口图鉴的键、记仇时复述的那句、存档里的东西都和性别无关，换主角不会丢图鉴。test/address.test.js 两套都过文案长度检查
export const ADDRESS = {
  帅哥: ['帅哥', '美女'],            // 街上推销、搭讪（Tony）
  小伙子: ['小伙子', '姑娘'],        // 长辈叫你（王阿姨、老周、奶奶）
  兄弟: ['兄弟', '姐妹'],            // 同辈的好朋友、合租室友
  亲哥: ['亲哥', '亲姐'],            // 室友感激涕零（「你是我亲哥」）
  '外卖:兄弟': ['兄弟', '美女'],     // 外卖小哥这样的陌生同龄人随口一叫
  好兄弟: ['好兄弟', '好姐们'],      // 阿杰借到充电宝
  儿子: ['儿子', '女儿'],            // 爸妈说起你
  好小子: ['好小子', '好丫头'],      // 爸爸夸你
  乖孙: ['乖孙', '乖孙女'],          // 奶奶叫你
  爸爸: ['爸爸', '妈妈'],            // 孩子叫你
  老婆: ['老婆', '老公'],            // 你的另一半
  侄女: ['侄女', '侄子'],            // 王阿姨要介绍给你的人
  他: ['他', '她'],                  // 别人说起你
};

let cur = 'm';
export const setAddressGender = g => { cur = g === 'f' ? 'f' : 'm'; };
export const addressGender = () => cur;
const pickOf = g => (g === 'f' ? 1 : 0);
// 单个词：term('帅哥', 'f') → '美女'。不认识的键原样返回
export const term = (key, g = cur) => { const e = Object.prototype.hasOwnProperty.call(ADDRESS, key) ? ADDRESS[key] : null; return e ? e[pickOf(g)] : key; };
const RE = /\{([^{}]{1,8})\}/g;
// 整句：把 {键} 换成这一套的词（不认识的 {…} 原样留着）。非字符串原样返回
export function say(s, g = cur) {
  if (typeof s !== 'string' || s.indexOf('{') < 0) return s;
  return s.replace(RE, (m, k) => (Object.prototype.hasOwnProperty.call(ADDRESS, k) ? ADDRESS[k][pickOf(g)] : m));
}
// 文案里用到的键（测试用：每个 {…} 都得在表里）
export const keysIn = s => (typeof s === 'string' ? [...s.matchAll(RE)].map(m => m[1]) : []);
