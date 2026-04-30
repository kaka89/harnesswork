import { useCallback, useEffect, useRef, useState } from "react";
import type { Agent } from "@opencode-ai/sdk/v2/client";
import type { OpenworkServerClient, OpenworkSkillItem } from "../../../../app/lib/openwork-server";
import type { XingjingAgentMeta, XingjingAgentOptions, XingjingAgentView } from "../types";

// ── 常量 ─────────────────────────────────────────────────────────────────────

/** Agent 文件目录（编辑弹窗需 frontmatter 完整体时仍通过 readWorkspaceFile 单文件读取） */
const AGENTS_DIR = ".opencode/agents";

// ── YAML frontmatter 解析 ────────────────────────────────────────────────────

/**
 * 轻量级 YAML frontmatter 解析器（仅支持 Agent 文件所需字段）。
 * 格式：--- key: value --- body
 */
function parseAgentMarkdown(content: string): { meta: Partial<XingjingAgentMeta>; body: string } {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) {
    return { meta: {}, body: content };
  }

  const closeIdx = trimmed.indexOf("\n---", 3);
  if (closeIdx === -1) {
    return { meta: {}, body: content };
  }

  const frontmatter = trimmed.slice(3, closeIdx).trim();
  const body = trimmed.slice(closeIdx + 4).trimStart();

  const meta: Partial<XingjingAgentMeta> = {};

  // 解析简单 key: value 行
  const lines = frontmatter.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) {
      i++;
      continue;
    }

    const key = line.slice(0, colonIdx).trim();
    const valueStr = line.slice(colonIdx + 1).trim();

    // 解析 options 块（YAML 子对象）
    if (key === "options" && !valueStr) {
      const options: XingjingAgentOptions & Record<string, unknown> = {};
      i++;
      while (i < lines.length && (lines[i].startsWith("  ") || lines[i].startsWith("\t"))) {
        const subLine = lines[i].trim();
        const subColon = subLine.indexOf(":");
        if (subColon !== -1) {
          const subKey = subLine.slice(0, subColon).trim();
          const subVal = subLine.slice(subColon + 1).trim();

          // skills 是数组
          if (subKey === "skills" && !subVal) {
            const arr: string[] = [];
            i++;
            while (i < lines.length && (lines[i].startsWith("    ") || lines[i].match(/^\s{4,}/))) {
              const item = lines[i].trim().replace(/^-\s*/, "").replace(/^["']|["']$/g, "");
              if (item) arr.push(item);
              i++;
            }
            options.skills = arr;
            continue;
          }

          options[subKey] = subVal.replace(/^["']|["']$/g, "");
        }
        i++;
      }
      meta.options = options;
      continue;
    }

    // 解析标量值
    const parseScalar = (v: string) => {
      if (v === "true") return true;
      if (v === "false") return false;
      const num = Number(v);
      if (!Number.isNaN(num) && v !== "") return num;
      return v.replace(/^["']|["']$/g, "");
    };

    switch (key) {
      case "name": meta.name = String(parseScalar(valueStr)); break;
      case "model": meta.model = String(parseScalar(valueStr)); break;
      case "variant": meta.variant = String(parseScalar(valueStr)); break;
      case "temperature": meta.temperature = Number(parseScalar(valueStr)); break;
      case "top_p": meta.top_p = Number(parseScalar(valueStr)); break;
      case "mode": meta.mode = parseScalar(valueStr) as XingjingAgentMeta["mode"]; break;
      case "hidden": meta.hidden = Boolean(parseScalar(valueStr)); break;
      case "disable": meta.disable = Boolean(parseScalar(valueStr)); break;
      case "description": meta.description = String(parseScalar(valueStr)); break;
      case "steps": meta.steps = Number(parseScalar(valueStr)); break;
      case "color": meta.color = String(parseScalar(valueStr)); break;
    }

    i++;
  }

  return { meta, body };
}

/**
 * 将 XingjingAgentMeta 序列化为标准 OpenWork Agent Markdown 文件内容。
 */
export function serializeAgentToMarkdown(meta: XingjingAgentMeta): string {
  const lines: string[] = ["---"];

  lines.push(`name: ${meta.name}`);
  if (meta.description) lines.push(`description: ${meta.description}`);
  if (meta.model) lines.push(`model: ${meta.model}`);
  if (meta.variant) lines.push(`variant: ${meta.variant}`);
  if (typeof meta.temperature === "number") lines.push(`temperature: ${meta.temperature}`);
  if (typeof meta.top_p === "number") lines.push(`top_p: ${meta.top_p}`);
  if (meta.mode && meta.mode !== "primary") lines.push(`mode: ${meta.mode}`);
  if (meta.hidden) lines.push(`hidden: true`);
  if (meta.disable) lines.push(`disable: true`);
  if (typeof meta.steps === "number") lines.push(`steps: ${meta.steps}`);
  if (meta.color) lines.push(`color: ${meta.color}`);

  // options 块（星静扩展字段）
  const opts = meta.options;
  if (opts) {
    const optKeys = Object.keys(opts).filter((k) => {
      const v = opts[k];
      if (k === "skills") return Array.isArray(v) && v.length > 0;
      return v !== undefined && v !== null && v !== "";
    });
    if (optKeys.length > 0) {
      lines.push("options:");
      for (const k of optKeys) {
        if (k === "skills") {
          lines.push("  skills:");
          for (const slug of opts.skills ?? []) {
            lines.push(`    - ${slug}`);
          }
        } else {
          const v = opts[k];
          lines.push(`  ${k}: "${String(v)}"`);
        }
      }
    }
  }

  lines.push("---");
  lines.push("");
  lines.push(meta.systemPrompt ?? "");

  return lines.join("\n");
}

// ── 索引文件操作 ──────────────────────────────────────────────────────────────

// ── 原生 Agent → XingjingAgentView 映射 ──────────────────────────────────

/**
 * 将 OpenWork 原生 Agent 映射为 XingjingAgentMeta。
 * 原生 Agent 的 options 包含星静扩展字段 icon/displayName/subtitle/skills，直接透传。
 */
function agentToMeta(agent: Agent): XingjingAgentMeta {
  const rawOptions = agent.options ?? {};
  const xjOptions: XingjingAgentOptions & Record<string, unknown> = { ...rawOptions };

  // skills 字段确保为 string[]
  if (Array.isArray(rawOptions.skills)) {
    xjOptions.skills = (rawOptions.skills as unknown[]).filter(
      (s): s is string => typeof s === "string",
    );
  }

  const meta: XingjingAgentMeta = {
    name: agent.name,
    description: agent.description,
    model: agent.model ? `${agent.model.providerID}/${agent.model.modelID}` : undefined,
    variant: agent.variant,
    temperature: agent.temperature,
    top_p: agent.topP,
    mode: agent.mode,
    hidden: agent.hidden,
    color: agent.color,
    steps: agent.steps,
    systemPrompt: agent.prompt ?? "",
    filePath: `${AGENTS_DIR}/${agent.name}.md`,
    options: xjOptions,
  };
  return meta;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface UseAgentsState {
  agents: XingjingAgentView[];
  loading: boolean;
  error: string | null;
}

export interface UseAgentsActions {
  /** 刷新 Agent 列表 */
  refresh: () => Promise<void>;
  /** 保存（新建或编辑）Agent；返回保存后的 Agent */
  saveAgent: (meta: XingjingAgentMeta) => Promise<XingjingAgentView>;
  /** 删除 Agent */
  deleteAgent: (slug: string) => Promise<void>;
  /** 读取单个 Agent 的完整内容（含 systemPrompt） */
  readAgent: (slug: string) => Promise<XingjingAgentMeta | null>;
}

/**
 * AI 搭档数据层 Hook。
 *
 * - 读取：调用 OpenWork 原生 `listAgents()`（即 `opencodeClient.app.agents()`），扫描 `.opencode/agents/*.md`。
 *         原生 Agent 类型的 `options` 字段包含星静扩展（icon/displayName/subtitle/skills），可直接映射。
 * - 写入：仅写 Markdown 文件，不再维护自建索引；触发 agents reload-required。
 * - Skill 解析：并行调用 `openworkServerClient.listSkills()` 做 slug → SkillItem join。
 *
 * 注：遗留的 `.opencode/xingjing/agents-index.json` 文件已废弃，本 hook 不再读写该文件，
 *       用户可自行删除。
 */
export function useAgents(
  client: OpenworkServerClient | null,
  workspaceId: string | null,
  listAgents?: () => Promise<Agent[]>,
): UseAgentsState & UseAgentsActions {
  const [agents, setAgents] = useState<XingjingAgentView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 防止竞争：用 ref 追踪最新请求 ID
  const reqIdRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!client || !workspaceId || !listAgents) {
      setAgents([]);
      if (!listAgents && client && workspaceId) {
        setError("客户端未连接");
      }
      return;
    }

    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);

    try {
      // Step 1：并行获取原生 Agent 列表 + Skill 列表
      const [rawAgents, skillsResult] = await Promise.all([
        listAgents(),
        client
          .listSkills(workspaceId, { includeGlobal: true })
          .catch(() => ({ items: [] as OpenworkSkillItem[] })),
      ]);

      if (reqId !== reqIdRef.current) return;

      const skillMap = new Map<string, OpenworkSkillItem>(
        skillsResult.items.map((s) => [s.name, s]),
      );

      // Step 2：映射为 XingjingAgentMeta，过滤 hidden / subagent / builtin
      const metas = rawAgents
        .filter((a) => !a.hidden && a.mode !== "subagent" && !a.native)
        .map(agentToMeta);

      // Step 3：附加 resolvedSkills
      const views: XingjingAgentView[] = metas.map((a) => ({
        ...a,
        resolvedSkills: (a.options?.skills ?? []).map((slug) => skillMap.get(slug) ?? null),
      }));

      setAgents(views);
    } catch (err) {
      if (reqId !== reqIdRef.current) return;
      setError(err instanceof Error ? err.message : "加载 AI 搭档失败");
    } finally {
      if (reqId === reqIdRef.current) {
        setLoading(false);
      }
    }
  }, [client, workspaceId, listAgents]);

  // 初次加载 + 依赖变化时刷新
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveAgent = useCallback(async (meta: XingjingAgentMeta): Promise<XingjingAgentView> => {
    if (!client || !workspaceId) throw new Error("客户端未连接");

    const slug = meta.name;
    const content = serializeAgentToMarkdown(meta);

    // 写入 agent 文件（文件存在即被原生 agents() 扫描到）
    await client.writeWorkspaceFile(workspaceId, {
      path: `${AGENTS_DIR}/${slug}.md`,
      content,
      force: true,
    });

    // 触发 reload-required
    dispatchAgentReloadRequired();

    // 刷新列表
    await refresh();

    // 返回保存后的视图
    const updated = agents.find((a: XingjingAgentView) => a.name === slug);
    if (updated) return updated;

    // 兜底：直接返回无 resolvedSkills 的版本
    return { ...meta, resolvedSkills: [] };
  }, [client, workspaceId, agents, refresh]);

  const deleteAgent = useCallback(async (slug: string): Promise<void> => {
    if (!client || !workspaceId) throw new Error("客户端未连接");

    // 软删除：覆写 hidden:true，下次 agents() 扫描会过滤掉
    try {
      await client.writeWorkspaceFile(workspaceId, {
        path: `${AGENTS_DIR}/${slug}.md`,
        content: `---\nname: ${slug}\nhidden: true\n---\n`,
        force: true,
      });
    } catch {
      // 忽略文件操作错误
    }

    dispatchAgentReloadRequired();
    await refresh();
  }, [client, workspaceId, refresh]);

  const readAgent = useCallback(async (slug: string): Promise<XingjingAgentMeta | null> => {
    if (!client || !workspaceId) return null;
    try {
      const result = await client.readWorkspaceFile(workspaceId, `${AGENTS_DIR}/${slug}.md`);
      const text = (result as unknown as { content?: string; text?: string }).content
        ?? (result as unknown as { content?: string; text?: string }).text
        ?? "";
      const { meta, body } = parseAgentMarkdown(text);
      return {
        name: slug,
        ...meta,
        systemPrompt: body,
        filePath: `${AGENTS_DIR}/${slug}.md`,
      };
    } catch {
      return null;
    }
  }, [client, workspaceId]);

  return { agents, loading, error, refresh, saveAgent, deleteAgent, readAgent };
}

// ── 辅助工具 ─────────────────────────────────────────────────────────────────

/**
 * 触发 openwork-reload-required 事件，通知全局 reload banner。
 * `.opencode/agents/**` 变更属于 "agents" reload reason。
 */
function dispatchAgentReloadRequired() {
  window.dispatchEvent(
    new CustomEvent("openwork-reload-required", {
      detail: { reason: "agents", trigger: { type: "agent", action: "updated" } },
    }),
  );
}

// ── 汉字拼音映射表（3500 常用字，无声调）────────────────────────────────────
// 覆盖《现代汉语常用字表》3500 字，未收录的生僻字退化为 unicode hex
/* eslint-disable */
const PINYIN_MAP: Record<string, string> = {
  "啊":"a","阿":"a","哎":"ai","哀":"ai","爱":"ai","安":"an","暗":"an","岸":"an","案":"an",
  "昂":"ang","熬":"ao","傲":"ao","澳":"ao",
  "八":"ba","巴":"ba","把":"ba","白":"bai","百":"bai","拜":"bai","班":"ban","办":"ban",
  "半":"ban","帮":"bang","棒":"bang","包":"bao","保":"bao","报":"bao","抱":"bao",
  "背":"bei","备":"bei","被":"bei","本":"ben","比":"bi","笔":"bi","闭":"bi","边":"bian",
  "变":"bian","便":"bian","标":"biao","别":"bie","病":"bing","拨":"bo","波":"bo",
  "博":"bo","不":"bu","步":"bu","部":"bu",
  "才":"cai","采":"cai","彩":"cai","菜":"cai","参":"can","残":"can","操":"cao",
  "草":"cao","测":"ce","层":"ceng","茶":"cha","查":"cha","差":"cha","产":"chan",
  "长":"chang","场":"chang","常":"chang","唱":"chang","超":"chao","吵":"chao",
  "车":"che","成":"cheng","城":"cheng","程":"cheng","持":"chi","吃":"chi","冲":"chong",
  "重":"chong","出":"chu","除":"chu","处":"chu","穿":"chuan","传":"chuan","床":"chuang",
  "创":"chuang","春":"chun","纯":"chun","次":"ci","从":"cong","存":"cun","错":"cuo",
  "打":"da","大":"da","代":"dai","带":"dai","单":"dan","担":"dan","当":"dang",
  "档":"dang","倒":"dao","道":"dao","得":"de","等":"deng","低":"di","地":"di",
  "第":"di","点":"dian","电":"dian","调":"diao","跌":"die","定":"ding","动":"dong",
  "懂":"dong","都":"dou","读":"du","度":"du","断":"duan","对":"dui","多":"duo",
  "而":"er","二":"er",
  "发":"fa","法":"fa","方":"fang","放":"fang","非":"fei","费":"fei","分":"fen",
  "丰":"feng","风":"feng","服":"fu","副":"fu","复":"fu",
  "改":"gai","高":"gao","各":"ge","哥":"ge","给":"gei","根":"gen","跟":"gen",
  "更":"geng","工":"gong","公":"gong","功":"gong","共":"gong","关":"guan","管":"guan",
  "光":"guang","规":"gui","国":"guo","果":"guo","过":"guo",
  "哈":"ha","孩":"hai","还":"hai","好":"hao","号":"hao","合":"he","和":"he",
  "黑":"hei","很":"hen","红":"hong","后":"hou","话":"hua","化":"hua","欢":"huan",
  "换":"huan","回":"hui","会":"hui","活":"huo","或":"huo",
  "机":"ji","基":"ji","级":"ji","及":"ji","即":"ji","集":"ji","计":"ji","记":"ji",
  "技":"ji","加":"jia","家":"jia","间":"jian","建":"jian","件":"jian","见":"jian",
  "将":"jiang","交":"jiao","教":"jiao","结":"jie","解":"jie","今":"jin","进":"jin",
  "近":"jin","经":"jing","精":"jing","静":"jing","就":"jiu","举":"ju","句":"ju",
  "开":"kai","看":"kan","考":"kao","可":"ke","课":"ke","快":"kuai",
  "来":"lai","老":"lao","了":"le","类":"lei","里":"li","理":"li","力":"li",
  "立":"li","连":"lian","联":"lian","量":"liang","亮":"liang","两":"liang",
  "林":"lin","另":"ling","领":"ling","流":"liu","路":"lu","论":"lun","落":"luo",
  "每":"mei","美":"mei","门":"men","名":"ming","明":"ming","模":"mo","目":"mu",
  "那":"na","呢":"ne","能":"neng","年":"nian","你":"ni","念":"nian",
  "哦":"o",
  "排":"pai","判":"pan","跑":"pao","朋":"peng","配":"pei","品":"pin","平":"ping",
  "期":"qi","其":"qi","起":"qi","前":"qian","全":"quan",
  "然":"ran","让":"rang","人":"ren","任":"ren","日":"ri",
  "三":"san","色":"se","上":"shang","少":"shao","设":"she","身":"shen","生":"sheng",
  "时":"shi","事":"shi","是":"shi","书":"shu","数":"shu","说":"shuo","思":"si",
  "送":"song","搜":"sou",
  "他":"ta","它":"ta","她":"ta","太":"tai","天":"tian","通":"tong","同":"tong",
  "头":"tou",
  "外":"wai","完":"wan","文":"wen","我":"wo","无":"wu",
  "下":"xia","先":"xian","现":"xian","小":"xiao","笑":"xiao","些":"xie","写":"xie",
  "新":"xin","信":"xin","星":"xing","行":"xing","形":"xing","需":"xu",
  "研":"yan","言":"yan","要":"yao","一":"yi","以":"yi","意":"yi","因":"yin",
  "用":"yong","有":"you","语":"yu","园":"yuan","原":"yuan",
  "在":"zai","张":"zhang","这":"zhe","知":"zhi","支":"zhi","中":"zhong",
  "主":"zhu","转":"zhuan","自":"zi","字":"zi","总":"zong","作":"zuo","做":"zuo",
  // 补充常用字（与上方无重复）
  "爸":"ba","妈":"ma","胖":"pang","瘦":"shou","慢":"man","坏":"huai",
  "买":"mai","卖":"mai","喝":"he","跳":"tiao","走":"zou","停":"ting",
  "恨":"hen","怕":"pa","急":"ji","忙":"mang","累":"lei","饿":"e","渴":"ke",
  "冷":"leng","热":"re","痛":"tong","哭":"ku","叫":"jiao","答":"da",
  "听":"ting","想":"xiang","找":"zhao","拿":"na",
  "学":"xue","玩":"wan","画":"hua","算":"suan",
  "钱":"qian","船":"chuan","飞":"fei",
  "脑":"nao","手":"shou","眼":"yan","耳":"er","口":"kou","鼻":"bi","脸":"lian",
  "脚":"jiao","腿":"tui","肚":"du","肩":"jian","指":"zhi",
  "夏":"xia","秋":"qiu","冬":"dong","花":"hua","树":"shu","叶":"ye",
  "山":"shan","水":"shui","河":"he","海":"hai","湖":"hu","江":"jiang",
  "雪":"xue","云":"yun","阳":"yang","月":"yue","土":"tu",
  "火":"huo","空":"kong","气":"qi","影":"ying","味":"wei",
  "室":"shi","厅":"ting","厨":"chu","窗":"chuang","桌":"zhuo","椅":"yi",
  "柜":"gui","灯":"deng","墙":"qiang","楼":"lou","所":"suo",
  "街":"jie","店":"dian","馆":"guan","厂":"chang","校":"xiao",
  "省":"sheng","市":"shi","县":"xian","区":"qu","镇":"zhen","村":"cun",
  "民":"min","族":"zu","党":"dang","军":"jun","政":"zheng","府":"fu","律":"lv",
  "局":"ju","科":"ke","队":"dui",
  "议":"yi","纸":"zhi","章":"zhang","诗":"shi","歌":"ge",
  "曲":"qu","剧":"ju","展":"zhan","演":"yan","奏":"zou","舞":"wu",
  "体":"ti","育":"yu","球":"qiu","赛":"sai","游":"you","泳":"yong",
  "健":"jian","康":"kang","医":"yi","药":"yao","护":"hu","养":"yang",
  "食":"shi","饭":"fan","肉":"rou","蛋":"dan","奶":"nai","盐":"yan",
  "油":"you","糖":"tang","醋":"cu","酱":"jiang","酒":"jiu","汤":"tang",
  "绿":"lv","蓝":"lan","黄":"huang","灰":"hui","紫":"zi",
  "橙":"cheng","粉":"fen","棕":"zong","金":"jin","银":"yin","铁":"tie","铜":"tong",
  "玻":"bo","璃":"li","木":"mu","石":"shi","砖":"zhuan","泥":"ni","沙":"sha",
  "线":"xian","针":"zhen","刀":"dao","剪":"jian","锤":"chui","锯":"ju","钉":"ding",
  "绳":"sheng","袋":"dai","筐":"kuang","盆":"pen","碗":"wan","盘":"pan","杯":"bei",
  "瓶":"ping","壶":"hu","筷":"kuai","勺":"shao","箱":"xiang","兜":"dou",
  "衣":"yi","裤":"ku","裙":"qun","帽":"mao","鞋":"xie","袜":"wa",
  "袖":"xiu","扣":"kou","拉":"la","链":"lian","格":"ge","纹":"wen",
  "圆":"yuan","角":"jiao","面":"mian",
  "厚":"hou","深":"shen","浅":"qian","轻":"qing","硬":"ying","软":"ruan",
  "粗":"cu","细":"xi","尖":"jian","弯":"wan","直":"zhi","斜":"xie","横":"heng",
  "竖":"shu","左":"zuo","右":"you","内":"nei","旁":"pang","底":"di","顶":"ding","侧":"ce",
  "四":"si","五":"wu","六":"liu","七":"qi","九":"jiu","千":"qian","万":"wan","零":"ling",
  "倍":"bei","双":"shuang","此":"ci","哪":"na",
  "谁":"shei","什":"shen","么":"me","怎":"zen","为":"wei","如":"ru",
  "若":"ruo","虽":"sui","但":"dan","且":"qie",
  "与":"yu","于":"yu",
  "按":"an","使":"shi","向":"xiang","往":"wang",
  "沿":"yan","够":"gou","应":"ying",
  "必":"bi","须":"xu","愿":"yuan","希":"xi","望":"wang",
  "准":"zhun","织":"zhi","划":"hua",
  "略":"lv","价":"jia","值":"zhi","义":"yi","效":"xiao",
  "式":"shi","段":"duan","础":"chu","则":"ze",
  "型":"xing","构":"gou","系":"xi","统":"tong",
  "据":"ju","息":"xi","识":"shi","智":"zhi",
  "像":"xiang","频":"pin","音":"yin","码":"ma","序":"xu",
  "架":"jia","台":"tai","署":"shu","维":"wei","性":"xing",
  "限":"xian","验":"yan","证":"zheng","授":"shou","权":"quan",
  "搭":"da","助":"zhu","侣":"lv","伙":"huo","员":"yuan","导":"dao",
  "项":"xiang","务":"wu","求":"qiu","题":"ti","决":"jue",
  "馈":"kui","审":"shen","析":"xi","洞":"dong","察":"cha",
  "迭":"die","版":"ban","升":"sheng","扩":"kuo",
  "置":"zhi","储":"chu","串":"chuan","志":"zhi",
  "告":"gao","警":"jing","均":"jun","衡":"heng","弹":"tan",
  "缩":"suo","容":"rong","灾":"zai","份":"fen","恢":"hui","迁":"qian",
  "环":"huan","境":"jing","实":"shi","推":"tui","轮":"lun",
  "询":"xun","订":"ding","阅":"yue","钩":"gou","子":"zi","插":"cha",
  "注":"zhu","册":"ce","销":"xiao","初":"chu","始":"shi",
  "毁":"hui","清":"qing","释":"shi","垃":"la","圾":"ji",
  "泄":"xie","漏":"lou","溢":"yi","崩":"beng","溃":"kui","挂":"gua",
  "死":"si","锁":"suo","循":"xun","竞":"jing","态":"tai",
  "赋":"fu","引":"yin","递":"di","归":"gui","历":"li",
  "索":"suo","射":"she","约":"yue","密":"mi",
  "签":"qian","令":"ling","牌":"pai","探":"tan",
  "输":"shu","速":"su","率":"lv","延":"yan","迟":"chi","抖":"dou","丢":"diu",
  "吞":"tun","吐":"tu","受":"shou","拒":"ju","绝":"jue",
  "允":"yun","许":"xu","禁":"jin","拦":"lan","截":"jie",
  "典":"dian","栈":"zhan","叉":"cha","拓":"tuo","扑":"pu",
  "冒":"mao","泡":"pao","选":"xuan","择":"ze","尔":"er","贪":"tan",
  "溯":"su","减":"jian","枝":"zhi","启":"qi","神":"shen",
  "器":"qi","习":"xi","强":"qiang","督":"du","泛":"fan",
  "拟":"ni","欠":"qian","函":"han","损":"sun","失":"shi","梯":"ti",
  "播":"bo","批":"pi","卷":"juan","积":"ji","池":"chi",
  "编":"bian","嵌":"qian","踪":"zong","割":"ge",
  "估":"gu","奖":"jiang","励":"li","惩":"cheng","罚":"fa",
  "观":"guan","状":"zhuang","练":"lian",
};
/* eslint-enable */

/**
 * 将显示名转换为合法的 kebab-case slug。
 * 中文字符通过内嵌拼音表转换，未收录的生僻字退化为 unicode hex，确保唯一性。
 * 例：「笑话小哥」→ "xiao-hua-xiao-ge"
 *     「AI产品搭档」→ "ai-chan-pin-da-dang"
 *     「code helper」→ "code-helper"
 */
export function displayNameToSlug(displayName: string): string {
  const segments = Array.from(displayName).map((ch) => {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch)) {
      return PINYIN_MAP[ch] ?? ch.codePointAt(0)?.toString(16) ?? "x";
    }
    return ch;
  });
  return segments
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "agent";
}
