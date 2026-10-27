import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

export function safeJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    if (error instanceof SyntaxError) {
      // Models sometimes append stray closing brackets after a complete object; keep the complete part
      const trailing = error.message.match(/non-whitespace character after JSON at position (\d+)/);
      if (trailing) {
        const end = parseInt(trailing[1]!, 10);
        if (/^[\s\]}]*$/.test(trimmed.slice(end))) return JSON.parse(trimmed.slice(0, end));
      }
      // Extract context around the error position for debugging
      const match = error.message.match(/position (\d+)/);
      if (match) {
        const position = parseInt(match[1]!, 10);
        const start = Math.max(0, position - 100);
        const end = Math.min(trimmed.length, position + 100);
        const context = trimmed.slice(start, end);
        const pointer = " ".repeat(Math.min(100, position - start)) + "^";
        throw new SyntaxError(`${error.message}\n\n上下文:\n${context}\n${pointer}`);
      }
    }
    throw error;
  }
}
