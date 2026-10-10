import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import type { ConceptConnector } from "../types";

export type GraphPoint = { x: number; y: number };
export type GraphRect = GraphPoint & { width: number; height: number };
export type GraphNode = GraphRect & { id: string };
export type GraphBridge = { point: GraphPoint; segmentIndex: number; radius: number; distance: number };
export type GraphEdge = { id: string; from: string; to: string; points: GraphPoint[]; label?: GraphRect; length: number; bridges?: GraphBridge[] };
export type ConceptGraphLayout = {
  width: number; height: number; scale: number; offsetX: number; offsetY: number;
  nodes: Record<string, GraphNode>; edges: Record<string, GraphEdge>;
};
export type GraphEdgeInput = ConceptConnector & { labelWidth?: number; labelHeight?: number };

const elk = new ELK();
const layouts = new Map<string, Promise<ConceptGraphLayout>>();
export const connectorId = (connector: ConceptConnector) => `${connector.from}->${connector.to}`;

export function rectsOverlap(left: GraphRect, right: GraphRect, padding = 0): boolean {
  return left.x < right.x + right.width + padding && left.x + left.width + padding > right.x
    && left.y < right.y + right.height + padding && left.y + left.height + padding > right.y;
}

export function segmentCrossesRect(from: GraphPoint, to: GraphPoint, rect: GraphRect, padding = 0): boolean {
  const left = rect.x - padding;
  const right = rect.x + rect.width + padding;
  const top = rect.y - padding;
  const bottom = rect.y + rect.height + padding;
  if (Math.abs(from.y - to.y) < 0.01) return from.y > top && from.y < bottom && Math.max(from.x, to.x) > left && Math.min(from.x, to.x) < right;
  if (Math.abs(from.x - to.x) < 0.01) return from.x > left && from.x < right && Math.max(from.y, to.y) > top && Math.min(from.y, to.y) < bottom;
  throw new Error("原理布局失败：连线必须使用正交路径");
}

function routeCrossings(edges: GraphEdge[]): void {
  for (const edge of edges) edge.bridges = [];
  for (const [edgeIndex, edge] of edges.entries()) for (const other of edges.slice(edgeIndex + 1)) {
    let distance = 0;
    for (let index = 0; index < edge.points.length - 1; index++) {
      const start = edge.points[index]!;
      const end = edge.points[index + 1]!;
      const horizontal = Math.abs(start.y - end.y) < 0.01;
      let otherDistance = 0;
      for (let otherIndex = 0; otherIndex < other.points.length - 1; otherIndex++) {
        const otherStart = other.points[otherIndex]!;
        const otherEnd = other.points[otherIndex + 1]!;
        const otherHorizontal = Math.abs(otherStart.y - otherEnd.y) < 0.01;
        if (horizontal === otherHorizontal) {
          const axis = horizontal ? "x" : "y";
          const fixed = horizontal ? "y" : "x";
          const overlap = Math.min(Math.max(start[axis], end[axis]), Math.max(otherStart[axis], otherEnd[axis]))
            - Math.max(Math.min(start[axis], end[axis]), Math.min(otherStart[axis], otherEnd[axis]));
          if (Math.abs(start[fixed] - otherStart[fixed]) < 0.01 && overlap > 0.01) throw new Error(`连线 ${edge.id} 与 ${other.id} 路径重叠`);
        } else {
          const rowStart = horizontal ? start : otherStart;
          const rowEnd = horizontal ? end : otherEnd;
          const columnStart = horizontal ? otherStart : start;
          const columnEnd = horizontal ? otherEnd : end;
          const point = { x: columnStart.x, y: rowStart.y };
          const rowClearance = Math.min(Math.abs(point.x - rowStart.x), Math.abs(point.x - rowEnd.x));
          const columnClearance = Math.min(Math.abs(point.y - columnStart.y), Math.abs(point.y - columnEnd.y));
          const intersects = point.x > Math.min(rowStart.x, rowEnd.x) && point.x < Math.max(rowStart.x, rowEnd.x)
            && point.y > Math.min(columnStart.y, columnEnd.y) && point.y < Math.max(columnStart.y, columnEnd.y);
          if (intersects) {
            if (Math.min(rowClearance, columnClearance) < 13) throw new Error(`连线 ${edge.id} 与 ${other.id} 交点过于接近转角`);
            const rowEdge = horizontal ? edge : other;
            rowEdge.bridges!.push({ point, segmentIndex: horizontal ? index : otherIndex, radius: 8,
              distance: (horizontal ? distance : otherDistance) + Math.abs(point.x - rowStart.x) });
          }
        }
        otherDistance += Math.hypot(otherEnd.x - otherStart.x, otherEnd.y - otherStart.y);
      }
      distance += Math.hypot(end.x - start.x, end.y - start.y);
    }
  }
  for (const edge of edges) {
    edge.bridges!.sort((left, right) => left.distance - right.distance);
    for (let index = 1; index < edge.bridges!.length; index++) {
      if (edge.bridges![index]!.distance - edge.bridges![index - 1]!.distance < 26) throw new Error(`连线 ${edge.id} 的交点过密`);
    }
  }
}

