import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";
import type { ProjectScript, RenderProject, TrendingSnapshot } from "../src/types";
import { framesForMs } from "../src/video/ProjectVideo";
import { wrapText } from "../src/video/text-layout";

const latest = JSON.parse(await readFile("output/latest-run.json", "utf8")) as {runId:string};
const root = path.resolve("output", latest.runId);
const output = path.join(root, "layout-check");
await mkdir(output, {recursive:true});
const snapshot = JSON.parse(await readFile(path.join(root,"trending.json"),"utf8")) as TrendingSnapshot;
const current = (JSON.parse(await readFile(path.join(root,"renders/render-input.json"),"utf8")) as RenderProject[])[0]!;
const fixtureDirectory = process.argv[2] ?? path.join(root, "scripts");
const scripts = JSON.parse(await readFile(path.join(fixtureDirectory,"index.json"),"utf8")) as ProjectScript[];
const silent = (script: ProjectScript): RenderProject => ({...script,visualAssets:[],narrationSegments:script.narrationSegments.map(segment=>({...segment,audio:"",spokenText:segment.spokenText??segment.text,durationMs:20_000}))});
const chinese = "先准备目标文件，再检查运行结果，保留完整说明。";
const command = "npx example-tool --input ./some-very-long-path/file.json --output ./results --verbose";
const url = "https://example.com/this-is-a-very-long-path/with-query?feature=full&mode=preview";
const normalize = (text:string) => text.replace(/\s/gu, "");
for (const value of [chinese.repeat(10),command,url,"a".repeat(150),"多行标签\n第二行\n第三行"]) {
  const lines = wrapText(value,24,s=>Array.from(s).length);
  assert.equal(normalize(lines.join("")),normalize(value));
  assert(lines.every(line=>Array.from(line).length<=24));
}
const stress: RenderProject = silent({...scripts[0]!,
  title: "very-long-organization-name/very-long-repository-name-with-cli-and-configuration",
  problem:chinese.repeat(12),
  oneLineSummary:chinese.repeat(6),
  features:[chinese.repeat(5), command.repeat(2),url],
  exampleScenario:chinese.repeat(10),exampleFlow:[command.repeat(2),url,chinese.repeat(6)],
  exampleResult:chinese.repeat(8),usage:command.repeat(2),
  usageSteps:[command.repeat(2),url,chinese.repeat(7)],
  requirements:[chinese.repeat(5),command,url,chinese.repeat(3)],
  limitations:[chinese.repeat(6),command,url],
  narrationSegments:scripts[0]!.narrationSegments.map(segment=>({...segment,text:`${chinese}${command} ${url} ${"longRepositoryName".repeat(8)}`})),
});
const fixtures = [current, ...scripts.map(silent), stress];
const serveUrl = await bundle({entryPoint:path.resolve("src/video/index.tsx"),publicDir:path.resolve("public")});
const browser = await openBrowser("chrome");
type Entry = {name:string; text:string; shown:string; pages:number; page:number; fontSize:string; error?:string};
const results: Array<{fixture:number;scene:string;progress:number;entries:Entry[]}> = [];
const createPage = browser.newPage.bind(browser);
let active = {fixture:0,scene:"",progress:0};
browser.newPage = async (...args) => {
  const page = await createPage(...args);
  const close = page.close.bind(page);
  page.close = async (...closeArgs) => {
    try {
      const entries = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>("[data-core-text]")).map(el => ({
        name:el.dataset.coreText!,text:el.dataset.fullText!,shown:el.innerText,pages:Number(el.dataset.pageCount),page:Number(el.dataset.pageIndex),fontSize:getComputedStyle(el).fontSize,
        ...(el.scrollHeight>el.clientHeight+1||el.scrollWidth>el.clientWidth+1?{error:"overflow",scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight}:{}),
      })));
      if(entries.length) results.push({...active,entries});
    } finally { await close(...closeArgs); }
  };
  return page;
};
try {
  for (const [fixture,project] of fixtures.entries()) {
    const leaderboard = fixture===fixtures.length-1 ? snapshot.repos.slice(0,5).map(repo=>({...repo,fullName:stress.title,description:chinese.repeat(12)})) : snapshot.repos;
    const props={project,leaderboard};
    const composition=await selectComposition({serveUrl,id:"ProjectVideo",inputProps:props,puppeteerInstance:browser});
    let start=0;
    for (const segment of project.narrationSegments) {
      const frames=framesForMs(segment.durationMs);
      const positions=fixture===fixtures.length-1 ? Array.from({length:24},(_,i)=>i/23) : [.04,.5,.99];
      for(const progress of positions) {
        active={fixture,scene:segment.scene,progress};
        const filename=progress===.5||progress===.99 ? path.join(output,`${fixture}-${segment.scene}-${progress}.png`) : null;
        await renderStill({serveUrl,composition,inputProps:props,puppeteerInstance:browser,frame:start+Math.min(frames-1,Math.floor(frames*progress)),output:filename,imageFormat:"png",scale:.5});
      }
      start+=frames;
    }
    console.log(`Layout checked: ${fixture+1}/${fixtures.length} ${project.repo}`);
  }
  assert(results.length>100,"DOM audit did not capture frames");
  const overflow=results.flatMap(result=>result.entries.filter(entry=>entry.error));
  assert.deepEqual(overflow,[]);
  const pages = new Map<string, {count:number;seen:Set<number>;text:string;shown:Map<number,string>}>();
  for(const result of results.filter(result=>result.fixture===fixtures.length-1)) for(const entry of result.entries) {
    const key=`${result.scene}/${entry.name}/${entry.text}`;
    const value=pages.get(key)??{count:entry.pages,seen:new Set<number>(),text:entry.text,shown:new Map<number,string>()};
    value.seen.add(entry.page);value.shown.set(entry.page,entry.shown);pages.set(key,value);
  }
  for(const [key,value] of pages) {
    assert.equal(value.seen.size,value.count,`Missing text page: ${key}`);
    const joined=[...value.shown.entries()].sort(([a],[b])=>a-b).map(([,shown])=>shown).join("");
    assert.equal(normalize(joined),normalize(value.text),`Text was lost: ${key}`);
  }
  await writeFile(path.join(output,"report.json"),JSON.stringify({frames:results.length,overflow:overflow.length,checkedTextPages:pages.size,results},null,2));
  console.log(`PASS: ${results.length} frames, zero text overflow; ${pages.size} stress text fields retain all content. ${output}`);
} finally { await browser.close({silent:true}); }
