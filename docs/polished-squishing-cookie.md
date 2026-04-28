# HarnessWork Docs Audit & Xingjing Design Optimization Plan

## Context

HarnessWork is a fork of OpenWork (open-source AI workstation) that embeds **星静 (Xingjing)** — an AI product engineering platform module. The repo is at `/Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork`.

**Critical finding**: All 18 design docs in `docs/` were written against the **old SolidJS + Tauri codebase** (OpenWork v0.11.x). The actual codebase has since been **fully migrated to React 19 + React Router 7 + Zustand + React Query** (starting April 21, 2026), and is also migrating from Tauri to Electron. The SolidJS code (`apps/app/src/app/context/`, `apps/app/src/app/xingjing/`, etc.) no longer exists. The React code lives at `apps/app/src/react-app/`.

**What the user wants:**
1. Audit: do the OpenWork platform docs (`05-*.md`) match the real source?
2. Optimize Xingjing's technical design to maximally reuse OpenWork capabilities (opencode Session, Memory, Scheduling, Agent/Skill/Command registration)
3. Optimize Xingjing's frontend design to **integrate into OpenWork's native React pages** — no new standalone UI

## Research Findings

### Actual Codebase State (React 19)

| Path | Purpose |
|------|---------|
| `apps/app/src/index.react.tsx` | React 19 entry point |
| `apps/app/src/react-app/shell/app-root.tsx` | React Router with `/session`, `/settings`, `/signin` routes |
| `apps/app/src/react-app/kernel/` | Zustand store, React Query, platform context, server provider, SDK provider |
| `apps/app/src/react-app/domains/session/` | SessionPage, SessionSurface, Composer, message list, sync |
| `apps/app/src/react-app/domains/settings/` | Settings pages + panels |
| `apps/app/src/react-app/domains/connections/` | Provider auth, MCP management |
| `apps/app/src/react-app/domains/workspace/` | Workspace CRUD |
| `apps/app/src/app/lib/opencode.ts` | OpenCode SDK client factory |
| `apps/app/src/app/lib/opencode-session.ts` | Session operations |
| `apps/server-v2/src/services/` | Managed resources, registry, runtime |
| `apps/server-v2/src/routes/managed.ts` | Skills/Commands/Agents API |

### What Docs Reference (That No Longer Exists)
- `apps/app/src/app/context/session.ts` → gone
- `apps/app/src/app/context/global-sdk.tsx` → replaced by `react-app/kernel/global-sdk-provider.tsx`
- `apps/app/src/app/entry.tsx` → replaced by `react-app/shell/providers.tsx`
- `apps/app/src/app/xingjing/` → entire directory gone, no Xingjing React code exists yet
- SolidJS primitives (`createSignal`, `createStore`, `createEffect`, `@solidjs/router`) → none in package.json
- `@solid-primitives/event-bus`, `@solid-primitives/storage` → gone

### Key Architectural Shifts for Docs

| Old (SolidJS) | New (React 19) |
|---|---|
| `createSignal / createStore` | `useState / useReducer / Zustand` |
| `createMemo` | `useMemo` |
| `createEffect` | `useEffect` |
| `@solidjs/router Route/useParams` | `react-router-dom Route/useParams` |
| SolidJS Context Provider | React Context + custom hooks |
| 4-layer Provider in `entry.tsx` | Providers in `react-app/shell/providers.tsx` |
| `useGlobalSDK().client()` | `useGlobalSdk()` from `kernel/global-sdk-provider.tsx` |
| `useWorkspace()` store | Zustand store in `kernel/store.ts` |
| `useSession()` context | React Query + `domains/session/sync/` |
| SSE coalescing in `global-sdk.tsx` | SSE coalescing in `kernel/global-sync-provider.tsx` |
| `/xingjing` route with full standalone UI | Should be **extensions to native `/session` and `/settings`** |

### Frontend Integration Principle (User's Requirement)
Xingjing should NOT create a new `/xingjing` route with its own shell. Instead:
- **Product workspace = OpenWork workspace** (one workspace per product)
- **Autopilot = reuse `SessionPage`** with Xingjing-specific workspace preset + session template
- **Agent Workshop = extend `/settings/extensions`** page with Xingjing agent/skill CRUD
- **Knowledge Base = workspace files** managed through existing workspace file operations
- **Settings = extend `/settings`** with Xingjing-specific config tab
- **Product Mode = workspace sidebar panel** (add artifact display to existing session sidebar)

