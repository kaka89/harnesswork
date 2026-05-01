import type { OpenworkServerClient } from "../../../../../app/lib/openwork-server";
import { SKILL_CONTENTS } from "../assets/skill-contents";

export interface SkillDef {
  name: string;
  description: string;
  trigger?: string;
  content: string;
}

export const WK_SKILLS: SkillDef[] = [
  { name: "workspace-briefing",    description: "Summarize workspace context",             trigger: "/ws-briefing",    content: SKILL_CONTENTS["workspace-briefing"] },
  { name: "feature-head",          description: "Read active feature head document",       trigger: "/feature-head",   content: SKILL_CONTENTS["feature-head"] },
  { name: "iteration-todo",        description: "Read active iteration todo",              trigger: "/iteration-todo", content: SKILL_CONTENTS["iteration-todo"] },
  { name: "knowledge-find",        description: "Search knowledge base",                   trigger: "/knowledge-find", content: SKILL_CONTENTS["knowledge-find"] },
  { name: "audit-tail",            description: "Show recent audit trail",                 trigger: "/audit-tail",     content: SKILL_CONTENTS["audit-tail"] },
];

export async function registerSkills(
  client: OpenworkServerClient,
  workspaceId: string,
): Promise<void> {
  for (const skill of WK_SKILLS) {
    // upsertSkill API 只支持 { name, content, description? }
    // trigger 通过内嵌在 skill content 中实现，不作为 API 参数
    await client.upsertSkill(workspaceId, {
      name: skill.name,
      description: skill.description,
      content: skill.content,
    });
  }
}

export async function listRegisteredSkills(
  client: OpenworkServerClient,
  workspaceId: string,
) {
  const all = await client.listSkills(workspaceId);
  const names = new Set(WK_SKILLS.map((s) => s.name));
  return (Array.isArray(all) ? all : (all as { items?: unknown[] }).items ?? []).filter(
    (s) => names.has((s as { name: string }).name),
  );
}
