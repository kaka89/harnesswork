# 产品时间戳与最近更新自动选中

**日期**：2026-04-13  
**状态**：设计已确认，待实现

---

## 需求概述

1. 记录产品的创建时间（已有 `createdAt`）和最后更新时间（新增 `updatedAt`）
2. 对产品的任何内容修改都算更新，包括：
   - 切换到某个产品
   - 修改产品名称、描述、gitUrl
   - 向团队版产品新增 Domain 或 App
3. 每次切换到团队版或独立版时，产品下拉菜单自动选中该模式下最近更新过的产品

---

## 设计决策

### 方案选择

采用**方案 A — 最小改动**：

- 改动集中在 `product-store.ts` 一个文件
- 不涉及 UI 层修改
- 向后兼容旧数据（无 `updatedAt` 时使用 `createdAt` 兜底）

### 切换行为确认

**切换产品也算更新** — 用户切换到某个产品时，该产品的 `updatedAt` 会被更新，视为「最近使用」。

---

## 技术设计

### 1. 数据模型变更

**文件**：`harnesswork/apps/app/src/app/xingjing/services/product-store.ts`

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

**向后兼容**：旧产品数据没有 `updatedAt` 字段，所有逻辑使用 `p.updatedAt ?? p.createdAt` 做兜底。

---

### 2. 新增 updateProduct 动作

新增通用的产品更新函数，自动写入 `updatedAt`：

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

并在 return 对象中导出，供日后 UI 层调用。

---

### 3. addProduct 改造

创建产品时同时写入 `createdAt` 和 `updatedAt`：

```ts
const newProduct: XingjingProduct = {
  ...product,
  id: `prod-${Date.now()}`,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
```

---

### 4. switchProduct 改造

切换产品时更新 `updatedAt`：

```ts
async function switchProduct(productId: string) {
  const product = products().find((p) => p.id === productId);
  if (!product) return;

  // 更新该产品的 updatedAt
  const updated = products().map(p =>
    p.id === productId
      ? { ...p, updatedAt: new Date().toISOString() }
      : p
  );
  setProducts(updated);
  await saveProducts(updated);

  // 更新偏好
  const updatedPrefs = { ...preferences(), activeProductId: productId };
  setPreferences(updatedPrefs);
  await savePreferences(updatedPrefs);

  // Re-initialize OpenCode client
  const baseUrl = await resolveOpenCodeBaseUrl();
  initXingjingClient(baseUrl, product.workDir);
}
```

---

### 5. addDomainToTeamProduct / addAppToTeamProduct 改造

修改产品时写入 `updatedAt`：

在现有 `map` 逻辑中追加 `updatedAt: new Date().toISOString()`。

---

### 6. setViewMode 自动选中逻辑

切换模式时自动选中该模式下最近更新的产品：

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

## 影响范围

| 文件 | 是否改动 |
|------|----------|
| `services/product-store.ts` | 是（全部改动集中于此） |
| `components/product/product-switcher.tsx` | 否 |
| `components/layouts/main-layout.tsx` | 否 |
| `stores/app-store.tsx` | 否 |
| `pages/settings/index.tsx` | 否 |

---

## 向后兼容性

- 旧产品数据没有 `updatedAt` 字段，所有排序逻辑使用 `p.updatedAt ?? p.createdAt` 兜底
- 新增字段为可选，不影响已有 YAML 文件解析
