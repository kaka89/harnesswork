import { useMemo } from "react";

import type { WorkspacePreset } from "../../../../app/types";
import type { OpenworkWorkspaceInfo } from "../../../../app/lib/openwork-server";
import { useOpenworkStore } from "../../../kernel/store";
import type { XingjingProduct } from "../types";

const VALID_PRESETS: readonly WorkspacePreset[] = [
  "starter",
  "automation",
  "minimal",
];

function isValidPreset(p: string): p is WorkspacePreset {
  return (VALID_PRESETS as readonly string[]).includes(p);
}

/**
 * 将 OpenWork workspace 映射到星静产品。
 * 若 workspace.preset 不是有效的 WorkspacePreset，降级为 "minimal"。
 */
function toXingjingProduct(ws: OpenworkWorkspaceInfo): XingjingProduct {
  const preset = isValidPreset(ws.preset) ? ws.preset : "minimal";
  return { ...ws, preset };
}

export type UseXingjingWorkspaceReturn = {
  /** 所有可用产品（对应 OpenWork workspaces） */
  products: XingjingProduct[];
  /** 当前活跃产品 */
  activeProduct: XingjingProduct | null;
  /** 当前活跃产品 ID */
  activeProductId: string | null;
  /**
   * 切换活跃产品。
   * 底层调用 useOpenworkStore.setActiveWorkspaceId，
   * session-route.tsx 的 workspace bootstrap 副作用会自动跟进。
   */
  setActiveProduct: (productId: string) => void;
  /** 应用是否仍在启动初始化中 */
  bootstrapping: boolean;
};

/**
 * 星静产品（workspace）管理 hook。
 *
 * 通过组合 useOpenworkStore 提供产品列表、当前活跃产品及切换功能。
 * 每个星静"产品"对应一个具有已知 WorkspacePreset 的 OpenWork workspace。
 *
 * 遵循 10-product-shell.md §8 和 06-openwork-bridge-contract.md §3 的设计。
 *
 * @example
 * ```tsx
 * const { products, activeProduct, setActiveProduct } = useXingjingWorkspace();
 * ```
 */
export function useXingjingWorkspace(): UseXingjingWorkspaceReturn {
  const { workspaces, activeWorkspaceId, bootstrapping, setActiveWorkspaceId } =
    useOpenworkStore();

  const products = useMemo(
    () => workspaces.map(toXingjingProduct),
    [workspaces],
  );

  const activeProduct = useMemo(
    () => products.find((p) => p.id === activeWorkspaceId) ?? null,
    [products, activeWorkspaceId],
  );

  return {
    products,
    activeProduct,
    activeProductId: activeWorkspaceId,
    setActiveProduct: setActiveWorkspaceId,
    bootstrapping,
  };
}
