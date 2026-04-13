# 产品时间戳与最近更新自动选中 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为产品增加 updatedAt 时间戳，切换模式时自动选中最近更新的产品。

**Architecture:** 在 product-store.ts 中扩展 XingjingProduct 类型，修改所有产品变更函数以更新 updatedAt，setViewMode 切换时自动选中最新产品。

**Tech Stack:** SolidJS, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-13-product-timestamp-design.md`

---

## File Structure

| 文件 | 操作 | 职责 |
|------|------|------|
| `apps/app/src/app/xingjing/services/product-store.ts` | Modify | 所有改动集中于此 |

---

### Task 1: 扩展 XingjingProduct 接口

**Files:**
- Modify: `apps/app/src/app/xingjing/services/product-store.ts:61-72`

- [ ] **Step 1: 在 XingjingProduct 接口中添加 updatedAt 字段**

在 `createdAt: string;` 后添加：

```ts
export interface XingjingProduct {
  id: string;
  name: string;
  workDir: string;
  gitUrl?: string;
  createdAt: string;
  updatedAt?: string;   // 新增：最后更新时间
  description?: string;
  productType?: 'team' | 'solo';
  teamStructure?: TeamStructure;
}
```

---

### Task 2: 修改 addProduct 函数

**Files:**
- Modify: `apps/app/src/app/xingjing/services/product-store.ts:184-200`

- [ ] **Step 1: 在 addProduct 中同时写入 updatedAt**

找到 `addProduct` 函数，修改 `newProduct` 对象：

```ts
async function addProduct(product: Omit<XingjingProduct, 'id' | 'createdAt'>) {
  const newProduct: XingjingProduct = {
    ...product,
    id: `prod-${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const updated = [...products(), newProduct];
  setProducts(updated);
  await saveProducts(updated);

  if (updated.length === 1) {
    await switchProduct(newProduct.id);
  }

  return newProduct;
}
```

---

### Task 3: 新增 updateProduct 函数

**Files:**
- Modify: `apps/app/src/app/xingjing/services/product-store.ts:238` (setViewMode 后)

- [ ] **Step 1: 在 setViewMode 函数后添加 updateProduct 函数**

```ts
async function updateProduct(
  productId: string,
  patch: Partial<Omit<XingjingProduct, 'id' | 'createdAt'>>,
) {
  const updated = products().map(p =>
    p.id === productId
      ? { ...p, ...patch, updatedAt: new Date().toISOString() }
      : p
  );
  setProducts(updated);
  await saveProducts(updated);
}
```

---

### Task 4: 修改 switchProduct 函数

**Files:**
- Modify: `apps/app/src/app/xingjing/services/product-store.ts:220-231`

- [ ] **Step 1: 在切换产品时更新 updatedAt**

替换整个 `switchProduct` 函数：

```ts
async function switchProduct(productId: string) {
  const product = products().find((p) => p.id === productId);
  if (!product) return;

  // 更新该产品的 updatedAt
  const updatedProducts = products().map(p =>
    p.id === productId
      ? { ...p, updatedAt: new Date().toISOString() }
      : p
  );
  setProducts(updatedProducts);
  await saveProducts(updatedProducts);

  // 更新偏好
  const updatedPrefs = { ...preferences(), activeProductId: productId };
  setPreferences(updatedPrefs);
  await savePreferences(updatedPrefs);

  // Re-initialize OpenCode client with the new product's workDir
  const baseUrl = await resolveOpenCodeBaseUrl();
  initXingjingClient(baseUrl, product.workDir);
}
```

---

### Task 5: 修改 addDomainToTeamProduct 函数

**Files:**
- Modify: `apps/app/src/app/xingjing/services/product-store.ts:367-378`

- [ ] **Step 1: 在 map 逻辑中添加 updatedAt**

找到 `addDomainToTeamProduct` 函数中的 `const updated = products().map(...)` 块，修改为：

```ts
const updated = products().map(p => {
  if (p.id !== productId) return p;
  return {
    ...p,
    updatedAt: new Date().toISOString(),
    teamStructure: {
      ...p.teamStructure!,
      domains: [...p.teamStructure!.domains, newDomain],
    },
  };
});
```

---

### Task 6: 修改 addAppToTeamProduct 函数

**Files:**
- Modify: `apps/app/src/app/xingjing/services/product-store.ts:414-425`

- [ ] **Step 1: 在 map 逻辑中添加 updatedAt**

找到 `addAppToTeamProduct` 函数中的 `const updated = products().map(...)` 块，修改为：

```ts
const updated = products().map(p => {
  if (p.id !== productId) return p;
  return {
    ...p,
    updatedAt: new Date().toISOString(),
    teamStructure: {
      ...p.teamStructure!,
      apps: [...p.teamStructure!.apps, newApp],
    },
  };
});
```

---

### Task 7: 修改 setViewMode 函数

**Files:**
- Modify: `apps/app/src/app/xingjing/services/product-store.ts:233-237`

- [ ] **Step 1: 添加自动选中最近更新产品的逻辑**

替换整个 `setViewMode` 函数：

```ts
async function setViewMode(mode: 'team' | 'solo') {
  const updatedPrefs = { ...preferences(), viewMode: mode };
  setPreferences(updatedPrefs);
  await savePreferences(updatedPrefs);

  // 自动选中该模式下最近更新的产品
  const modeProducts = products().filter(
    p => (p.productType ?? 'solo') === mode
  );
  if (modeProducts.length > 0) {
    const mostRecent = modeProducts.reduce((latest, p) => {
      const pTime = new Date(p.updatedAt ?? p.createdAt).getTime();
      const latestTime = new Date(latest.updatedAt ?? latest.createdAt).getTime();
      return pTime > latestTime ? p : latest;
    });
    await switchProduct(mostRecent.id);
  }
}
```

---

### Task 8: 导出 updateProduct 函数

**Files:**
- Modify: `apps/app/src/app/xingjing/services/product-store.ts:440-459`

- [ ] **Step 1: 在 return 对象中添加 updateProduct**

在 return 对象中添加 `updateProduct`：

```ts
return {
  // State
  products,
  preferences,
  loading,
  error,
  activeProduct,
  viewMode,
  XINGJING_DIR_STRUCTURE,
  // Actions
  loadFromFile,
  addProduct,
  removeProduct,
  switchProduct,
  setViewMode,
  updateProduct,  // 新增
  initializeProductDir,
  initializeTeamProduct,
  addDomainToTeamProduct,
  addAppToTeamProduct,
};
```

---

### Task 9: 验证构建

**Files:**
- 无文件修改

- [ ] **Step 1: 运行 TypeScript 类型检查**

```bash
cd harnesswork && pnpm --filter app exec tsc --noEmit
```

Expected: 无类型错误

- [ ] **Step 2: 提交变更**

```bash
git add apps/app/src/app/xingjing/services/product-store.ts docs/superpowers/specs/ docs/superpowers/plans/
git commit -m "feat(xingjing): add updatedAt timestamp to product and auto-select most recent on mode switch"
```

---

## Self-Review Checklist

- [x] Spec coverage: 所有设计点已覆盖
- [x] Placeholder scan: 无 TBD/TODO
- [x] Type consistency: updatedAt 字段在各处一致使用