---

## Work Units

### Unit 1: Audit + Create Migration Reference Doc
**Files**: `docs/00-overview.md` (update), create `docs/audit-react-migration.md`
- Update `00-overview.md` tech stack table, topology diagram, and all file path references from SolidJS to React
- Create a new audit doc that maps old SolidJS symbols → new React equivalents as a reference for all other doc updates

### Unit 2: Rewrite 05-openwork-platform-overview.md
**Files**: `docs/05-openwork-platform-overview.md`
- Replace SolidJS stack (solid-js, @solidjs/router, lucide-solid, @solid-primitives/*) with React 19 stack
- Update startup sequence: `index.react.tsx` → `providers.tsx` (QueryClientProvider + ZustandProvider + PlatformProvider) → `app-root.tsx`
- Update Provider chain: ServerProvider → GlobalSDKProvider → GlobalSyncProvider → LocalProvider → React Router
- Update topology: note Tauri→Electron migration in v0.12.0

### Unit 3: Rewrite 05a-openwork-session-message.md
**Files**: `docs/05a-openwork-session-message.md`
- Replace SolidJS store patterns with React Query + Zustand
- Session store: `kernel/store.ts` Zustand (workspace list, active session IDs)
- Message sync: `domains/session/sync/session-sync.ts` (React Query cache, delta coalescing via requestAnimationFrame)
- Update all code examples from SolidJS to React hooks

### Unit 4: Rewrite 05b-openwork-skill-agent-mcp.md
**Files**: `docs/05b-openwork-skill-agent-mcp.md`
- Verify against `apps/server-v2/src/services/managed-resource-service.ts` and `apps/server-v2/src/routes/managed.ts`
- Update skill/command/agent registration APIs to reflect server-v2 Hono routes
- Check if file-as-config pattern is still correct (`.opencode/skills/`, `.opencode/commands/`, `.opencode/agents/`)

### Unit 5: Rewrite 05c-openwork-workspace-fileops.md
**Files**: `docs/05c-openwork-workspace-fileops.md`
- Verify against `apps/app/src/app/lib/desktop.ts` (workspace functions) and `apps/server/src/`
- Update workspace ID derivation, file operations API

### Unit 6: Rewrite 05d/05e/05f/05g/05h docs (batch)
**Files**: `docs/05d-openwork-model-provider.md`, `docs/05e-openwork-permission-question.md`, `docs/05f-openwork-settings-persistence.md`, `docs/05g-openwork-process-runtime.md`, `docs/05h-openwork-state-architecture.md`
- 05d: verify against `apps/app/src/react-app/domains/connections/` provider auth
- 05e: verify permission/question modals in `domains/session/modals/`
- 05f: verify settings pages in `domains/settings/`
- 05g: update for Electron migration (v0.12.0); verify `apps/desktop/src-tauri/` still active
- 05h: major rewrite — replace SolidJS 4-layer Provider description with React 19 Provider chain, Zustand store architecture, React Query data flow

### Unit 7: Redesign 06-openwork-bridge-contract.md
**Files**: `docs/06-openwork-bridge-contract.md`
- **Major redesign**: eliminate the 46-field SolidJS accessor Context approach
- New design: Xingjing integration via React hooks only:
  - `useOpenCodeClient()` from `kernel/global-sdk-provider.tsx`
  - `useStore()` from `kernel/store.ts`
  - `useWorkspaceSessionGroups()` via React Query
  - Workspace operations via `apps/app/src/app/lib/desktop.ts`
  - File ops via `apps/app/src/app/lib/openwork-server.ts`
- No separate `XingjingBridge` singleton or `XingjingOpenworkContext` props
- Session creation via `@opencode-ai/sdk` client directly
- Server-v2 managed resources API for Skills/Commands/Agents CRUD

### Unit 8: Redesign 10-product-shell.md
**Files**: `docs/10-product-shell.md`
- **Integration principle**: products = workspaces; no separate Xingjing auth/shell
- `ProductSwitcher` → becomes a workspace preset filter in the existing `WorkspaceSessionList` sidebar
- Auth: reuse `DenSigninGate` from `react-app/shell/app-root.tsx` (no Solo bypass needed)
- Navigation: Xingjing pages are `/settings/xingjing/*` tabs + workspace sidebar extensions
- Connection status: reuse existing `openwork-connection.ts` indicators

### Unit 9: Redesign 30-autopilot.md
**Files**: `docs/30-autopilot.md`
- **Key change**: Autopilot IS the OpenWork session page — not a new page
- Reuse `SessionPage` + `SessionSurface` + `Composer` from `domains/session/`
- Xingjing-specific additions:
  - `@skill:xxx` mention parsing added to Composer via extension hook
  - Artifact detection: `useEffect` on session messages to detect `.opencode/docs/` writes
  - `SavedFileList` panel injected into SessionPage's right sidebar slot
  - Workspace preset `xingjingMode: true` configures default agent/systemPrompt

### Unit 10: Redesign 40-agent-workshop.md
**Files**: `docs/40-agent-workshop.md`
- Integrate into `/settings/extensions` (existing `domains/settings/pages/extensions.tsx`)
- Agent/Skill CRUD via `apps/server-v2/src/routes/managed.ts` REST API
- Skill editor: extend existing Extensions panel with Xingjing skill templates
- No standalone `agent-registry.ts` — use server-v2 managed resources service

### Unit 11: Redesign 50-product-mode.md + 60-knowledge-base.md
**Files**: `docs/50-product-mode.md`, `docs/60-knowledge-base.md`
- Product Mode: map product directory structure to workspace presets
- Knowledge Base: workspace files in `.opencode/docs/` + OpenCode's built-in memory (AGENTS.md, CLAUDE.md)
- No separate knowledge indexer — rely on OpenCode's file-level context injection
- Memory management: link to `apps/app/src/react-app/shell/session-memory.ts`

### Unit 12: Redesign 70-review.md + 80-settings.md
**Files**: `docs/70-review.md`, `docs/80-settings.md`
- Review: analytics dashboard as a `/settings/xingjing/review` tab
- Settings: add `XingjingSettingsPanel` as a new tab in existing Settings route
- No standalone settings page — extend `domains/settings/shell/` with Xingjing tab

---

## E2E Verification Recipe

Since all work units produce **documentation updates only** (no runtime code changes), verification is:

1. **Path existence check**: For each referenced file path in updated docs, run:
   ```bash
   grep -r "<path>" /path/to/harnesswork/apps/app/src/react-app/ 2>/dev/null || echo "NOT FOUND"
   ```

2. **Symbol existence check**: For each referenced function/hook/component name, run:
   ```bash
   grep -r "functionName" /path/to/harnesswork/apps/app/src/ | head -5
   ```

3. **No SolidJS references**: After update, ensure no remaining SolidJS APIs:
   ```bash
   grep -r "createSignal\|createStore\|createMemo\|createEffect\|solid-js" docs/
   ```

4. **API route verification**: For server-v2 routes referenced in skill/agent docs:
   ```bash
   grep -r "router\." /path/to/harnesswork/apps/server-v2/src/routes/managed.ts | head -20
   ```

**Skip functional e2e** (no runtime changes in these units — purely documentation).

---

## Worker Instructions Template

Each worker receives:
1. The overall goal: audit and rewrite design docs to match React 19 codebase + integrate Xingjing into OpenWork native pages
2. Their specific unit (title, files, what to change)
3. The codebase conventions below
4. The E2E verification recipe above

**Conventions to follow**:
- Write in Chinese (the existing docs are in Chinese)
- Use precise file path references with line numbers where possible
- Verify every claimed file path exists before referencing it: `ls /path && grep -r "symbol" /path`
- Replace all SolidJS patterns with React 19 equivalents
- Use Mermaid diagrams for architecture flows (existing docs do this)
- Keep the same doc structure (numbered §sections, tables, code blocks)
- No aspirational code — only describe what actually exists in the codebase
