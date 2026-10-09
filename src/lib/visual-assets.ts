import type { VisualAsset } from "../types";

/** Keep badges out of new collections, cached runs, and direct Remotion previews. */
export function isBadgeAsset(asset: Pick<VisualAsset, "label" | "sourceUrl">): boolean {
  let url: URL;
  try { url = new URL(asset.sourceUrl); }
  catch { return false; }
  const hostname = url.hostname.toLowerCase();
  if (/(?:^|\.)(?:shields\.io|badgen\.net|badge\.fury\.io|poser\.pugx\.org)$/u.test(hostname)) return true;
  // Includes custom badges such as AnyPS5's badge-libraries.svg and badge-shaders.svg.
  let pathname = url.pathname;
  try { pathname = decodeURIComponent(pathname); } catch { /* Keep the original path. */ }
  if (/(?:^|[/_.-])badges?(?:[/_.-]|$)/iu.test(pathname)) return true;
  return /^(?:npm\s+(?:version|downloads?)|github\s+stars?|build\s+status|coverage|license(?:\s*:\s*.+)?|徽标|徽章)$/iu.test(asset.label.trim());
}
