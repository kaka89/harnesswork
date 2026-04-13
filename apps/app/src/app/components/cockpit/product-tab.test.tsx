/**
 * 集成测试：ProductTab
 * 覆盖行为规格链路：BH-16 → BH-17 → BH-19
 *   点击文档树节点 → selectedPath 更新 → DocViewerPanel 加载对应文档
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@solidjs/testing-library";
import ProductTab from "./product-tab";

// mock DOMPurify（happy-dom 无原生实现）
vi.mock("dompurify", () => ({
  default: {
    sanitize: (input: string) => input,
  },
}));

const MOCK_DOCS = [
  { path: "product/prd/overview.md", title: "产品概览", type: "prd", status: "approved" },
  { path: "product/prd/detail.md", title: "需求详情", type: "prd", status: "draft" },
];

const MOCK_DOC_CONTENT = "# 产品概览\n\n这是产品概览文档。";

describe("ProductTab", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("渲染 product-tab 根容器、DocTreePanel、DocViewerPanel", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(MOCK_DOCS),
      text: () => Promise.resolve(""),
    });

    render(() => <ProductTab />);

    expect(screen.getByTestId("product-tab")).toBeInTheDocument();
    expect(screen.getByTestId("doc-tree-panel")).toBeInTheDocument();
    expect(screen.getByTestId("doc-viewer-panel")).toBeInTheDocument();
  });

  it("初始状态 DocViewerPanel 显示引导提示", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(MOCK_DOCS),
      text: () => Promise.resolve(""),
    });

    render(() => <ProductTab />);
    expect(screen.getByText("请选择左侧文档")).toBeInTheDocument();
  });

  it("BH-16→BH-17→BH-19: 点击树节点后 DocViewerPanel 加载文档内容", async () => {
    // fetch 按 URL 路由：/docs → 列表；/docs/xxx → 文档内容
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/docs") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(MOCK_DOCS),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(MOCK_DOC_CONTENT),
      });
    });

    render(() => <ProductTab />);

    // 等待文档树加载完成
    const nodeBtn = await screen.findByTestId("doc-entry-product/prd/overview.md");

    // 点击节点（BH-17）
    fireEvent.click(nodeBtn);

    // DocViewerPanel 应渲染文档内容（BH-19）
    const content = await screen.findByTestId("doc-viewer-content");
    expect(content).toBeInTheDocument();
    // marked 将 # 标题解析为 <h1>
    expect(content.querySelector("h1")).not.toBeNull();
  });

  it("DocViewerPanel 显示 404 时 doc-viewer-not-found 可见", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/docs") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(MOCK_DOCS),
        });
      }
      return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve("") });
    });

    render(() => <ProductTab />);

    const nodeBtn = await screen.findByTestId("doc-entry-product/prd/overview.md");
    fireEvent.click(nodeBtn);

    await waitFor(() => {
      expect(screen.getByTestId("doc-viewer-not-found")).toBeInTheDocument();
    });
  });
});
