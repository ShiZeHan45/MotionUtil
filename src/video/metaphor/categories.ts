// Closed vocabulary for metaphor animations. A beat is first classified into one of these categories;
// only categories with a renderer in ACTIONS can be drawn, everything else falls back to the card diagram.
// `hint` is shown to the planning model and fixes the meaning of `from` and `to` for each action.
export const ACTION_CATEGORIES = {
  introduce: { zh: "登场", hint: "介绍场景里出现的对象，交代起点（from 和 to 填同一个角色）" },
  send: { zh: "递送", hint: "from 把 payload 包裹送给 to" },
  receive: { zh: "接收", hint: "to 收到 from 送来的东西并回一个确认" },
  transform: { zh: "转换", hint: "from 把 payload 转换成 becomes（换颜色），再交给 to" },
  store: { zh: "存储", hint: "from 把 payload 放进 to（to 是存放处）保存" },
  retrieve: { zh: "读取", hint: "from 是被读的存放处或文件，to 读走一份副本，from 里原件还在" },
  check: { zh: "检查", hint: "from 拿放大镜检查 to，通过后打勾" },
  split: { zh: "拆分", hint: "from 的一份东西被拆成三份，分头交给 to" },
  merge: { zh: "合并", hint: "from 的多份东西合成一份，交给 to" },
  filter: { zh: "过滤", hint: "from 的几份东西经过漏斗，只有 payload 颜色的那份通过，交给 to" },
  route: { zh: "分派", hint: "from 的 payload 经过路牌，按条件被送往 to（不是别的去处）" },
  trigger: { zh: "触发", hint: "from 发出信号让 to 动起来（只传信号，不送包裹）" },
  wait: { zh: "等待", hint: "to 前面有几份东西在排队，等条件满足后轮到第一份（from 是排队的来源）" },
  loop: { zh: "循环", hint: "from 把 payload 交给 to，to 里反复处理多轮直到满足条件" },
  compare: { zh: "比较", hint: "from 的 payload 和 to 的 becomes 放上天平对照" },
  cache: { zh: "缓存", hint: "to 是远处的原始来源，from 第一次从 to 取到后，在自己身边留一份副本" },
  isolate: { zh: "隔离", hint: "from 把 payload 放进 to，to 被围成带锁的独立空间" },
  rollback: { zh: "回退", hint: "from 把 payload 交给 to 后出错，东西被退回 from" },
  stack: { zh: "分层", hint: "to 是由多层叠成的东西，三层依次叠上去（from 是提供这些层的来源）" },
  connect: { zh: "接入", hint: "用一根线把 from 和 to 接起来，接通后亮起" },
  ask: { zh: "提问", hint: "from 向 to 提出一个问题，问号气泡飞过去" },
  create: { zh: "生成", hint: "from 凭空造出一个 becomes 颜色的新东西，出现在 to 那里" },
  other: { zh: "列表外", hint: "以上都不是，退回卡片图并登记缺口" },
} as const;

export type ActionCategory = keyof typeof ACTION_CATEGORIES;
