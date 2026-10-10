import type { RenderProject } from "../types";

export const openrigStory = [
  { id: "helpers", text: "三个编程助手，一起改一个网站。", action: "appear" },
  { id: "scattered", text: "各守一个终端，工作散在不同地方。", action: "scatter" },
  { id: "team", text: "OpenRig 把它们组织成一个团队。", action: "gather" },
  { id: "whiteboard", text: "共享上下文，就像大家共用的工作白板。", action: "drawBoard" },
  { id: "context", text: "共同目标和工作记录，都放在这里。", action: "remember" },
  { id: "search", text: "比如，要给网站加一个搜索框。", action: "request" },
  { id: "build", text: "写代码的助手登记任务，完成修改。", action: "build" },
  { id: "review", text: "再请另一个助手，检查这次修改。", action: "review" },
  { id: "decision", text: "你查看结果和记录，决定下一步。", action: "inspect" },
  { id: "return", text: "下次回来，原来的助手和工作信息还在。", action: "resume" },
  { id: "outcome", text: "零散的助手，就这样变成持续协作的小队。", action: "overview" },
] as const;

export type OpenRigStoryId = typeof openrigStory[number]["id"];
export type OpenRigStoryProps = {
  project: RenderProject;
  backgroundFrames?: string[];
  backgroundDurationInFrames?: number;
};

// The whiteboard and paper handoff are metaphors, not a fabricated product UI.
export const openrigStorySources = [
  "https://github.com/mvschwarz/openrig",
  "https://github.com/mvschwarz/openrig/blob/main/docs/reference/getting-started.md",
];
