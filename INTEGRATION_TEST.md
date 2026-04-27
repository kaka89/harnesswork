# Memory 和 Thinking 优化 - 集成验证测试

## 测试日期
2024-01-XX

## 修改摘要

### 阶段一：Thinking 模式对齐 ✅
- 移除自建 `parseThinkingContent()` 解析逻辑
- 使用 OpenWork 原生 `ReasoningPart` 类型
- MessageList 自动展示 reasoning 折叠块

### 阶段二：Memory API 调研 ✅
- 确认 OpenWork 支持 `session.list({ search })` 原生搜索
- 确认 OpenWork 支持 `session.update({ title })` 更新摘要
- 确认 OpenWork 不支持自定义 metadata（需保留 sidecar.json）

### 阶段三：Memory 系统优化 ✅
- 搜索功能迁移到 OpenWork 原生 API（带降级）
- 摘要生成改为异步模式（不阻塞 UI）
- 摘要自动更新到 OpenWork session.title
- 为 sidecar.json 添加详细注释说明

---

## 测试清单

### 1. Thinking 展示测试

#### 测试用例 1.1：基础 Thinking 展示
```typescript
// 操作步骤
1. 打开 solo-autopilot 页面
2. 输入需要思考的 prompt：
   "请思考一下如何优化这段代码的性能：
   function fibonacci(n) {
     if (n <= 1) return n;
     return fibonacci(n-1) + fibonacci(n-2);
   }"
3. 观察 AI 回复

// 预期结果
✅ AI 回复包含 reasoning part
✅ UI 自动展示紫色折叠块（标题：思考过程）
✅ 折叠块默认展开，显示思考内容
✅ 点击折叠块可以收起/展开
✅ 思考完成后自动折叠
```

#### 测试用例 1.2：流式 Thinking 更新
```typescript
// 操作步骤
1. 发送复杂 prompt 触发长时间思考
2. 观察思考过程的流式更新

// 预期结果
✅ 思考内容实时流式更新
✅ 折叠块显示 "思考中..." 状态
✅ 有 loading 动画（旋转图标）
✅ 思考完成后状态变为 "思考过程"
```

#### 测试用例 1.3：历史会话 Reasoning 恢复
```typescript
// 操作步骤
1. 完成一次包含 reasoning 的对话
2. 点击 "历史" 按钮
3. 选择刚才的会话恢复

// 预期结果
✅ reasoning 内容正确加载
✅ 折叠块正常展示
✅ 可以正常展开/收起
```

---

### 2. Memory 搜索测试

#### 测试用例 2.1：OpenWork 原生搜索
```typescript
// 操作步骤
1. 创建多个会话，包含不同关键词：
   - 会话 A: "产品分析报告"
   - 会话 B: "技术架构设计"
   - 会话 C: "用户留存优化"
2. 打开历史面板
3. 搜索 "产品"

// 预期结果
✅ 返回会话 A（包含 "产品" 关键词）
✅ 搜索速度快（< 500ms）
✅ 结果按相关性排序
✅ 控制台无错误日志
```

#### 测试用例 2.2：搜索降级测试
```typescript
// 操作步骤
1. 断开 OpenWork 连接（停止 OpenCode 服务）
2. 搜索 "产品"

// 预期结果
✅ 自动降级到本地搜索
✅ 控制台显示降级日志：
   "[memory] OpenWork 原生搜索失败，降级到本地搜索"
✅ 仍能返回搜索结果（基于本地关键词匹配）
```

#### 测试用例 2.3：空查询测试
```typescript
// 操作步骤
1. 搜索框输入空字符串或仅空格
2. 点击搜索

// 预期结果
✅ 返回所有会话（按时间倒序）
✅ 不调用 OpenWork API（避免无效请求）
```

---

### 3. 摘要生成测试

#### 测试用例 3.1：异步摘要生成
```typescript
// 操作步骤
1. 完成一次对话（至少 3 轮）
2. 点击 "新对话" 归档当前会话
3. 观察 UI 响应时间

// 预期结果
✅ UI 立即响应（< 100ms），不阻塞
✅ 历史列表立即显示 fallback 摘要（第一条用户消息前 80 字）
✅ 控制台显示异步生成日志：
   "[memory] AI 摘要生成成功: { sessionId, summary, tags }"
✅ 几秒后摘要自动更新为 AI 生成的版本
```

