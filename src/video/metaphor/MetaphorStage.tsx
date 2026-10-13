import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { TextBlock, textLayout, LayoutGuard, VIDEO_FONT } from "../text-layout";
import { ActionLayer, type Point } from "./actions";
import { Character } from "./characters";
import { palette, SHADOW, SIZES, STAGE } from "./style";
import type { MetaphorActor, MetaphorScene } from "./scenes";

const STAGE_WIDTH = STAGE.width;
const STAGE_HEIGHT = STAGE.height;
const ACTOR_AREA = STAGE.actorArea;
const ACTOR_SIZE = SIZES.actor;
const clamp = (value: number) => Math.min(1, Math.max(0, value));

function ActorTag({ actor, name }: { actor: MetaphorActor; name: string }) {
  return <div data-text-region={name} style={{ position: "absolute", left: actor.at.x * STAGE_WIDTH - 130, top: actor.at.y * ACTOR_AREA + ACTOR_SIZE / 2 + 4, width: 260, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
    <TextBlock layout={textLayout(actor.label, 252, 44, 34, 24, 900)} name={`${name} 比喻`} style={{ color: palette.ink, textAlign: "center", fontWeight: 900 }} />
    <div style={{ borderRadius: 99, padding: "2px 10px", background: palette.mint, border: `3px solid ${palette.ink}` }}>
      <TextBlock layout={textLayout(`＝ ${actor.real}`, 224, 36, 24, 18, 800)} name={`${name} 对应`} style={{ color: palette.teal, textAlign: "center", fontWeight: 800 }} />
    </div>
  </div>;
}

/** Draws one metaphor scene. `progress` (0–1) overrides the timeline so stills can be rendered at any moment. */
export function MetaphorStage({ scene, progress, durationFrames }: { scene: MetaphorScene; progress?: number; durationFrames?: number }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const total = scene.steps.length;
  const p = clamp(progress ?? frame / Math.max(1, (durationFrames ?? durationInFrames) - 1));
  const position = Math.min(total - 0.0001, p * total);
  const stepIndex = Math.floor(position);
  const t = position - stepIndex;
  const step = scene.steps[stepIndex]!;
  const byId = new Map(scene.actors.map((actor) => [actor.id, actor]));
  const centre = (id: string): Point => { const actor = byId.get(id)!; return { x: actor.at.x * STAGE_WIDTH, y: actor.at.y * ACTOR_AREA }; };
  const firstStep = (id: string) => Math.max(0, scene.steps.findIndex((item) => item.from === id || item.to === id));
  return <div style={{ position: "relative", width: STAGE_WIDTH, height: STAGE_HEIGHT, fontFamily: VIDEO_FONT }}>
    <div style={{ position: "absolute", left: 0, top: 0, width: STAGE_WIDTH, height: ACTOR_AREA + 70, borderRadius: 40, background: SHADOW.panelFill, border: `4px solid ${palette.ink}`, boxShadow: SHADOW.panel }} />
    {scene.actors.map((actor) => {
      const appear = firstStep(actor.id);
      const shown = stepIndex > appear ? 1 : stepIndex < appear ? 0 : interpolate(t, [0, 0.18], [0, 1], { extrapolateRight: "clamp" });
      if (shown <= 0) return null;
      const focus = step.from === actor.id || step.to === actor.id;
      return <React.Fragment key={actor.id}>
        <div style={{ position: "absolute", left: actor.at.x * STAGE_WIDTH - ACTOR_SIZE / 2, top: actor.at.y * ACTOR_AREA - ACTOR_SIZE / 2, width: ACTOR_SIZE, height: ACTOR_SIZE, opacity: shown, transform: `scale(${0.7 + 0.3 * shown}) translateY(${focus ? -6 : 0}px)` }}>
          <Character id={actor.character} size={ACTOR_SIZE} rotate={actor.character === "gear" && focus ? t * 360 : 0} />
        </div>
        <div style={{ opacity: shown }}><ActorTag actor={actor} name={`比喻 ${actor.id}`} /></div>
      </React.Fragment>;
    })}
    <ActionLayer category={step.action} from={centre(step.from)} to={centre(step.to)} t={t} />
    <div data-text-region="比喻说明" style={{ position: "absolute", left: 0, right: 0, bottom: 0, minHeight: 92, padding: "14px 24px", boxSizing: "border-box", borderRadius: 26, border: `4px solid ${palette.ink}`, background: palette.cream, display: "flex", justifyContent: "center", alignItems: "center", boxShadow: SHADOW.caption }}>
      <TextBlock layout={textLayout(`${stepIndex + 1}/${total}  ${step.say}`, 880, 64, 34, 26, 900)} name="比喻说明" style={{ color: palette.ink, textAlign: "center", fontWeight: 900 }} />
    </div>
  </div>;
}

export const MetaphorSceneDemo: React.FC<{ sceneId?: string; scenes: Record<string, MetaphorScene> }> = ({ sceneId = "translator", scenes }) => {
  const scene = scenes[sceneId] ?? Object.values(scenes)[0]!;
  return <AbsoluteFill style={{ background: palette.paper, fontFamily: VIDEO_FONT }}><LayoutGuard>
    <div style={{ position: "absolute", top: 150, left: 70, right: 70, textAlign: "center", fontSize: 54, fontWeight: 950, color: palette.ink }}>可以把它想成：{scene.name}</div>
    <div style={{ position: "absolute", top: 320, left: 70 }}><MetaphorStage scene={scene} /></div>
  </LayoutGuard></AbsoluteFill>;
};
