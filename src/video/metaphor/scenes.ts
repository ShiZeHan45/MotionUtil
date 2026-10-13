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
export type MetaphorStep = { action: ActionCategory; from: string; to: string; say: string };
export type MetaphorScene = {
  id: string;
  name: string;
  actors: MetaphorActor[];
  steps: MetaphorStep[];
};

// Presets are plain data: adding one needs no new code as long as it only uses registered characters and actions.
export const METAPHOR_SCENES: Record<string, MetaphorScene> = {
  translator: {
    id: "translator",
    name: "翻译官",
    actors: [
      { id: "you", character: "person", label: "你的助手", real: "编程助手", at: { x: 0.17, y: 0.2 } },
      { id: "guide", character: "assistant", label: "翻译官", real: "REA 服务", at: { x: 0.5, y: 0.2 } },
      { id: "doc", character: "file", label: "外文文件", real: "没有源码的程序", at: { x: 0.83, y: 0.2 } },
      { id: "machine", character: "gear", label: "整理机", real: "分析引擎", at: { x: 0.5, y: 0.68 } },
    ],
    steps: [
      { action: "send", from: "you", to: "guide", say: "你的助手把问题递给翻译官" },
      { action: "check", from: "guide", to: "doc", say: "翻译官拿放大镜去读这份外文文件" },
      { action: "transform", from: "doc", to: "machine", say: "读到的内容交给整理机，整理成看得懂的结论" },
      { action: "send", from: "machine", to: "you", say: "带着证据的结论送回你手里" },
    ],
  },
  mailroom: {
    id: "mailroom",
    name: "分拣邮局",
    actors: [
      { id: "job", character: "file", label: "一大摞信", real: "一次完整请求", at: { x: 0.14, y: 0.4 } },
      { id: "sorter", character: "server", label: "分拣员", real: "任务调度器", at: { x: 0.5, y: 0.4 } },
      { id: "shelf", character: "box", label: "仓库", real: "结果存储", at: { x: 0.86, y: 0.4 } },
      { id: "owner", character: "person", label: "收件人", real: "你", at: { x: 0.5, y: 0.8 } },
    ],
    steps: [
      { action: "split", from: "job", to: "sorter", say: "一大摞信被分成三小份，同时处理" },
      { action: "store", from: "sorter", to: "shelf", say: "每一份处理完，各自放进仓库" },
      { action: "merge", from: "shelf", to: "owner", say: "最后合成一份交到你手里" },
    ],
  },
  inspector: {
    id: "inspector",
    name: "流水线质检员",
    actors: [
      { id: "code", character: "file", label: "原料", real: "源代码", at: { x: 0.12, y: 0.4 } },
      { id: "line", character: "gear", label: "流水线", real: "构建流程", at: { x: 0.4, y: 0.4 } },
      { id: "qa", character: "assistant", label: "质检员", real: "自动测试", at: { x: 0.64, y: 0.8 } },
      { id: "crate", character: "box", label: "成品箱", real: "发布产物", at: { x: 0.88, y: 0.4 } },
    ],
    steps: [
      { action: "transform", from: "code", to: "line", say: "原料送进流水线，加工成成品" },
      { action: "check", from: "qa", to: "line", say: "质检员逐件检查加工结果" },
      { action: "store", from: "line", to: "crate", say: "合格的成品才放进成品箱" },
    ],
  },
};
