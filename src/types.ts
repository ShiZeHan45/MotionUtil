export type LeaderboardSource = "github-trending" | "star-history";

export type LeaderboardContext = {
  source: LeaderboardSource;
  period: "weekly";
  sourceUrl: string;
  periodStart: string | null;
  periodEnd: string | null;
};

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
  leaderboard?: LeaderboardContext;
};

export type TrendingSnapshot = {
  capturedAt: string;
  period: "weekly";
  sourceUrl: string;
  repos: TrendingRepo[];
  leaderboard?: LeaderboardContext;
  topN?: number;
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
  visualAssets?: VisualAsset[];
  sources: string[];
};

export type NarrationSegment = {
  scene: "intro" | "problem" | "concept" | "case" | "dashboard" | "setup" | "workflow" | "requirements" | "summary";
  text: string;
  spokenText?: string;
  beatId?: string;
};

export type HookFact = {
  id: string;
  point: string;
  sourceUrl: string;
  sourceExcerpt: string;
  sentenceNumber: number;
  suitable: boolean;
  reason: string;
};

export type OpeningHookCandidate = {
  id: string;
  type: "A" | "B" | "C";
  text: string;
  spokenText?: string;
  factIds: string[];
  payoffBeatIds: string[];
  payoffExplanation: string;
  suitable: boolean;
  reason: string;
};

export type OpeningHookPlan = {
  version: 1;
  targetAudience: string;
  domain: string;
  missingInfo: string[];
  facts: HookFact[];
  candidates: OpeningHookCandidate[];
  selectedId: string;
  selectedReason: string;
  selectedPayoff: { beatId: string; excerpt: string };
};

export type VisualAsset = {
  id: string;
  path: string;
  label: string;
  sourceUrl: string;
};

export type ConceptObjectKind = "problem" | "input" | "agent" | "context" | "system" | "file" | "terminal" | "transform" | "result" | "note";

export type ConceptObject = {
  id: string;
  kind: ConceptObjectKind;
  label: string;
  detail?: string;
  x: number;
  y: number;
};

export type ConceptConnector = {
  from: string;
  to: string;
  label?: string;
};

export type ConceptBeat = {
  id: string;
  cue: string;
  text: string;
  spokenText?: string;
  action: "draw" | "connect" | "group" | "transform" | "highlight" | "result" | "hold";
  voiceShare: number;
  objectIds: string[];
  objects?: ConceptObject[];
  connectors?: ConceptConnector[];
  focusIds?: string[];
};

export type ConceptStoryboard = {
  version: 1;
  title: string;
  summary: string;
  beats: ConceptBeat[];
};

export type StoryboardValidationIssue = {
  code: "missing-object" | "missing-connector" | "orphan-object" | "overlap" | "out-of-bounds" | "invalid-connector" | "weak-sequence";
  beatId?: string;
  objectId?: string;
  message: string;
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
  openingHook?: OpeningHookPlan;
  visualAssets?: VisualAsset[];
  conceptStoryboard?: ConceptStoryboard;
  narrationSegments: NarrationSegment[];
  sources: string[];
  leaderboard?: LeaderboardContext;
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
