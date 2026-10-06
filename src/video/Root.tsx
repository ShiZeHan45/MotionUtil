import React from "react";
import { Composition } from "remotion";
import type { RenderProject, TrendingRepo } from "../types";
import { durationInFrames, FPS, ProjectVideo, type VideoProps } from "./ProjectVideo";

const sampleProject: RenderProject = {
  repo: "open-source/demo-project",
  rank: 2,
  title: "Demo Project",
  oneLineSummary: "一个用于展示视频模板的演示项目。",
  problem: "演示项目用来预览固定动画版式和信息层级。",
  features: ["结构化数据驱动", "榜单选中转场"],
  audience: "正在预览模板的创作者",
  usage: "将项目资料传入自动化流程后生成视频。",
  exampleScenario: "演示一个每周产出项目介绍视频的自动化流程。",
  exampleFlow: ["读取项目资料", "按模板合成画面", "生成配音并输出视频"],
  exampleResult: "一个项目的结构化讲稿、配音和视频成片。",
  usageSteps: ["读取项目资料", "填写讲解与案例字段", "渲染并检查视频"],
  requirements: ["需要项目资料和本地渲染环境"],
  limitations: ["演示用素材不能替代真实项目截图"],
  sources: ["https://github.com/open-source/demo-project"],
  narrationSegments: [
    { scene: "intro", text: "本周 GitHub Trending 第 2 名，今天介绍 Demo Project。", spokenText: "本周 GitHub Trending 第 2 名，今天介绍 Demo Project。", audio: "", durationMs: 5_000 },
    { scene: "problem", text: "固定内容模板让每条视频讲得清楚、结构一致。", spokenText: "固定内容模板让每条视频讲得清楚、结构一致。", audio: "", durationMs: 7_000 },
    { scene: "concept", text: "项目资料被整理成讲解、案例和操作步骤。", spokenText: "项目资料被整理成讲解、案例和操作步骤。", audio: "", durationMs: 8_000 },
    { scene: "case", text: "例如从一个项目仓库抽取资料，形成一条项目介绍视频。", spokenText: "例如从一个项目仓库抽取资料，形成一条项目介绍视频。", audio: "", durationMs: 8_000 },
    { scene: "dashboard", text: "用实际截图和可验证的结果说明它做了什么。", spokenText: "用实际截图和可验证的结果说明它做了什么。", audio: "", durationMs: 8_000 },
    { scene: "setup", text: "把所需资料、案例和截图按字段填入模板。", spokenText: "把所需资料、案例和截图按字段填入模板。", audio: "", durationMs: 8_000 },
    { scene: "workflow", text: "依次完成文本、配音、动画渲染和检查。", spokenText: "依次完成文本、配音、动画渲染和检查。", audio: "", durationMs: 8_000 },
    { scene: "requirements", text: "关键资料不足时应该显式说明，不补造产品功能或效果。", spokenText: "关键资料不足时应该显式说明，不补造产品功能或效果。", audio: "", durationMs: 8_000 },
    { scene: "summary", text: "每个项目都围绕解释、案例和使用方法展开。", spokenText: "每个项目都围绕解释、案例和使用方法展开。", audio: "", durationMs: 6_000 },
  ],
};

const sampleLeaderboard: TrendingRepo[] = [
  { rank: 1, owner: "sample", name: "alpha", fullName: "sample/alpha", url: "https://github.com/sample/alpha", description: "让复杂任务更易理解", language: "TypeScript", totalStars: 1234, starsThisWeek: 90 },
  { rank: 2, owner: "open-source", name: "demo-project", fullName: "open-source/demo-project", url: "https://github.com/open-source/demo-project", description: "结构化数据驱动的演示项目", language: "TypeScript", totalStars: 5678, starsThisWeek: 240 },
  { rank: 3, owner: "sample", name: "charlie", fullName: "sample/charlie", url: "https://github.com/sample/charlie", description: "自动化常见工作", language: "Python", totalStars: 3333, starsThisWeek: 120 },
  { rank: 4, owner: "sample", name: "delta", fullName: "sample/delta", url: "https://github.com/sample/delta", description: "为团队提供简单工具", language: "Go", totalStars: 2222, starsThisWeek: 80 },
  { rank: 5, owner: "sample", name: "echo", fullName: "sample/echo", url: "https://github.com/sample/echo", description: "清晰展示数据关系", language: "Rust", totalStars: 1111, starsThisWeek: 60 },
];

const defaultProps: VideoProps = { project: sampleProject, leaderboard: sampleLeaderboard };

export const RemotionRoot: React.FC = () => <Composition
  id="ProjectVideo"
  component={ProjectVideo}
  width={1080}
  height={1920}
  fps={FPS}
  durationInFrames={durationInFrames(sampleProject)}
  defaultProps={defaultProps}
  calculateMetadata={({ props }) => ({ durationInFrames: durationInFrames(props.project) })}
/>
