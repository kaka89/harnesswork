/**
 * 单元测试：DocTreePanel
 * 覆盖行为规格：
 *   BH-16 — GET /docs 返回有效 DocEntry[] → 渲染层级树，含状态标签
 *   BH-17 — 点击节点 → onSelect 被调用，参数为对应 path
 *   BH-18 — GET /docs 返回 [] → 显示 data-testid="doc-tree-empty"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@solidjs/testing-library";
import DocTreePanel from "./doc-tree-panel";
import type { DocEntry } from "./doc-tree-panel";

// ---------- fixtures ----------
const MOCK_ENTRIES: DocEntry[] = [
  { path: "product/prd/overview.md", title: "产品概览", type: "prd", status: "approved" },
  { path: "product/prd/detail.md", title: "需求详情", type: "prd", status: "draft" },
  { path: "product/architecture/sdd.md", title: "系统设计", type: "sdd", status: "released" },
  { path: "product/plan/roadmap.md", title: "研发计划", type: "plan", status: "draft" },
];

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

describe("DocTreePanel", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // ─── BH-16：有效文档列表渲染 ─────────────────────────────────────────────
  describe("BH-16: 渲染文档层级树", () => {
    it("根容器带有 data-testid=doc-tree-panel", async () => {
      globalThis.fetch = mockFetch(200, MOCK_ENTRIES);
      const onSelect = vi.fn();
      render(() => <DocTreePanel onSelect={onSelect} />);

      const panel = await screen.findByTestId("doc-tree-panel");
      expect(panel).toBeInTheDocument();
    });

    it("按 type 渲染分组标题（PRD / SDD / PLAN）", async () => {
      globalThis.fetch = mockFetch(200, MOCK_ENTRIES);
      const onSelect = vi.fn();
      render(() => <DocTreePanel onSelect={onSelect} />);

      // 默认展开的分组按钮
      await waitFor(() => {
        expect(screen.getByTestId("doc-group-prd")).toBeInTheDocument();
        expect(screen.getByTestId("doc-group-sdd")).toBeInTheDocument();
        expect(screen.getByTestId("doc-group-plan")).toBeInTheDocument();
      });
    });

    it("每个节点都显示 title 文本", async () => {
      globalThis.fetch = mockFetch(200, MOCK_ENTRIES);
      const onSelect = vi.fn();
      render(() => <DocTreePanel onSelect={onSelect} />);

      await waitFor(() => {
        expect(screen.getByText("产品概览")).toBeInTheDocument();
        expect(screen.getByText("需求详情")).toBeInTheDocument();
        expect(screen.getByText("系统设计")).toBeInTheDocument();
      });
    });

    it("每个节点都显示状态标签（approved / draft / released）", async () => {
      globalThis.fetch = mockFetch(200, MOCK_ENTRIES);
      const onSelect = vi.fn();
      render(() => <DocTreePanel onSelect={onSelect} />);

      await waitFor(() => {
        expect(screen.getByText("approved")).toBeInTheDocument();
        expect(screen.getAllByText("draft").length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText("released")).toBeInTheDocument();
      });
    });
  });

  // ─── BH-17：点击节点调用 onSelect ────────────────────────────────────────
  describe("BH-17: 点击节点调用 onSelect", () => {
    it("点击节点时以 entry.path 调用 onSelect", async () => {
      globalThis.fetch = mockFetch(200, MOCK_ENTRIES);
      const onSelect = vi.fn();
      render(() => <DocTreePanel onSelect={onSelect} />);

      const btn = await screen.findByTestId("doc-entry-product/prd/overview.md");
      fireEvent.click(btn);

      expect(onSelect).toHaveBeenCalledOnce();
      expect(onSelect).toHaveBeenCalledWith("product/prd/overview.md");
    });

    it("点击多个节点时每次传入对应 path", async () => {
      globalThis.fetch = mockFetch(200, MOCK_ENTRIES);
      const onSelect = vi.fn();
      render(() => <DocTreePanel onSelect={onSelect} />);

      const btn1 = await screen.findByTestId("doc-entry-product/prd/overview.md");
      const btn2 = await screen.findByTestId("doc-entry-product/prd/detail.md");

      fireEvent.click(btn1);
      fireEvent.click(btn2);

      expect(onSelect).toHaveBeenCalledTimes(2);
      expect(onSelect).toHaveBeenNthCalledWith(1, "product/prd/overview.md");
      expect(onSelect).toHaveBeenNthCalledWith(2, "product/prd/detail.md");
    });
  });

  // ─── BH-18：空列表显示暂无文档 ────────────────────────────────────────────
  describe("BH-18: 空状态", () => {
    it("GET /docs 返回 [] 时显示 doc-tree-empty", async () => {
      globalThis.fetch = mockFetch(200, []);
      const onSelect = vi.fn();
      render(() => <DocTreePanel onSelect={onSelect} />);

      const empty = await screen.findByTestId("doc-tree-empty");
      expect(empty).toBeInTheDocument();
      expect(empty).toHaveTextContent("暂无文档");
    });
  });

  // ─── 其他：展开 / 折叠 / 错误态 ─────────────────────────────────────────
  describe("展开 / 折叠", () => {
    it("点击分组按钮后收起列表，再点击展开", async () => {
      globalThis.fetch = mockFetch(200, MOCK_ENTRIES);
      const onSelect = vi.fn();
      render(() => <DocTreePanel onSelect={onSelect} />);

      // 初始 prd 默认展开，节点可见
      const prdEntry = await screen.findByTestId("doc-entry-product/prd/overview.md");
      expect(prdEntry).toBeInTheDocument();

      // 点击 prd 分组标题 → 收起
      const groupBtn = screen.getByTestId("doc-group-prd");
      fireEvent.click(groupBtn);
      await waitFor(() => {
        expect(screen.queryByTestId("doc-entry-product/prd/overview.md")).not.toBeInTheDocument();
      });

      // 再次点击 → 展开
      fireEvent.click(groupBtn);
      await waitFor(() => {
        expect(screen.getByTestId("doc-entry-product/prd/overview.md")).toBeInTheDocument();
      });
    });
  });

  describe("错误态", () => {
    it("GET /docs 失败时显示 doc-tree-error", async () => {
      globalThis.fetch = mockFetch(500, null);
      // 让 fetch.ok 为 false
      const onSelect = vi.fn();
      render(() => <DocTreePanel onSelect={onSelect} />);

      const err = await screen.findByTestId("doc-tree-error");
      expect(err).toBeInTheDocument();
      expect(err).toHaveTextContent("加载失败，请重试");
    });
  });
});
