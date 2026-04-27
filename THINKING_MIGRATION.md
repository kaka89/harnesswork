# Thinking 模式迁移到 OpenWork 原生能力

## 修改摘要

已将星静自建的 `<think>` 标签解析逻辑迁移到 OpenWork 原生的 `ReasoningPart` 支持。

## 修改文件

### 1. `apps/app/src/app/xingjing/components/ai/ai-chat-drawer.tsx`

**修改前：**
- 自建 `parseThinkingContent()` 函数手动解析 `<think></think>` 标签
- 在 `AiChatBubble` 组件中手动渲染 `ThinkingBlock`

**修改后：**
- 删除 `parseThinkingContent()` 函数（保留注释说明历史原因）
- 简化 `AiChatBubble` 组件，仅渲染纯文本内容
- Thinking 展示由 OpenWork `MessageList` 组件原生处理

**原理：**
OpenWork SDK 的 `Part` 类型包含 `ReasoningPart`（`type: "reasoning"`），`MessageList` 组件已内置 reasoning 展示逻辑（折叠块、流式更新等）。

### 2. `apps/app/src/app/xingjing/services/memory-store.ts`

**修改前：**
```typescript
// 仅提取 type==='text' 的 parts，忽略 thinking / tool-use / tool-result 等
const extractTextContent = (m: any): string => {
  const parts: any[] = m.parts ?? m.info?.parts ?? [];
  return parts
    .filter((p: any) => p.type === 'text' && typeof p.text === 'string')
    .map((p: any) => p.text as string)
    .join('');
};
```

**修改后：**
```typescript
// 提取用户可见的文本内容（text + reasoning parts）
// reasoning part 包含 AI 的思考过程，应保留在历史记录中
const extractTextContent = (m: any): string => {
  const parts: any[] = m.parts ?? m.info?.parts ?? [];
  return parts
    .filter((p: any) =>
      (p.type === 'text' || p.type === 'reasoning') &&
      typeof p.text === 'string'
    )
    .map((p: any) => p.text as string)
    .join('\n\n');
};
```

**原因：**
历史会话恢复时需要保留 reasoning 内容，供用户回顾 AI 的思考过程。

### 3. `apps/app/src/app/xingjing/pages/solo/autopilot/index.tsx`

**无需修改：**
- 已使用 OpenWork 原生 `MessageList` 组件
- 已启用 `showThinking={true}`
- 自动支持 reasoning part 展示

## OpenWork 原生支持验证

### Part 类型定义（来自 `@opencode-ai/sdk/v2/client`）

```typescript
export type ReasoningPart = {
  id: string;
  sessionID: string;
  messageID: string;
  type: "reasoning";
  text: string;
  metadata?: {
    [key: string]: unknown;
  };
  time: {
    start: number;
    end?: number;
  };
};

export type Part = TextPart | ReasoningPart | FilePart | ToolPart | ...;
```

### MessageList 原生支持（来自 `apps/app/src/app/components/session/message-list.tsx`）

```typescript
// L392: 过滤 reasoning part
if (part.type === "reasoning") {
  return props.showThinking;
}

// L821-866: 渲染 reasoning 折叠块
if (rowProps.part.type === "reasoning") {
  return (
    <div class="reasoning-collapse">
      <button class="reasoning-collapse-btn">
        {/* 折叠/展开控制 */}
      </button>
      <Show when={reasoningOpen()}>
        <div class="reasoning-collapse-content">
          {reasoningText()}
        </div>
      </Show>
    </div>
  );
}
```

## 优势

1. **代码简化**：删除 ~30 行自建解析逻辑
2. **功能对齐**：与 OpenWork 主应用保持一致的 UI/UX
3. **维护性提升**：OpenWork 升级时自动获得新特性（如流式优化、样式改进）
4. **类型安全**：使用 SDK 原生类型，避免字符串解析错误

## 测试建议

1. **Thinking 展示测试**
   ```typescript
   // 测试用例：发送需要思考的 prompt
   const testPrompt = "请思考一下如何优化这段代码的性能";
   // 预期：AI 回复包含 reasoning part，UI 自动展示折叠块
   ```

2. **历史会话恢复测试**
   ```typescript
   // 测试用例：恢复包含 reasoning 的历史会话
   const session = await loadSession(workDir, sessionId);
   // 预期：reasoning 内容正确加载并展示
   ```

3. **流式更新测试**
   ```typescript
   // 测试用例：观察 reasoning part 的流式更新
   // 预期：思考过程实时展示，完成后自动折叠
   ```

## 回滚方案

如果发现问题，可以通过 git 回滚到修改前的版本：

```bash
git checkout HEAD~1 -- apps/app/src/app/xingjing/components/ai/ai-chat-drawer.tsx
git checkout HEAD~1 -- apps/app/src/app/xingjing/services/memory-store.ts
```

## 下一步

- [ ] 调研 OpenWork Memory API（session.updateMetadata / session.search）
- [ ] 优化 Memory 系统（元数据存储、摘要生成、搜索功能）
- [ ] 集成验证和回归测试
