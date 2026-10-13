import React from "react";
import { AbsoluteFill } from "remotion";
import { LayoutGuard, TextBlock, textLayout, VIDEO_FONT } from "../text-layout";
import { ACTIONS, ActionLayer } from "./actions";
import { ACTION_CATEGORIES, type ActionCategory } from "./categories";
import { CHARACTERS, Character, palette, type CharacterId } from "./characters";

const implemented = (Object.keys(ACTIONS) as ActionCategory[]);

function Heading({ children }: { children: string }) {
  return <div style={{ margin: "26px 0 12px", fontSize: 38, fontWeight: 950, color: palette.ink }}>{children}</div>;
}

/** Catalogue page: every character, every drawable action, and the closed list of categories. Used as a visual regression check. */
export const MetaphorGallery: React.FC<{ progress?: number }> = ({ progress = 0.55 }) => (
  <AbsoluteFill style={{ background: palette.paper, fontFamily: VIDEO_FONT }}><LayoutGuard>
  <div style={{ position: "absolute", inset: 0, padding: "70px 60px" }}>
    <div style={{ fontSize: 56, fontWeight: 950, color: palette.ink }}>比喻动画图鉴</div>
    <Heading>角色</Heading>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
      {(Object.keys(CHARACTERS) as CharacterId[]).map((id) => <div key={id} data-text-region={`角色 ${id}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: 10, borderRadius: 22, border: `3px solid ${palette.ink}`, background: palette.cream }}>
        <Character id={id} size={120} />
        <TextBlock layout={textLayout(`${CHARACTERS[id].zh}（${id}）`, 200, 34, 24, 18, 800)} name={`角色名 ${id}`} style={{ color: palette.ink, textAlign: "center", fontWeight: 800 }} />
      </div>)}
    </div>
    <Heading>动作（已实现）</Heading>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
      {implemented.map((category) => <div key={category} data-text-region={`动作 ${category}`} style={{ position: "relative", height: 210, borderRadius: 22, border: `3px solid ${palette.ink}`, background: palette.cream, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: 470, height: 210, transform: "scale(.5)", transformOrigin: "0 0" }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: 940, height: 420 }}>
            <ActionLayer category={category} from={{ x: 150, y: 250 }} to={{ x: 760, y: 250 }} t={progress} />
            <div style={{ position: "absolute", left: 150 - 20, top: 250 - 20, width: 40, height: 40, borderRadius: "50%", background: palette.tealLight, border: `5px solid ${palette.ink}` }} />
            <div style={{ position: "absolute", left: 760 - 20, top: 250 - 20, width: 40, height: 40, borderRadius: "50%", background: palette.coral, border: `5px solid ${palette.ink}` }} />
          </div>
        </div>
        <div style={{ position: "absolute", left: 14, top: 8 }}><TextBlock layout={textLayout(`${ACTION_CATEGORIES[category].zh}（${category}）`, 300, 34, 26, 20, 900)} name={`动作名 ${category}`} style={{ color: palette.ink, fontWeight: 900 }} /></div>
      </div>)}
    </div>
    <Heading>动作类别（封闭列表）</Heading>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
      {(Object.keys(ACTION_CATEGORIES) as ActionCategory[]).map((category) => <div key={category} data-text-region={`类别 ${category}`} style={{ padding: "8px 12px", borderRadius: 16, border: `3px solid ${palette.ink}`, background: category in ACTIONS ? palette.mint : "#fff", opacity: category in ACTIONS ? 1 : 0.7 }}>
        <TextBlock layout={textLayout(`${category in ACTIONS ? "✓" : "·"} ${ACTION_CATEGORIES[category].zh}`, 280, 32, 24, 18, 800)} name={`类别名 ${category}`} style={{ color: palette.ink, fontWeight: 800 }} />
      </div>)}
    </div>
  </div></LayoutGuard></AbsoluteFill>
);
