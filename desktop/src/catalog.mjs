// 商店目录：房间里的每个"位置"（槽位）和能放进去的东西
//
// 两种槽位：
//   base  —— 永远有一件东西，换掉默认款就是"替换"（地板、书桌、电脑……）
//   decor —— 装饰位，可以空着；每个装饰位只放一件，所以装饰之间不会打架
//
// 位置用房间的世界坐标描述（房间 96×96，左墙 x=0，后墙 y=0，z 是高度），
// 只是给人看的；真正画在哪里由 room.js 里对应的绘制函数决定。

export const SLOTS = [
  // ----- 墙和地 -----
  { id: 'floor', name: '地板', type: 'base', group: 'room', where: '整个地面' },
  { id: 'wall', name: '壁纸', type: 'base', group: 'room', where: '左墙 + 后墙' },
  { id: 'rug', name: '地毯', type: 'base', group: 'room', where: '房间中间 (16..48, 16..48)' },
  { id: 'curtain', name: '窗帘', type: 'base', group: 'room', where: '左墙窗户两边' },
  { id: 'lights', name: '串灯', type: 'base', group: 'room', where: '两面墙顶上' },
  // ----- 家具 -----
  { id: 'catDesk', name: '小猫的书桌', type: 'base', group: 'furniture', where: '左墙 (0..12, 44..66)' },
  { id: 'catPC', name: '小猫的电脑', type: 'base', group: 'furniture', where: '小猫书桌上' },
  { id: 'jellyDesk', name: '水母的书桌', type: 'base', group: 'furniture', where: '后墙 (44..66, 0..12)' },
  { id: 'jellyPC', name: '水母的电脑', type: 'base', group: 'furniture', where: '水母书桌上' },
  { id: 'shelf', name: '书架', type: 'base', group: 'furniture', where: '后墙 (70..86, 0..10)' },
  { id: 'bowls', name: '饭盆', type: 'base', group: 'furniture', where: '小猫 (38,88)、水母 (76,15)' },
  { id: 'catBed', name: '猫窝', type: 'base', group: 'furniture', where: '左前方 (24,82)' },
  { id: 'jellyBed', name: '水母的床', type: 'base', group: 'furniture', where: '右边小凳上 (84,40)' },
  { id: 'lamp', name: '落地灯', type: 'base', group: 'furniture', where: '左前角 (5,92)' },
  { id: 'plant', name: '大盆栽', type: 'base', group: 'furniture', where: '右边 (90,62)' },
  { id: 'clock', name: '挂钟', type: 'base', group: 'furniture', where: '后墙书架上方 (76,0,40)' },
  // ----- 装饰位 -----
  { id: 'wallL1', name: '左墙挂画', type: 'decor', group: 'decor', where: '左墙 (y30..42, z30..40)' },
  { id: 'wallL2', name: '左墙小挂饰', type: 'decor', group: 'decor', where: '左墙 (y48..62, z30..42)，小猫电脑上方' },
  { id: 'wallB1', name: '后墙空墙', type: 'decor', group: 'decor', where: '后墙 (x20..40, z24..44)，电视和合照之间' },
  { id: 'sill', name: '窗台', type: 'decor', group: 'decor', where: '窗台上 (0, 72..84, 22)' },
  { id: 'cabinetTop', name: '电视柜上', type: 'decor', group: 'decor', where: '电视柜顶 (5..10, 8..12, 9)' },
  { id: 'catDeskTop', name: '小猫桌角', type: 'decor', group: 'decor', where: '小猫书桌靠外的角 (8,62,16)' },
  { id: 'jellyDeskTop', name: '水母桌角', type: 'decor', group: 'decor', where: '水母书桌右角 (62,8,15)' },
  { id: 'shelfTop', name: '书架顶', type: 'decor', group: 'decor', where: '书架顶上 (80,5,30)' },
  { id: 'floorFront', name: '前面空地', type: 'decor', group: 'decor', where: '前方地上 (62,88)' },
  { id: 'floorRight', name: '右边角落', type: 'decor', group: 'decor', where: '右前方地上 (88,84)' },
  { id: 'toys', name: '地上的小玩具', type: 'decor', group: 'decor', where: '毛线球 (48,88)、小鱼 (60,74)、坐垫 (70,62)' },
];
// 不卖、永远在的东西：合照、爱心贴纸、床头柜（抽屉互动）、猫粮袋、电视、马克杯、小夜灯

