/**
 * 单元测试：DocViewerPanel
 * 覆盖行为规格：
 *   BH-19 — 有效 path → GET /docs/:path 返回 Markdown → 内容渲染到 DOM
 *   BH-20 — GET /docs/:path 返回 404 → data-testid="doc-viewer-not-found"
 *   BH-21 — GET /docs/:path 返回 403/500 → data-testid="doc-viewer-error"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@solidjs/testing-library";
import DocViewerPanel from "./doc-viewer-panel";

// ─── mock DOMPurify（happy-dom 无原生 DOMPurify，返回原始值即可）─────────────
vi.mock("dompurify", () => ({
  default: {
    sanitize: (input: string) => input,
  },
}));

function mockFetch(status: number, text: string) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
  });
}

describe("DocViewerPanel", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // ─── 初始状态：path 为空 ──────────────────────────────────────────────────
  it("path 为空时显示引导提示", () => {
    render(() => <DocViewerPanel path="" />);
    expect(screen.getByText("请选择左侧文档")).toBeInTheDocument();
  });

  it("根容器带有 data-testid=doc-viewer-panel", () => {
    render(() => <DocViewerPanel path="" />);
    expect(screen.getByTestId("doc-viewer-panel")).toBeInTheDocument();
  });

  // ─── BH-19：成功渲染 Markdown ─────────────────────────────────────────────
  describe("BH-19: 成功渲染 Markdown 内容", () => {
    it("返回 Markdown 文本后内容渲染到 DOM", async () => {
      globalThis.fetch = mockFetch(200, "# 产品概览\n\n这是详细描述。");
      render(() => <DocViewerPanel path="product/prd/overview.md" />);

      const content = await screen.findByTestId("doc-viewer-content");
      expect(content).toBeInTheDocument();
      // marked 会把 # 转换为 <h1>
      expect(content.querySelector("h1")).not.toBeNull();
    });

    it("fetch 调用时使用 encodeURIComponent 编码 path", async () => {
      const fetchSpy = mockFetch(200, "content");
      globalThis.fetch = fetchSpy;

      render(() => <DocViewerPanel path="product/prd/has spaces.md" />);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          "/docs/product%2Fprd%2Fhas%20spaces.md",
        );
      });
    });
  });

  // ─── BH-20：404 ──────────────────────────────────────────────────────────
  describe("BH-20: 404 文档未找到", () => {
    it("返回 404 时显示 doc-viewer-not-found", async () => {
      globalThis.fetch = mockFetch(404, "");
      render(() => <DocViewerPanel path="product/prd/missing.md" />);

      const el = await screen.findByTestId("doc-viewer-not-found");
      expect(el).toBeInTheDocument();
      expect(el).toHaveTextContent("文档未找到");
    });
  });

  // ─── BH-21：403 / 500 ────────────────────────────────────────────────────
  describe("BH-21: 403/500 加载失败", () => {
    it("返回 403 时显示 doc-viewer-error", async () => {
      globalThis.fetch = mockFetch(403, "");
      render(() => <DocViewerPanel path="product/prd/forbidden.md" />);

      const el = await screen.findByTestId("doc-viewer-error");
      expect(el).toBeInTheDocument();
      expect(el).toHaveTextContent("加载失败，请重试");
    });

    it("返回 500 时显示 doc-viewer-error", async () => {
      globalThis.fetch = mockFetch(500, "");
      render(() => <DocViewerPanel path="product/prd/server-error.md" />);

      const el = await screen.findByTestId("doc-viewer-error");
      expect(el).toBeInTheDocument();
      expect(el).toHaveTextContent("加载失败，请重试");
    });
  });

  // ─── path 变化时自动重新请求 ────────────────────────────────────────────
  describe("path 变化重新请求", () => {
    it("path 改变后以新 path 发起请求", async () => {
      const fetchSpy = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve("# First"),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve("# Second"),
        });
      globalThis.fetch = fetchSpy;

      // 用 SolidJS createSignal 在组件外控制 prop
      const { createSignal } = await import("solid-js");
      const [path, setPath] = createSignal("first.md");

      render(() => <DocViewerPanel path={path()} />);

      await screen.findByTestId("doc-viewer-content");
      expect(fetchSpy).toHaveBeenCalledWith("/docs/first.md");

      // 改变 signal → DocViewerPanel 自动重新请求
      setPath("second.md");

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith("/docs/second.md");
      });
    });
  });
});
