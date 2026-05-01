export const SKILL_CONTENTS: Record<string, string> = {
  "workspace-briefing": `# Workspace Briefing

Summarize the current workspace context for the user.
Read the active feature, current iteration todo, and recent focus.
Present a concise briefing in structured format.

category: xingjing.workspace-knowledge
`,

  "feature-head": `# Feature Head Reader

Read the active feature's head document (SDD or PRD).
Find the feature with status: dev in product/features/_index.yml.
Return the document content for review or reference.

category: xingjing.workspace-knowledge
`,

  "iteration-todo": `# Iteration Todo Reader

Read the current active iteration's task list.
Find the most recent in-progress iteration in iterations/tasks/_index.yml.
Return the task list for context or planning.

category: xingjing.workspace-knowledge
`,

  "knowledge-find": `# Knowledge Finder

Search the workspace knowledge base for relevant entries.
Takes a search query and returns matching knowledge articles.
Usage: /knowledge-find <query>

category: xingjing.workspace-knowledge
`,

  "audit-tail": `# Audit Trail Reader

Show the most recent workspace audit events.
Useful for understanding recent changes and activity.
Returns the last 20 audit entries.

category: xingjing.workspace-knowledge
`,
};