#### 测试用例 3.2：摘要更新到 OpenWork
```typescript
// 操作步骤
1. 完成对话并归档
2. 等待 AI 摘要生成完成（观察控制台日志）
3. 使用 OpenWork 主应用查看该 session

// 预期结果
✅ OpenWork 主应用中 session.title 显示 AI 生成的摘要
✅ 控制台显示更新日志：
   "[memory] 摘要已更新到 OpenWork session.title: {sessionId}"
```

#### 测试用例 3.3：摘要生成失败降级
```typescript
// 操作步骤
1. 断开 OpenWork 连接
2. 完成对话并归档

// 预期结果
✅ 仍显示 fallback 摘要
✅ 控制台显示失败日志：
   "[memory] AI 摘要生成失败: ..."
✅ 不影响会话归档功能
```

---

### 4. Sidecar 元数据测试

#### 测试用例 4.1：Tags 存储和加载
```typescript
// 操作步骤
1. 创建会话并手动添加 tags（如果有 UI）
2. 重启应用
3. 加载历史会话

// 预期结果
✅ tags 正确保存到 .xingjing/memory/sidecar.json
✅ 重启后 tags 正确加载
✅ 搜索时 tags 参与匹配
```

#### 测试用例 4.2：Mode 标记
```typescript
// 操作步骤
1. 创建普通对话（chat 模式）
2. 创建团队调度对话（dispatch 模式，使用 @agent）
3. 查看历史列表

// 预期结果
✅ chat 模式显示绿色 "对话" 标签
✅ dispatch 模式显示紫色 "团队" 标签
✅ mode 正确保存到 sidecar.json
```

---

### 5. 回归测试

#### 测试用例 5.1：基础对话功能
```typescript
// 操作步骤
1. 发送普通文本消息
2. 发送带 @agent 的消息
3. 发送带 /command 的消息

// 预期结果
✅ 所有对话模式正常工作
✅ 消息正确展示
✅ 无控制台错误
```

#### 测试用例 5.2：会话历史功能
```typescript
// 操作步骤
1. 创建多个会话
2. 切换会话
3. 恢复历史会话

// 预期结果
✅ 会话列表正确显示
✅ 会话切换无卡顿
✅ 历史恢复内容完整
```

#### 测试用例 5.3：附件功能
```typescript
// 操作步骤
1. 上传图片附件
2. 发送消息

// 预期结果
✅ 附件正常上传
✅ AI 能识别图片内容
✅ 历史恢复时附件正常显示
```

---

## 性能测试

### 测试用例 P1：搜索性能
```typescript
// 测试数据
- 会话数量：100 个
- 搜索关键词："产品"

// 性能指标
✅ OpenWork 原生搜索：< 500ms
✅ 本地降级搜索：< 1000ms
✅ UI 无卡顿
```

### 测试用例 P2：摘要生成性能
```typescript
// 测试数据
- 消息数量：20 条
- 总字符数：~5000 字

// 性能指标
✅ fallback 摘要返回：< 100ms
✅ AI 摘要生成：< 10s（异步，不阻塞 UI）
✅ UI 响应流畅
```

---

## 已知问题和限制

### 限制 1：自定义元数据依赖 sidecar.json
**原因：** OpenWork Session 类型不支持自定义 metadata 字段

**影响：**
- tags/goal/mode 仍需本地文件存储
- 跨设备同步需要额外处理

**缓解措施：**
- 添加详细注释说明原因
- 等待 OpenWork 未来支持自定义 metadata

### 限制 2：AI 摘要生成依赖 LLM 可用性
**原因：** OpenWork 没有 `session.generateSummary()` API

**影响：**
- LLM 不可用时只能使用 fallback 摘要
- 摘要质量依赖 LLM 响应格式

**缓解措施：**
- fallback 摘要足够可用（第一条用户消息）
- 异步生成不影响用户体验

---

## 回滚方案

如果发现严重问题，可以通过 git 回滚：

```bash
# 回滚 Thinking 修改
git checkout HEAD~3 -- apps/app/src/app/xingjing/components/ai/ai-chat-drawer.tsx
git checkout HEAD~3 -- apps/app/src/app/xingjing/services/memory-store.ts

# 回滚 Memory 优化
git checkout HEAD~2 -- apps/app/src/app/xingjing/services/memory-store.ts
git checkout HEAD~2 -- apps/app/src/app/xingjing/components/ai/ai-chat-drawer.tsx
```

---

## 测试结论

### 通过标准
- [ ] 所有功能测试用例通过
- [ ] 所有性能测试达标
- [ ] 无严重回归问题
- [ ] 类型检查通过
- [ ] 无控制台错误

### 测试签名
- 测试人员：__________
- 测试日期：__________
- 测试结果：通过 / 失败
- 备注：__________
