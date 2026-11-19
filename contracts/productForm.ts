// 整机/配件区分器（2026-11-11，罗总实测「液晶电视」搜出防尘罩/连接线/喇叭后立项）
// 问题本质：标题子串匹配下，配件 listing 标题都含整机词（"液晶电视连接线"含"液晶电视"），
// 按销量/严选厂排序后配件反而排前。规则：用户搜整机词 → 配件一律排到整机后面（降级不删除，
// 避免误伤清零）；用户搜的就是配件词（"电视罩""连接线"）→ 原样返回。
// 词典驱动、零 LLM、零 API 成本；误伤代价低（只是排序靠后，不是不展示）。

// 配件/耗材/包装指示词——全部用多字复合词，避开"套/线/膜"等单字误伤整机标题
export const ACCESSORY_WORDS: string[] = [
  // 防护遮盖类
  "防尘罩", "保护罩", "电视罩", "罩子", "罩套", "套罩", "电视套", "保护套", "皮套", "硅胶套", "盖布", "防尘盖",
  // 膜贴类
  "保护膜", "钢化膜", "贴膜", "屏幕膜", "贴纸",
  // 线材类
  "连接线", "数据线", "排线", "充电线", "电源线", "信号线", "音频线", "视频线", "延长线", "转接线", "转接头",
  "端子线", "电子线", "线束", "线缆", "线材", "屏线", "HDMI线", "高清线", "VGA线", "AV线", "光纤线", "音视频线",
  // 连接件/结构件
  "连接器", "接插件", "端子", "胶壳", "针座", "插头",
  // 支架底座类
  "支架", "挂架", "壁挂架", "吊架", "底座",
  // 电子配件/维修件
  "遥控器", "电池", "充电器", "适配器", "主板", "电源板", "逻辑板", "恒流板", "高压板", "驱动板",
  "灯条", "背光条", "喇叭", "扬声器", "天线",
  // 包装耗材类（包装箱不是整机）
  "包装箱", "纸箱", "木箱", "泡沫箱", "珍珠棉", "气泡膜",
  // 通用配件语义
  "配件", "零件", "散件", "维修", "拆机", "替换件", "备用",
  // 同名异物/周边劫持词（"电视机"是"电视机柜/电视机窝"的子串——扩词召回时这些会被当整机捞上来）
  // 注意：用户搜"电视柜"本身时 queryWantsAccessory 命中本表 → 不做整机优先，行为正确
  "电视柜", "电视机柜", "电视机窝", "电视机剧场", "电视机模型", "电视机玩偶", "电视机积木", "电视机盒",
  "电视墙", "电视背景", "电视机架", "故事电视机",
];

// 规格正则：喇叭的阻抗功率（"4欧5瓦"/"8Ω2W"）、排针间距（"41P对41P"）
const ACCESSORY_PATTERNS: RegExp[] = [
  /\d+\s*(?:欧|Ω)\s*\d*\s*(?:瓦|W)\b/i,
  /\d+\s*[Pp]\s*对\s*\d+\s*[Pp]/,
];

// 用户查询词里含配件词 = 人家就是要买配件（"电视罩""液晶排线"），不做整机优先
export function queryWantsAccessory(query: string): boolean {
  const q = query.trim();
  if (!q) return false;
  return ACCESSORY_WORDS.some((w) => q.includes(w)) || ACCESSORY_PATTERNS.some((re) => re.test(q));
}

// 标题看起来像配件/耗材/包装 listing
export function looksLikeAccessory(title: string): boolean {
  if (!title) return false;
  return ACCESSORY_WORDS.some((w) => title.includes(w)) || ACCESSORY_PATTERNS.some((re) => re.test(title));
}

// "keyword+后缀"构成配件复合词（马桶→马桶刷/马桶垫，冰箱→冰箱贴）时的常见后缀字。
// 用途：厂名"XX马桶刷厂"includes("马桶") 是子串事故，不代表这家厂做过马桶本体（V104 缺口雷达修正）。
// 单字后缀只命中"keyword 后紧跟该字"的位置，keyword 本身以这些字开头/结尾不受影响（"水泵厂"对"水泵"安全）。
const ACCESSORY_COMPOUND_SUFFIX = [
  "刷", "垫", "套", "贴", "罩", "膜", "线", "架", "盒", "盖", "座", "圈", "链", "绳", "壳", "布", "柜",
  "泵", "阀", "芯", "枪", "管", "泡沫泵", "水箱", "盖板", "滤芯", "喷枪", "软管", "密封圈", "法兰", "支架",
];

/** blob（厂名/评语/标签）中 keyword 的每次出现是否都是"keyword+配件后缀"的复合词。
 *  全部出现都是复合 → true（该命中不算"做过这款产品"的证据）；只要有一次裸出现 → false。
 *  keyword 未出现时也返回 false（无命中无排除）。 */
export function mentionIsAccessoryCompound(blob: string, keyword: string): boolean {
  const b = blob.toLowerCase();
  const k = keyword.toLowerCase();
  if (!k || !b.includes(k)) return false;
  let idx = b.indexOf(k);
  let sawPlain = false;
  while (idx !== -1) {
    const tail = b.slice(idx + k.length, idx + k.length + 3);
    if (!ACCESSORY_COMPOUND_SUFFIX.some((s) => tail.startsWith(s))) sawPlain = true;
    idx = b.indexOf(k, idx + 1);
  }
  return !sawPlain;
}

// 整机优先的稳定排序：搜整机词时配件沉底；搜配件词时原序不动
export function prioritizeWholeMachines<T extends { title: string }>(query: string, items: T[]): T[] {
  if (queryWantsAccessory(query) || items.length < 2) return items;
  return [...items].sort((a, b) => Number(looksLikeAccessory(a.title)) - Number(looksLikeAccessory(b.title)));
}

// 整机同义词扩词：搜"液晶电视"应同时召回"电视机/智能电视"标题（子串匹配没有语义，靠词表补）
// 只放多字无歧义词——不放裸"电视"（会把"电视柜"家具卷进来）
export const PRODUCT_SYNONYMS: Record<string, string[]> = {
  液晶电视: ["电视机", "智能电视", "平板电视", "LED电视"],
  电视机: ["液晶电视", "智能电视", "平板电视"],
  智能电视: ["电视机", "液晶电视"],
  平板电视: ["电视机", "液晶电视"],
  电冰箱: ["冰箱"],
  冰箱: ["电冰箱", "冰柜"],
};

export function synonymTerms(query: string): string[] {
  const q = query.trim();
  const out = new Set<string>();
  for (const [key, syns] of Object.entries(PRODUCT_SYNONYMS)) {
    if (q.includes(key)) for (const s of syns) out.add(s);
  }
  return [...out];
}