export const GROUPS = [
  { id: 'furniture', name: '家具' },
  { id: 'room', name: '墙和地' },
  { id: 'decor', name: '装饰' },
  { id: 'halloween', name: '🎃 万圣节' },
];

const I = (id, slot, name, price, look, extra = {}) => ({ id, slot, name, price, look, ...extra });
const H = (id, slot, name, price, look) => I(id, slot, name, price, look, { set: 'halloween' });

export const ITEMS = [
  // ===== 默认款（免费、一开始就有） =====
  I('floor_wood', 'floor', '木地板', 0, { kind: 'wood', a: '#b07444', b: '#a46a3d', seam: '#7d4e2c', hi: '#c0854f' }),
  I('wall_mint', 'wall', '薄荷条纹', 0, { kind: 'stripe', a: '#6f9f92', b: '#65958a', backA: '#7aa69a', backB: '#70998e' }),
  I('rug_purple', 'rug', '紫色地毯', 0, { kind: 'stripe', a: '#8c5a8f', b: '#7d4f80', edge: '#f0d9a8' }),
  I('curtain_red', 'curtain', '红窗帘', 0, { a: '#c45b6a', b: '#b04e5e' }),
  I('lights_fairy', 'lights', '小串灯', 0, { kind: 'bulb', colors: ['#ffd98a', '#ffb3c7', '#bde8ff'] }),
  I('catdesk_wood', 'catDesk', '木书桌', 0, { top: '#b98252', left: '#9a6a42', right: '#83582f', edge: '#d39a66' }),
  I('catpc_black', 'catPC', '黑色显示器', 0, { kind: 'flat', body: '#3a3a44', dk: '#2b2b33' }),
  I('jellydesk_sand', 'jellyDesk', '沙色书桌', 0, { top: '#c8a07a', left: '#a8825e', right: '#8e6b4a', edge: '#e0bb92' }),
  I('jellypc_black', 'jellyPC', '黑色显示器', 0, { kind: 'flat', body: '#3a3a44', dk: '#2b2b33' }),
  I('shelf_wood', 'shelf', '木书架', 0, { top: '#8a5a38', left: '#74482c', right: '#5e3a24', edge: '#a8744c', books: 'normal' }),
  I('bowls_ceramic', 'bowls', '陶瓷小碗', 0, { kind: 'ceramic', rim: '#fff6e8', cat: ['#e05a6f', '#b8445a'], jelly: ['#4a9fd0', '#3a80ab'] }),
  I('catbed_cushion', 'catBed', '紫色软垫', 0, { kind: 'cushion', a: '#4b3a5c', b: '#6c5785', c: '#8b75a6' }),
  I('jellybed_bowl', 'jellyBed', '圆鱼缸', 0, { kind: 'bowl' }),
  I('lamp_floor', 'lamp', '落地灯', 0, { kind: 'floor', shade: '#e8a25a', glow: '#ffd59a' }),
  I('plant_leafy', 'plant', '绿萝', 0, { kind: 'leafy' }),
  I('clock_round', 'clock', '圆挂钟', 0, { kind: 'round' }),
  I('wallL1_fish', 'wallL1', '小鱼画', 0, { kind: 'fishart' }),
  I('wallL2_memo', 'wallL2', '黄色便签', 0, { kind: 'memo' }),
  I('cabinet_console', 'cabinetTop', '游戏机', 0, { kind: 'console' }),
  I('jellytop_shell', 'jellyDeskTop', '小海螺', 0, { kind: 'shell' }),
  I('shelftop_plant', 'shelfTop', '小盆栽', 0, { kind: 'plantSmall' }),
  I('toys_basic', 'toys', '毛线球和小鱼', 0, { kind: 'toys' }),

  // ===== 日常款 =====
  // 墙和地
  I('floor_light', 'floor', '浅色木地板', 60, { kind: 'wood', a: '#d6b088', b: '#cba47c', seam: '#a8835e', hi: '#e6c49e' }),
  I('floor_tatami', 'floor', '榻榻米', 80, { kind: 'tatami', a: '#b9b77a', b: '#aeac6e', seam: '#5f6b3a', hi: '#cfcd92' }),
  I('wall_cream', 'wall', '奶油格纹', 60, { kind: 'plaid', a: '#efe2c6', b: '#e4d4b2', line: '#d8a7a0', backA: '#e9dcbf', backB: '#ddcdaa' }),
  I('wall_sakura', 'wall', '樱花粉', 60, { kind: 'stripe', a: '#f1c4cf', b: '#eab5c2', backA: '#f0c8d2', backB: '#e8b9c5' }),
  I('wall_night', 'wall', '星空蓝', 70, { kind: 'stars', a: '#2e3a66', b: '#2a355e', backA: '#323f6e', backB: '#2d3966' }),
  I('rug_blue', 'rug', '蓝格子地毯', 40, { kind: 'plaid', a: '#5d8fc9', b: '#4f7fb8', edge: '#f3ead7' }),
  I('rug_fluffy', 'rug', '白色毛毛地毯', 45, { kind: 'fluffy', a: '#f4f0ea', b: '#e6e0d6', edge: '#d8d0c2' }),
  I('curtain_blue', 'curtain', '蓝色窗帘', 25, { a: '#5d8fc9', b: '#4f7fb8' }),
  I('curtain_cream', 'curtain', '奶白窗帘', 25, { a: '#f3ead7', b: '#e4d8c0' }),
  // 家具
  I('catdesk_white', 'catDesk', '白色书桌', 50, { top: '#f2efe8', left: '#d8d3c8', right: '#c2bcb0', edge: '#ffffff' }),
  I('catdesk_walnut', 'catDesk', '胡桃木书桌', 50, { top: '#6e4a32', left: '#5a3b27', right: '#4a301f', edge: '#8a603f' }),
  I('catpc_crt', 'catPC', '复古大屁股显示器', 45, { kind: 'crt', body: '#d8d0bc', dk: '#b8af98' }),
  I('catpc_pink', 'catPC', '粉色显示器', 40, { kind: 'flat', body: '#f2a6b8', dk: '#d98aa0' }),
  I('jellydesk_coral', 'jellyDesk', '珊瑚粉书桌', 50, { top: '#f4a6a0', left: '#d98a86', right: '#c27470', edge: '#ffc4bd' }),
  I('jellydesk_white', 'jellyDesk', '白色书桌', 50, { top: '#f2efe8', left: '#d8d3c8', right: '#c2bcb0', edge: '#ffffff' }),
  I('jellypc_crt', 'jellyPC', '复古大屁股显示器', 45, { kind: 'crt', body: '#d8d0bc', dk: '#b8af98' }),
  I('jellypc_aqua', 'jellyPC', '海蓝显示器', 40, { kind: 'flat', body: '#5ec4c4', dk: '#3fa3a6' }),
  I('shelf_white', 'shelf', '白色书架', 50, { top: '#f2efe8', left: '#d8d3c8', right: '#c2bcb0', edge: '#ffffff', books: 'normal' }),
  I('shelf_manga', 'shelf', '塞满漫画的书架', 60, { top: '#8a5a38', left: '#74482c', right: '#5e3a24', edge: '#a8744c', books: 'manga' }),
  I('bowls_gold', 'bowls', '金色小碗', 35, { kind: 'ceramic', rim: '#fff3c4', cat: ['#e0b04a', '#b88a30'], jelly: ['#e0b04a', '#b88a30'] }),
  I('catbed_box', 'catBed', '纸箱', 30, { kind: 'box' }),
  I('jellybed_shell', 'jellyBed', '珍珠贝壳床', 55, { kind: 'shell' }),
  I('lamp_mushroom', 'lamp', '蘑菇灯', 40, { kind: 'mushroom', shade: '#e05a6f', glow: '#ffd0c0' }),
  I('plant_cactus', 'plant', '大仙人掌', 30, { kind: 'cactus' }),
  I('plant_sunflower', 'plant', '向日葵', 30, { kind: 'sunflower' }),
  I('clock_cat', 'clock', '猫咪挂钟', 30, { kind: 'cat' }),
  // 装饰
  I('wallL1_vinyl', 'wallL1', '黑胶唱片', 30, { kind: 'vinyl' }),
  I('wallL2_photos', 'wallL2', '拍立得照片', 20, { kind: 'polaroids' }),
  I('wallB1_guitar', 'wallB1', '墙上的吉他', 50, { kind: 'guitar' }),
  I('wallB1_poster', 'wallB1', '演出海报', 30, { kind: 'poster' }),
  I('sill_cactus', 'sill', '小仙人掌', 15, { kind: 'cactusSmall' }),
  I('sill_cat', 'sill', '招财猫', 25, { kind: 'luckycat' }),
  I('cabinet_records', 'cabinetTop', '一摞唱片', 20, { kind: 'records' }),
  I('catdesk_headphones', 'catDeskTop', '监听耳机', 25, { kind: 'headphones' }),
  I('jellytop_flower', 'jellyDeskTop', '小花瓶', 20, { kind: 'flower' }),
  I('shelftop_globe', 'shelfTop', '小地球仪', 25, { kind: 'globe' }),
  I('floorFront_speaker', 'floorFront', '音箱', 40, { kind: 'speaker' }),
  I('floorRight_ukulele', 'floorRight', '尤克里里', 35, { kind: 'ukulele' }),

  // ===== 万圣节 =====
  H('ht_wall', 'wall', '南瓜夜壁纸', 50, { kind: 'bats', a: '#4a3566', b: '#432f5d', backA: '#4f3a6c', backB: '#473463' }),
  H('ht_floor', 'floor', '黑橙格地板', 50, { kind: 'checker', a: '#2c2433', b: '#e07a2e', seam: '#1c1622', hi: '#f0944a' }),
  H('ht_rug', 'rug', '南瓜地毯', 30, { kind: 'pumpkin', a: '#e07a2e', b: '#d06c24', edge: '#3a2a22' }),
  H('ht_curtain', 'curtain', '紫色蛛网窗帘', 20, { a: '#6a4a8a', b: '#5c3f7a', web: true }),
  H('ht_lights', 'lights', '南瓜串灯', 25, { kind: 'pumpkin', colors: ['#ff9a3c', '#b47cff', '#ff9a3c'] }),
  H('ht_bowls', 'bowls', '南瓜碗', 20, { kind: 'pumpkin', rim: '#ffb060', cat: ['#e07a2e', '#b85e1c'], jelly: ['#e07a2e', '#b85e1c'] }),
  H('ht_catbed', 'catBed', '巫师帽猫窝', 35, { kind: 'witch' }),
  H('ht_clock', 'clock', '蝙蝠挂钟', 20, { kind: 'bat' }),
  H('ht_bats', 'wallB1', '一串小蝙蝠', 25, { kind: 'bats' }),
  H('ht_ghostart', 'wallL2', '幽灵挂画', 20, { kind: 'ghostart' }),
  H('ht_web', 'wallL1', '蜘蛛网', 10, { kind: 'web' }),
  H('ht_ghost', 'sill', '窗台小幽灵', 20, { kind: 'ghost' }),
  H('ht_pumpkin', 'cabinetTop', '小南瓜', 10, { kind: 'pumpkinSmall' }),
  H('ht_candle', 'shelfTop', '黑猫蜡烛', 20, { kind: 'candle' }),
  H('ht_hat', 'catDeskTop', '小巫师帽', 10, { kind: 'witchHat' }),
  H('ht_skull', 'jellyDeskTop', '糖果骷髅', 10, { kind: 'skull' }),
  H('ht_jack', 'floorFront', '大南瓜灯', 30, { kind: 'jack' }),
  H('ht_candy', 'floorRight', '糖果桶', 20, { kind: 'candy' }),
];

export const ITEM = Object.fromEntries(ITEMS.map((it) => [it.id, it]));
export const DEFAULTS = Object.fromEntries(ITEMS.filter((it) => it.price === 0).map((it) => [it.slot, it.id]));
// 没有默认款的装饰位（一开始空着）
for (const s of SLOTS) if (!(s.id in DEFAULTS)) DEFAULTS[s.id] = null;

// 把"装备表"（槽位 → 物品 id）变成渲染用的 look 表
export function looksOf(equip) {
  const out = {};
  for (const s of SLOTS) {
    const id = equip && s.id in equip ? equip[s.id] : DEFAULTS[s.id];
    out[s.id] = id && ITEM[id] ? ITEM[id].look : null;
  }
  return out;
}

// 赚金币的规则
export const EARN = {
  login: 10, // 每人每天上线
  together: 10, // 两人当天都上线
  firstMin: 1, firstMax: 3, // 每天每种行动/状态第一次
  welcome: 100, // 小卖部开张礼（两个人一共一次）
};
