import type { VisualAsset } from "../types";

/** Recognize status and metrics badges, including cached README assets. */
export function isBadgeAsset(asset: Pick<VisualAsset, "label" | "sourceUrl">): boolean {
  let url: URL;
  try { url = new URL(asset.sourceUrl); }
  catch { return false; }
  const hostname = url.hostname.toLowerCase();
  if (/(?:^|\.)(?:shields\.io|badgen\.net|badge\.fury\.io|poser\.pugx\.org)$/u.test(hostname)) return true;
  // Includes custom badges such as AnyPS5's badge-libraries.svg and badge-shaders.svg.
  let pathname = url.pathname;
  try { pathname = decodeURIComponent(pathname); } catch { /* Keep the original path. */ }
  // Common badge endpoints include skills.sh/b/<repo>, not just paths that
  // literally contain the word "badge". Keep these out of evidence panels.
  if (/(?:^|[/_.-])badges?(?:[/_.-]|$)/iu.test(pathname)
    || /\/b\/(?:[^/]+\/){1,2}[^/]+$/iu.test(pathname) && /(?:^|\.)skills\.sh$/iu.test(hostname)) return true;
  return /^(?:npm\s+(?:version|downloads?)|github\s+stars?|build\s+status|coverage|license(?:\s*:\s*.+)?|徽标|徽章)$/iu.test(asset.label.trim());
}

const socialName = "(?:discord|slack|twitter|x|linkedin|facebook|telegram|reddit|github|gitlab|youtube|wechat|weixin|qq)";
const markVariant = "(?:logo|icon|mark|community|light|dark|white|black|color|colour|monochrome|outline|filled)";
const socialLabel = new RegExp(`^${socialName}(?:[\\s_.-]+${markVariant})*$`, "iu");
const socialFilename = new RegExp(`^${socialName}(?:[_.-]+${markVariant})*$`, "iu");

/** Exclude standalone marks without rejecting screenshots or diagrams about those platforms. */
export function isExcludedEvidenceAsset(asset: Pick<VisualAsset, "label" | "sourceUrl">): boolean {
  if (isBadgeAsset(asset)) return true;
  const label = asset.label.trim();
  if (socialLabel.test(label)
    || /^(?:community|join\s+us|图标|头像|标志|商标)$/iu.test(label)
    || /^(?:[\p{L}\p{N}_.-]+\s+){0,4}(?:logo|logomark|wordmark|brandmark|favicon|avatar)(?:\s+(?:light|dark|white|black))?$/iu.test(label)) return true;
  let pathname: string;
  try {
    pathname = new URL(asset.sourceUrl).pathname;
    try { pathname = decodeURIComponent(pathname); } catch { /* Inspect undecoded names. */ }
  } catch { return false; }
  const filename = pathname.split("/").at(-1)?.replace(/\.[^.]+$/u, "") ?? "";
  // Inspect only the filename: a /discord/ folder can contain useful product
  // screenshots, and discord-integration-flow.svg may explain a real workflow.
  return socialFilename.test(filename)
    || /^(?:[\p{L}\p{N}]+[_.-])*(?:logo|logomark|wordmark|brandmark|favicon|avatar|social-icon)(?:[_.-](?:light|dark|white|black|color|colour|monochrome|outline|filled))*$/iu.test(filename);
}
