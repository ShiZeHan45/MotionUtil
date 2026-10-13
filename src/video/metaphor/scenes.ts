import type { ActionCategory } from "./categories";
import type { CharacterId } from "./characters";

export type MetaphorActor = {
  id: string;
  character: CharacterId;
  /** What the cartoon is called in the metaphor. */
  label: string;
  /** The real object it stands for; shown on screen so the viewer sees both sides of the comparison. */
  real: string;
  /** Centre position as a fraction of the stage. */
  at: { x: number; y: number };
};
export type MetaphorStep = { action: ActionCategory; from: string; to: string; say: string; payload?: string; payloadLabel?: string; becomes?: string; becomesLabel?: string };
export type MetaphorScene = {
  id: string;
  name: string;
  actors: MetaphorActor[];
  steps: MetaphorStep[];
};

const T1 = { x: 0.17, y: 0.2 }, T2 = { x: 0.5, y: 0.2 }, T3 = { x: 0.83, y: 0.2 };
const B1 = { x: 0.17, y: 0.72 }, B2 = { x: 0.5, y: 0.72 }, B3 = { x: 0.83, y: 0.72 };

// Presets are plain data: adding one needs no new code as long as it only uses registered characters and actions.
// They double as visual regression samples and as worked examples for the planning model.
export const METAPHOR_SCENES: Record<string, MetaphorScene> = {
  translator: {
    id: "translator", name: "翻译官",
    actors: [
      { id: "you", character: "person", label: "你的助手", real: "编程助手", at: T1 },
      { id: "guide", character: "assistant", label: "翻译官", real: "分析服务", at: T2 },
      { id: "doc", character: "file", label: "外文文件", real: "没有源码的程序", at: T3 },
      { id: "machine", character: "gear", label: "整理机", real: "分析引擎", at: B2 },
    ],
    steps: [
      { action: "ask", from: "you", to: "guide", say: "你的助手向翻译官提问", payload: "teal" },
      { action: "retrieve", from: "doc", to: "guide", say: "翻译官读了一份外文文件", payload: "yellow", payloadLabel: "原文" },
      { action: "transform", from: "machine", to: "guide", say: "整理机把原文译成人话", payload: "yellow", payloadLabel: "原文", becomes: "teal", becomesLabel: "译文" },
      { action: "send", from: "guide", to: "you", say: "翻译官把译文送回你手里", payload: "teal", payloadLabel: "译文" },
    ],
  },
  mailroom: {
    id: "mailroom", name: "分拣邮局",
    actors: [
      { id: "job", character: "file", label: "一大摞信", real: "一次完整请求", at: { x: 0.14, y: 0.4 } },
      { id: "sorter", character: "server", label: "分拣员", real: "任务调度器", at: { x: 0.5, y: 0.4 } },
      { id: "shelf", character: "box", label: "仓库", real: "结果存储", at: { x: 0.86, y: 0.4 } },
      { id: "owner", character: "person", label: "收件人", real: "你", at: { x: 0.5, y: 0.8 } },
    ],
    steps: [
      { action: "split", from: "job", to: "sorter", say: "一大摞信被分成三小份", payload: "yellow", payloadLabel: "整摞信" },
      { action: "store", from: "sorter", to: "shelf", say: "每一份处理完放进仓库", payload: "yellow" },
      { action: "merge", from: "shelf", to: "owner", say: "最后合成一份交到你手里", payload: "yellow", payloadLabel: "合成件" },
    ],
  },
  inspector: {
    id: "inspector", name: "流水线质检员",
    actors: [
      { id: "code", character: "file", label: "原料", real: "源代码", at: { x: 0.12, y: 0.4 } },
      { id: "line", character: "gear", label: "流水线", real: "构建流程", at: { x: 0.4, y: 0.4 } },
      { id: "qa", character: "assistant", label: "质检员", real: "自动测试", at: { x: 0.64, y: 0.8 } },
      { id: "crate", character: "box", label: "成品箱", real: "发布产物", at: { x: 0.88, y: 0.4 } },
    ],
    steps: [
      { action: "send", from: "code", to: "line", say: "原料送上流水线", payload: "yellow", payloadLabel: "原料" },
      { action: "transform", from: "line", to: "crate", say: "流水线加工成成品装箱", payload: "yellow", payloadLabel: "原料", becomes: "teal", becomesLabel: "成品" },
      { action: "check", from: "qa", to: "crate", say: "质检员检查箱里的成品" },
    ],
  },
  library: {
    id: "library", name: "图书馆查书",
    actors: [
      { id: "reader", character: "person", label: "读者", real: "用户", at: T1 },
      { id: "keeper", character: "assistant", label: "管理员", real: "检索服务", at: T2 },
      { id: "catalog", character: "book", label: "目录", real: "文档索引", at: T3 },
      { id: "stacks", character: "database", label: "书库", real: "资料库", at: B3 },
    ],
    steps: [
      { action: "ask", from: "reader", to: "keeper", say: "读者向管理员问一本书", payload: "coral", payloadLabel: "书名" },
      { action: "retrieve", from: "catalog", to: "keeper", say: "管理员翻目录找到位置", payload: "teal", payloadLabel: "位置" },
      { action: "retrieve", from: "stacks", to: "keeper", say: "按位置去书库取书", payload: "yellow", payloadLabel: "书" },
      { action: "send", from: "keeper", to: "reader", say: "把书交到读者手里", payload: "yellow", payloadLabel: "书" },
    ],
  },
  checkpoint: {
    id: "checkpoint", name: "安检与隔离间",
    actors: [
      { id: "visitors", character: "folder", label: "来访者", real: "外部请求", at: T1 },
      { id: "hall", character: "server", label: "大厅", real: "主服务", at: T3 },
      { id: "room", character: "box", label: "隔离间", real: "沙箱", at: B3 },
    ],
    steps: [
      { action: "filter", from: "visitors", to: "hall", say: "安检只放行合格的来访者", payload: "teal", payloadLabel: "合格请求" },
      { action: "isolate", from: "hall", to: "room", say: "请进带锁的隔离间处理", payload: "teal", payloadLabel: "合格请求" },
      { action: "rollback", from: "hall", to: "room", say: "出问题就整体退回大厅", payload: "teal", payloadLabel: "合格请求" },
    ],
  },
  layers: {
    id: "layers", name: "分层便当盒",
    actors: [
      { id: "file", character: "folder", label: "素材夹", real: "PSD 文件", at: T1 },
      { id: "editor", character: "browser", label: "编辑器", real: "修图软件", at: T2 },
      { id: "canvas", character: "image", label: "画布", real: "图层", at: T3 },
      { id: "out", character: "box", label: "成品盒", real: "导出文件", at: B3 },
    ],
    steps: [
      { action: "send", from: "file", to: "editor", say: "素材夹送进编辑器", payload: "yellow", payloadLabel: "PSD" },
      { action: "stack", from: "editor", to: "canvas", say: "画布里一层一层叠出来", payload: "yellow", payloadLabel: "三个图层" },
      { action: "store", from: "canvas", to: "out", say: "叠好后存进成品盒", payload: "teal", payloadLabel: "成品" },
    ],
  },
  relay: {
    id: "relay", name: "接力信使",
    actors: [
      { id: "helper", character: "assistant", label: "你的助手", real: "编程助手", at: T1 },
      { id: "desk", character: "toolbox", label: "前台", real: "接口", at: T2 },
      { id: "worker", character: "server", label: "后勤", real: "后台服务", at: T3 },
      { id: "tool", character: "terminal", label: "专用工具", real: "外部工具", at: B3 },
      { id: "target", character: "file", label: "待查文件", real: "目标程序", at: B1 },
    ],
    steps: [
      { action: "send", from: "helper", to: "desk", say: "助手把问题交给前台", payload: "teal", payloadLabel: "问题" },
      { action: "send", from: "desk", to: "worker", say: "前台原样转给后勤", payload: "teal", payloadLabel: "问题" },
      { action: "transform", from: "worker", to: "tool", say: "后勤把问题改写成指令", payload: "teal", payloadLabel: "问题", becomes: "yellow", becomesLabel: "指令" },
      { action: "retrieve", from: "target", to: "tool", say: "专用工具读取待查文件", payload: "coral", payloadLabel: "文件内容" },
    ],
  },
  counter: {
    id: "counter", name: "叫号窗口",
    actors: [
      { id: "crowd", character: "person", label: "排队的人", real: "待处理请求", at: T1 },
      { id: "window", character: "server", label: "叫号机", real: "队列", at: T2 },
      { id: "clerk", character: "assistant", label: "办事员", real: "工作进程", at: T3 },
      { id: "desk", character: "gear", label: "审核台", real: "校验步骤", at: B3 },
    ],
    steps: [
      { action: "wait", from: "crowd", to: "window", say: "请求在窗口前排队", payload: "yellow", payloadLabel: "排队中" },
      { action: "trigger", from: "window", to: "clerk", say: "叫号机叫醒办事员" },
      { action: "loop", from: "clerk", to: "desk", say: "审核台反复核对到通过", payload: "yellow", payloadLabel: "待核对" },
    ],
  },
  hotline: {
    id: "hotline", name: "接线与生图",
    actors: [
      { id: "terminal", character: "terminal", label: "你的终端", real: "命令行", at: T1 },
      { id: "cloud", character: "cloud", label: "云端工坊", real: "云端服务", at: T3 },
      { id: "gallery", character: "image", label: "相册", real: "生成结果", at: B3 },
    ],
    steps: [
      { action: "connect", from: "terminal", to: "cloud", say: "先把终端和云端接通" },
      { action: "ask", from: "terminal", to: "cloud", say: "终端向云端提出要求", payload: "coral", payloadLabel: "要求" },
      { action: "create", from: "cloud", to: "gallery", say: "云端画出一张新图", payload: "coral", becomes: "teal", becomesLabel: "新图" },
      { action: "receive", from: "gallery", to: "terminal", say: "终端收到图片并确认", payload: "teal", payloadLabel: "新图" },
    ],
  },
  drawer: {
    id: "drawer", name: "抽屉里的副本",
    actors: [
      { id: "page", character: "browser", label: "你的网页", real: "客户端", at: T1 },
      { id: "origin", character: "cloud", label: "远方仓库", real: "远程服务", at: T3 },
    ],
    steps: [
      { action: "cache", from: "page", to: "origin", say: "第一次远程取，留一份在手边", payload: "yellow", payloadLabel: "数据" },
      { action: "compare", from: "page", to: "origin", say: "手边副本和远方原件对一对", payload: "yellow", payloadLabel: "副本", becomes: "yellow", becomesLabel: "原件" },
    ],
  },
};