function validateGeometry(layout: ConceptGraphLayout): void {
  const nodes = Object.values(layout.nodes);
  const edges = Object.values(layout.edges);
  const labels = edges.filter((edge) => edge.label);
  for (const [index, node] of nodes.entries()) {
    if (node.x < 0 || node.y < 0 || node.x + node.width > layout.width || node.y + node.height > layout.height) throw new Error(`卡片 ${node.id} 越界`);
    for (const other of nodes.slice(index + 1)) if (rectsOverlap(node, other, 12)) throw new Error(`卡片 ${node.id} 与 ${other.id} 间距不足`);
  }
  for (const edge of edges) {
    if (edge.length < 12) throw new Error(`连线 ${edge.id} 长度不足`);
    for (const node of nodes.filter((node) => node.id !== edge.from && node.id !== edge.to)) {
      if (edge.points.slice(1).some((point, index) => segmentCrossesRect(edge.points[index]!, point, node, 10))) throw new Error(`连线 ${edge.id} 穿过卡片 ${node.id}`);
    }
    if (edge.label) {
      const label = edge.label;
      if (label.x < 0 || label.y < 0 || label.x + label.width > layout.width || label.y + label.height > layout.height) throw new Error(`标签 ${edge.id} 越界`);
      for (const node of nodes) if (rectsOverlap(label, node, 8)) throw new Error(`标签 ${edge.id} 遮挡卡片 ${node.id}`);
      for (const other of edges.filter((other) => other.id !== edge.id)) {
        if (other.points.slice(1).some((point, index) => segmentCrossesRect(other.points[index]!, point, label, 3))) throw new Error(`标签 ${edge.id} 遮挡连线 ${other.id}`);
      }
    }
  }
  for (const [index, edge] of labels.entries()) for (const other of labels.slice(index + 1)) {
    if (rectsOverlap(edge.label!, other.label!, 8)) throw new Error(`标签 ${edge.id} 与 ${other.id} 重叠`);
  }
  routeCrossings(edges);
  for (const edge of edges) for (const bridge of edge.bridges ?? []) {
    const bounds = { x: bridge.point.x - 13, y: bridge.point.y - 13, width: 26, height: 18 };
    for (const node of nodes) if (rectsOverlap(bounds, node, 2)) throw new Error(`跨线弧 ${edge.id} 遮挡卡片 ${node.id}`);
    for (const label of labels) if (rectsOverlap(bounds, label.label!, 2)) throw new Error(`跨线弧 ${edge.id} 遮挡标签 ${label.id}`);
  }
}

async function buildLayout(nodes: Array<{ id: string; width: number; height: number }>, edges: GraphEdgeInput[], canvasWidth: number, canvasHeight: number): Promise<ConceptGraphLayout> {
  const failures: string[] = [];
  // Prefer the vertical reading order of the video; retry with more space or another direction.
  for (const [direction, spacing] of [["DOWN", 32], ["DOWN", 48], ["DOWN", 64], ["RIGHT", 32]] as const) {
    const graph = await elk.layout<ElkNode>({
      id: "concept",
      layoutOptions: {
        "elk.algorithm": "layered", "elk.direction": direction, "elk.edgeRouting": "ORTHOGONAL",
        "elk.padding": "[top=24,left=24,bottom=24,right=24]",
        "elk.spacing.nodeNode": String(spacing), "elk.spacing.edgeNode": "18", "elk.spacing.edgeEdge": "16",
        "elk.layered.spacing.nodeNodeBetweenLayers": String(spacing),
        "elk.layered.spacing.edgeNodeBetweenLayers": "18", "elk.layered.spacing.edgeEdgeBetweenLayers": "16",
        "elk.layered.mergeEdges": "false", "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
        "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      },
      children: nodes,
      edges: edges.map((edge) => ({
        id: connectorId(edge), sources: [edge.from], targets: [edge.to],
        labels: edge.label ? [{ text: edge.label, width: edge.labelWidth!, height: edge.labelHeight!, layoutOptions: { "elk.edgeLabels.placement": "CENTER", "elk.edgeLabels.inline": "false" } }] : [],
      })),
    });
    const width = graph.width ?? 0;
    const height = graph.height ?? 0;
    if (width <= 0 || height <= 0) throw new Error("原理布局失败：图形尺寸为空");
    const scale = Math.min(1, canvasWidth / width, canvasHeight / height);
    const result: ConceptGraphLayout = {
      width, height, scale, offsetX: (canvasWidth - width * scale) / 2, offsetY: (canvasHeight - height * scale) / 2,
      nodes: Object.fromEntries((graph.children ?? []).map((node) => [node.id, { id: node.id, x: node.x!, y: node.y!, width: node.width!, height: node.height! }])),
      edges: Object.fromEntries((graph.edges ?? []).map((edge) => {
        const input = edges.find((input) => connectorId(input) === edge.id)!;
        if (edge.sections?.length !== 1) throw new Error(`原理布局失败：连线 ${edge.id} 缺少完整路径`);
        const section = edge.sections[0]!;
        const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
        const label = edge.labels?.[0];
        return [edge.id, {
          id: edge.id, from: input.from, to: input.to, points,
          length: points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y), 0),
          label: label ? { x: label.x!, y: label.y!, width: label.width!, height: label.height! } : undefined,
        }];
      })),
    };
    try {
      validateGeometry(result);
      if (scale < 0.8) throw new Error(`图形过密，需要缩小到 ${Math.round(scale * 100)}%，请减少同屏对象`);
      return result;
    } catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
  }
  throw new Error(`原理布局失败：自动调整后仍不合格（${failures.join("；")}）`);
}

export function layoutConceptGraph(nodes: Array<{ id: string; width: number; height: number }>, edges: GraphEdgeInput[], canvasWidth: number, canvasHeight: number): Promise<ConceptGraphLayout> {
  const key = JSON.stringify([nodes, edges, canvasWidth, canvasHeight]);
  const cached = layouts.get(key);
  if (cached) return cached;
  if (layouts.size > 100) layouts.clear();
  const pending = buildLayout(nodes, edges, canvasWidth, canvasHeight);
  layouts.set(key, pending);
  pending.catch(() => layouts.delete(key));
  return pending;
}
