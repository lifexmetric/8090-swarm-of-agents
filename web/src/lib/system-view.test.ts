import { describe, expect, it } from "vitest";
import type { Evidence, GraphData, GraphLink, GraphNode } from "./data";
import { buildSystemGraph, getSystemNodeMeta } from "./system-view";

const repoId = "repo_1";

function evidence(filePath: string, detector = "import"): Evidence {
  return {
    filePath,
    lineStart: 1,
    lineEnd: 1,
    snippet: `import from ${filePath}`,
    detector,
    confidenceReason: "test evidence",
  };
}

function node(
  id: string,
  label: string,
  path: string | undefined,
  ev: Evidence[] = [],
  kind: GraphNode["kind"] = "service",
): GraphNode {
  return {
    id,
    label,
    kind,
    domain: "Code",
    whatItIs: label,
    whyItExists: "test",
    owns: [],
    confidence: "confirmed",
    risks: [],
    path,
    repositoryId: repoId,
    scanId: id === "repo" ? "scan_1" : undefined,
    evidence: ev,
  };
}

function link(id: string, source: string, target: string, ev: Evidence[], kind: GraphLink["kind"] = "sync"): GraphLink {
  return {
    id,
    source,
    target,
    kind,
    criticality: id === "critical" ? 5 : 3,
    summary: "test link",
    code: ev[0]?.snippet ?? "",
    codePath: `${ev[0]?.filePath ?? "unknown"}:L1`,
    contract: "test",
    failure: "test",
    risks: [],
    confidence: "confirmed",
    repositoryId: repoId,
    evidence: ev,
  };
}

function sampleGraph(): GraphData {
  return {
    nodes: [
      node("repo", "example/repo", ".", [evidence("package.json", "package-json-name")]),
      node("api", "api", "api/src", [evidence("api/src/index.ts")]),
      node("app", "app", "web/src/app", [evidence("web/src/app/page.tsx")]),
      node("lib", "lib", "web/src/lib", [evidence("web/src/lib/api.ts")]),
      node("axios", "axios", undefined, [], "external"),
    ],
    links: [
      link("app-lib", "app", "lib", [evidence("web/src/app/page.tsx")]),
      link("app-axios", "app", "axios", [evidence("web/src/app/page.tsx")], "package"),
      link("api-lib", "api", "lib", [evidence("api/src/index.ts")]),
    ],
  };
}

function labels(graph: GraphData): string[] {
  return graph.nodes.map((item) => item.label).sort();
}

function hierarchyLabels(graph: GraphData): string[] {
  return graph.nodes
    .filter((item) => item.kind === "folder" || item.kind === "file")
    .map((item) => item.label)
    .sort();
}

describe("buildSystemGraph", () => {
  it("shows only repo-root immediate children", () => {
    const projection = buildSystemGraph(sampleGraph(), { repositoryId: repoId, path: "" });

    expect(hierarchyLabels(projection.graph)).toEqual(["api", "package.json", "web"]);
    expect(projection.graph.nodes.find((item) => item.label === "axios")?.kind).toBe("external");
  });

  it("shows only nested immediate children for a folder", () => {
    const projection = buildSystemGraph(sampleGraph(), { repositoryId: repoId, path: "web/src" });

    expect(hierarchyLabels(projection.graph)).toEqual(["app", "lib"]);
    expect(projection.breadcrumbs.map((crumb) => crumb.label)).toEqual(["example/repo", "web", "src"]);
  });

  it("shows direct files inside folders that have no child folders", () => {
    const projection = buildSystemGraph(sampleGraph(), { repositoryId: repoId, path: "web/src/app" });

    expect(hierarchyLabels(projection.graph)).toEqual(["page.tsx"]);
  });

  it("summarizes file counts instead of making file-only folders look empty", () => {
    const projection = buildSystemGraph(sampleGraph(), { repositoryId: repoId, path: "web/src" });
    const app = projection.graph.nodes.find((item) => item.label === "app");

    expect(app?.owns[0]).toBe("1 file");
  });

  it("aggregates descendant edges between visible folders", () => {
    const projection = buildSystemGraph(sampleGraph(), { repositoryId: repoId, path: "web/src" });
    const edge = projection.graph.links.find((item) =>
      projection.graph.nodes.find((nodeItem) => nodeItem.id === item.source)?.label === "app" &&
      projection.graph.nodes.find((nodeItem) => nodeItem.id === item.target)?.label === "lib"
    );

    expect(edge).toBeDefined();
    expect(edge?.summary).toContain("1 descendant relationship");
  });

  it("shows file-level relationships with boundary nodes", () => {
    const projection = buildSystemGraph(sampleGraph(), { repositoryId: repoId, path: "web/src/app/page.tsx" });

    expect(labels(projection.graph)).toEqual(["axios", "lib", "page.tsx"]);
    expect(projection.graph.links).toHaveLength(2);
    expect(projection.graph.nodes.find((item) => item.label === "page.tsx")?.kind).toBe("file");
  });

  it("uses repo nodes as the workspace entry layer", () => {
    const projection = buildSystemGraph(sampleGraph(), {}, { forceRepositoryLayer: true });
    const repoNode = projection.graph.nodes[0];

    expect(labels(projection.graph)).toEqual(["example/repo"]);
    expect(getSystemNodeMeta(repoNode)?.type).toBe("repo");
    expect(getSystemNodeMeta(repoNode)?.scanId).toBe("scan_1");
  });
});
