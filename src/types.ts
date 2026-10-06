export type TrendingRepo = {
  rank: number;
  owner: string;
  name: string;
  fullName: string;
  url: string;
  description: string;
  language: string | null;
  totalStars: number | null;
  starsThisWeek: number | null;
};

export type TrendingSnapshot = {
  capturedAt: string;
  period: "weekly";
  sourceUrl: string;
  repos: TrendingRepo[];
};

export type RepoFacts = TrendingRepo & {
  fetchedAt: string;
  apiUrl: string;
  homepage: string | null;
  topics: string[];
  license: { spdxId: string | null; name: string | null } | null;
  defaultBranch: string;
  updatedAt: string;
  readme: { sourceUrl: string; text: string } | null;
  sources: string[];
};

export type NarrationSegment = {
  scene: "intro" | "problem" | "concept" | "case" | "dashboard" | "setup" | "workflow" | "requirements" | "summary";
  text: string;
  spokenText?: string;
};

export type VisualAsset = {
  id: string;
  path: string;
  label: string;
  sourceUrl: string;
};

export type ProjectScript = {
  repo: string;
  rank: number;
  title: string;
  oneLineSummary: string;
  problem: string;
  features: string[];
  audience: string;
  usage: string;
  exampleScenario: string;
  exampleFlow: string[];
  exampleResult: string;
  usageSteps: string[];
  requirements: string[];
  limitations: string[];
  visualAssets?: VisualAsset[];
  narrationSegments: NarrationSegment[];
  sources: string[];
};

export type RenderProject = Omit<ProjectScript, "narrationSegments"> & {
  narrationSegments: Array<NarrationSegment & { audio: string; durationMs: number; spokenText: string }>;
};

export type RunPaths = {
  root: string;
  trending: string;
  repos: string;
  scripts: string;
  audio: string;
  renderInput: string;
};
