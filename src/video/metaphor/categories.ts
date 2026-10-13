// Closed vocabulary for metaphor animations. A beat is first classified into one of these categories;
// only categories with a renderer in ACTIONS can be drawn, everything else falls back to the card diagram.
export const ACTION_CATEGORIES = {
  introduce: { zh: "登场", hint: "介绍场景里出现的对象，交代起点（from 和 to 填同一个角色）" },
  send: { zh: "递送", hint: "把东西从 A 送到 B" },
  receive: { zh: "接收", hint: "B 收到并确认" },
  transform: { zh: "转换", hint: "换一种形式或格式" },
  store: { zh: "存储", hint: "放进某处保存" },
  retrieve: { zh: "读取", hint: "从某处取出来" },
  check: { zh: "检查", hint: "核对、验证、审查" },
  split: { zh: "拆分", hint: "一份拆成多份" },
  merge: { zh: "合并", hint: "多份合成一份" },
  filter: { zh: "过滤", hint: "只留下满足条件的" },
  route: { zh: "分派", hint: "按条件送往不同去处" },
  trigger: { zh: "触发", hint: "某件事引发另一件事" },
  wait: { zh: "等待", hint: "排队、等条件满足" },
  loop: { zh: "循环", hint: "重复直到满足条件" },
  compare: { zh: "比较", hint: "两者对照" },
  cache: { zh: "缓存", hint: "留一份近处的副本" },
  isolate: { zh: "隔离", hint: "放进独立的空间" },
  rollback: { zh: "回退", hint: "出错后回到之前的状态" },
  other: { zh: "列表外", hint: "以上都不是，退回卡片图并登记缺口" },
} as const;

export type ActionCategory = keyof typeof ACTION_CATEGORIES;
