/**
 * 种子 Agent 加载器
 *
 * 通过 Vite `?raw` 将种子 .md 文件内容捆绑到构建产物中。
 * 此文件不包含任何 Agent 属性定义，仅负责将 .md 文件内容引入运行时。
 * 运行时解析（frontmatter + body）由 agent-registry.ts 负责。
 */

import productBrain from '../agents/seeds/product-brain.md?raw';
import engBrain from '../agents/seeds/eng-brain.md?raw';
import growthBrain from '../agents/seeds/growth-brain.md?raw';
import opsBrain from '../agents/seeds/ops-brain.md?raw';
import pmAgent from '../agents/seeds/pm-agent.md?raw';
import archAgent from '../agents/seeds/arch-agent.md?raw';
import devAgent from '../agents/seeds/dev-agent.md?raw';
import qaAgent from '../agents/seeds/qa-agent.md?raw';
import sreAgent from '../agents/seeds/sre-agent.md?raw';
import mgrAgent from '../agents/seeds/mgr-agent.md?raw';

/** 种子 Agent 文件内容映射：agentId → raw .md content */
const SEED_FILES: ReadonlyMap<string, string> = new Map([
  ['product-brain', productBrain],
  ['eng-brain', engBrain],
  ['growth-brain', growthBrain],
  ['ops-brain', opsBrain],
  ['pm-agent', pmAgent],
  ['arch-agent', archAgent],
  ['dev-agent', devAgent],
  ['qa-agent', qaAgent],
  ['sre-agent', sreAgent],
  ['mgr-agent', mgrAgent],
]);

/** 获取所有种子 Agent 的 raw .md 内容映射 */
export function getSeedAgentFiles(): ReadonlyMap<string, string> {
  return SEED_FILES;
}

/** 获取所有种子 Agent ID 集合 */
export function getSeedAgentIds(): ReadonlySet<string> {
  return new Set(SEED_FILES.keys());
}
