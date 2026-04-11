import React, { useState } from 'react';
import {
  Card, Row, Col, Tag, Typography, Badge, Drawer, Button, Checkbox, Space,
  Alert, Divider, Empty, message, Tooltip, Modal, Input, Form,
  Tabs, Timeline, Collapse, Select, Switch,
} from 'antd';
import {
  TeamOutlined, PlusOutlined, DeleteOutlined, CheckCircleOutlined,
  ClockCircleOutlined, PlayCircleOutlined, RobotOutlined,
  RocketOutlined, ThunderboltOutlined,
  EditOutlined, ExclamationCircleOutlined, LoadingOutlined,
  ApiOutlined, HolderOutlined, AppstoreOutlined, MinusCircleOutlined,
  CodeOutlined,
} from '@ant-design/icons';
import {
  DndContext, closestCenter, DragEndEvent,
  PointerSensor, useSensor, useSensors, DragOverlay, DragStartEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  teamAgents, AgentDef,
} from '../../mock/autopilot';
import {
  teamSkillPool, SkillDef, SkillInputParam, AgentAssignment,
  initialEnterpriseAssignments,
  agentColorPresets, emojiPresets, ColorPreset,
  TaskOrchestration, teamOrchestrations,
} from '../../mock/agentWorkshop';
import { taskList } from '../../mock/tasks';

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

const taskStatusTag: Record<string, { label: string; color: string }> = {
  'todo':      { label: '待办', color: 'default' },
  'in-dev':    { label: '开发中', color: 'processing' },
  'in-review': { label: '评审中', color: 'warning' },
  'done':      { label: '已完成', color: 'success' },
};

const assignStatusIcon: Record<string, React.ReactNode> = {
  assigned: <ClockCircleOutlined style={{ color: '#faad14' }} />,
  working:  <PlayCircleOutlined style={{ color: '#1264e5' }} />,
  done:     <CheckCircleOutlined style={{ color: '#52c41a' }} />,
};

const skillStatusConfig: Record<string, { color: string; text: string; icon: React.ReactNode }> = {
  done:    { color: '#52c41a', text: '已完成', icon: <CheckCircleOutlined /> },
  running: { color: '#1264e5', text: '执行中', icon: <LoadingOutlined /> },
  pending: { color: '#d9d9d9', text: '待执行', icon: <ClockCircleOutlined /> },
};

const categoryColor: Record<string, string> = {
  '产品': '#1264e5', '架构': '#722ed1', '开发': '#08979c',
  '质量': '#d46b08', '运维': '#389e0d', '管理': '#cf1322',
};

const teamCategoryOptions = ['产品', '架构', '开发', '质量', '运维', '管理'];

let agentIdCounter = 100;
let skillIdCounter = 500;

// ─── SortableSkillCard ─────────────────────────────────────────────────
interface SortableSkillCardProps {
  skillName: string;
  skillDef: SkillDef | undefined;
  borderColor: string;
  status: 'done' | 'running' | 'pending' | null;
  onRemove: () => void;
  onEdit: (def: SkillDef) => void;
}

const SortableSkillCard: React.FC<SortableSkillCardProps> = ({
  skillName, skillDef, borderColor, status, onRemove, onEdit,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: skillName });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    marginBottom: 8,
  };
  const cat = skillDef?.category || '';
  const statusCfg = status ? skillStatusConfig[status] : null;

  return (
    <div ref={setNodeRef} style={style}>
      <Card
        size="small"
        style={{ borderRadius: 8, border: `1px solid ${borderColor}`, background: '#fff' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          {/* Drag handle */}
          <div
            {...listeners}
            {...attributes}
            style={{ cursor: 'grab', color: '#ccc', paddingTop: 2, flexShrink: 0 }}
          >
            <HolderOutlined />
          </div>
          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              {cat && (
                <div style={{ width: 4, height: 16, borderRadius: 2, background: categoryColor[cat] || '#d9d9d9', flexShrink: 0 }} />
              )}
              <Text strong style={{ fontSize: 13 }}>{skillName}</Text>
              {cat && (
                <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }} color={categoryColor[cat]}>
                  {cat}
                </Tag>
              )}
              {statusCfg && (
                <Tooltip title={statusCfg.text}>
                  <Badge status={status === 'running' ? 'processing' : status === 'done' ? 'success' : 'default'} />
                </Tooltip>
              )}
            </div>
            {skillDef && (
              <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{skillDef.description}</Text>
            )}
          </div>
          {/* Actions */}
          <Space size={4} style={{ flexShrink: 0 }}>
            {skillDef && (
              <Tooltip title="编辑 Skill">
                <EditOutlined
                  style={{ fontSize: 12, color: '#1264e5', cursor: 'pointer' }}
                  onClick={() => onEdit(skillDef)}
                />
              </Tooltip>
            )}
            <Tooltip title="移除">
              <DeleteOutlined
                style={{ fontSize: 12, color: '#bfbfbf', cursor: 'pointer' }}
                onClick={onRemove}
              />
            </Tooltip>
          </Space>
        </div>
      </Card>
    </div>
  );
};

// ─── DraggablePoolSkill ─────────────────────────────────────────────────
interface DraggablePoolSkillProps {
  skill: SkillDef;
  onDirectAdd: (skillName: string) => void;
  onEdit: (def: SkillDef) => void;
}

const DraggablePoolSkill: React.FC<DraggablePoolSkillProps> = ({ skill, onDirectAdd, onEdit }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `pool__${skill.name}` });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const cat = skill.category;

  return (
    <div ref={setNodeRef} style={style}>
      <Card
        size="small"
        style={{
          borderRadius: 8, border: `1px solid ${categoryColor[cat] || '#d9d9d9'}33`,
          background: '#fafafa', cursor: 'grab', marginBottom: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div {...listeners} {...attributes} style={{ cursor: 'grab', color: '#ccc', flexShrink: 0 }}>
            <HolderOutlined style={{ fontSize: 12 }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Text strong style={{ fontSize: 12 }}>{skill.name}</Text>
              <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }} color={categoryColor[cat]}>{cat}</Tag>
            </div>
            <Text type="secondary" style={{ fontSize: 11 }}>{skill.description}</Text>
          </div>
          <Space size={4} style={{ flexShrink: 0 }}>
            <Tooltip title="编辑">
              <EditOutlined style={{ fontSize: 11, color: '#1264e5', cursor: 'pointer' }} onClick={() => onEdit(skill)} />
            </Tooltip>
            <Tooltip title="添加到 Agent">
              <PlusOutlined style={{ fontSize: 11, color: '#52c41a', cursor: 'pointer' }} onClick={() => onDirectAdd(skill.name)} />
            </Tooltip>
          </Space>
        </div>
      </Card>
    </div>
  );
};

// ─── Agent Drop Zone (wraps agent skill list) ────────────────────────
const AgentSkillDropZone: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isOver, setNodeRef } = useDroppable({ id: 'agent-skill-list' });
  return (
    <div
      ref={setNodeRef}
      style={{
        minHeight: 60,
        border: `2px dashed ${isOver ? '#1264e5' : 'transparent'}`,
        borderRadius: 8,
        background: isOver ? '#e6f0ff' : 'transparent',
        transition: 'all 0.2s',
        padding: isOver ? 4 : 0,
      }}
    >
      {children}
    </div>
  );
};

// ─── Skill Edit Modal ───────────────────────────────────────────────────
interface SkillEditModalProps {
  open: boolean;
  editingSkill: SkillDef | null;
  onClose: () => void;
  onSave: (skill: SkillDef) => void;
  categoryOptions: string[];
}

const SkillEditModal: React.FC<SkillEditModalProps> = ({
  open, editingSkill, onClose, onSave, categoryOptions,
}) => {
  const [form] = Form.useForm();
  const [inputParams, setInputParams] = useState<SkillInputParam[]>([]);

  React.useEffect(() => {
    if (open) {
      if (editingSkill) {
        form.setFieldsValue({
          name: editingSkill.name,
          category: editingSkill.category,
          description: editingSkill.description,
          trigger: editingSkill.trigger || '',
          systemPrompt: editingSkill.systemPrompt || '',
          outputType: editingSkill.outputType || '',
        });
        setInputParams(editingSkill.inputParams ? [...editingSkill.inputParams] : []);
      } else {
        form.resetFields();
        setInputParams([]);
      }
    }
  }, [open, editingSkill, form]);

  const handleOk = () => {
    form.validateFields().then((values) => {
      const skill: SkillDef = {
        id: editingSkill?.id || `es-custom-${++skillIdCounter}`,
        name: values.name,
        category: values.category,
        description: values.description,
        trigger: values.trigger || undefined,
        systemPrompt: values.systemPrompt || undefined,
        outputType: values.outputType || undefined,
        inputParams: inputParams.length > 0 ? inputParams : undefined,
      };
      onSave(skill);
    });
  };

  const addParam = () => setInputParams((p) => [...p, { name: '', type: 'string', required: true, description: '' }]);
  const removeParam = (idx: number) => setInputParams((p) => p.filter((_, i) => i !== idx));
  const updateParam = (idx: number, field: keyof SkillInputParam, value: string | boolean) => {
    setInputParams((p) => p.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  };

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CodeOutlined style={{ color: '#1264e5' }} />
          {editingSkill ? `编辑 Skill：${editingSkill.name}` : '新建 Skill'}
        </div>
      }
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      okText={editingSkill ? '保存' : '创建'}
      cancelText="取消"
      width={640}
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Row gutter={12}>
          <Col span={14}>
            <Form.Item name="name" label="Skill 名称" rules={[{ required: true, message: '请输入名称' }]}>
              <Input placeholder="如：需求分析" />
            </Form.Item>
          </Col>
          <Col span={10}>
            <Form.Item name="category" label="分类" rules={[{ required: true, message: '请选择分类' }]}>
              <Select options={categoryOptions.map((c) => ({ label: c, value: c }))} placeholder="选择分类" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="description" label="描述" rules={[{ required: true, message: '请输入描述' }]}>
          <Input placeholder="一句话描述该 Skill 的核心功能" />
        </Form.Item>
        <Form.Item name="trigger" label="触发方式">
          <Input placeholder="如：prd_approved 事件 / 手动调用" />
        </Form.Item>
        <Form.Item name="systemPrompt" label="System Prompt">
          <TextArea
            rows={5}
            placeholder="定义 Skill 执行时 AI 的角色、规则和约束..."
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
        </Form.Item>
        <Form.Item name="outputType" label="输出类型">
          <Input placeholder="如：file / list[UserStory] / string" />
        </Form.Item>

        {/* Input Parameters */}
        <Form.Item label="输入参数">
          <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12 }}>
            {inputParams.map((param, idx) => (
              <div
                key={idx}
                style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap' }}
              >
                <Input
                  size="small" style={{ width: 120 }} placeholder="参数名"
                  value={param.name} onChange={(e) => updateParam(idx, 'name', e.target.value)}
                />
                <Input
                  size="small" style={{ width: 160 }} placeholder="类型（如 string）"
                  value={param.type} onChange={(e) => updateParam(idx, 'type', e.target.value)}
                />
                <Tooltip title="必填">
                  <Switch
                    size="small" checked={param.required}
                    onChange={(v) => updateParam(idx, 'required', v)}
                    checkedChildren="必" unCheckedChildren="选"
                  />
                </Tooltip>
                <Input
                  size="small" style={{ flex: 1, minWidth: 120 }} placeholder="描述"
                  value={param.description} onChange={(e) => updateParam(idx, 'description', e.target.value)}
                />
                <MinusCircleOutlined
                  style={{ color: '#ff4d4f', cursor: 'pointer', paddingTop: 6 }}
                  onClick={() => removeParam(idx)}
                />
              </div>
            ))}
            <Button size="small" icon={<PlusOutlined />} type="dashed" onClick={addParam} style={{ width: '100%' }}>
              添加参数
            </Button>
          </div>
        </Form.Item>
      </Form>
    </Modal>
  );
};

// ─── Main Component ─────────────────────────────────────────────────────
const AgentWorkshop: React.FC = () => {
  const [agents, setAgents] = useState<AgentDef[]>([...teamAgents]);
  const [agentSkills, setAgentSkills] = useState<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {};
    teamAgents.forEach((a) => { map[a.id] = [...a.skills]; });
    return map;
  });
  const [assignments, setAssignments] = useState<AgentAssignment[]>([...initialEnterpriseAssignments]);
  const [orchestrations, setOrchestrations] = useState<TaskOrchestration[]>([...teamOrchestrations]);
  const [selectedAgent, setSelectedAgent] = useState<AgentDef | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pendingTasks, setPendingTasks] = useState<string[]>([]);
  const [skillPool, setSkillPool] = useState<SkillDef[]>([...teamSkillPool]);

  // Agent CRUD modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentDef | null>(null);
  const [agentForm] = Form.useForm();
  const [selectedEmoji, setSelectedEmoji] = useState('🤖');
  const [selectedColor, setSelectedColor] = useState<ColorPreset>(agentColorPresets[0]);

  // Skill Edit modal
  const [skillModalOpen, setSkillModalOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<SkillDef | null>(null);
  const [activeSkillDragId, setActiveSkillDragId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const openDrawer = (agent: AgentDef) => {
    setSelectedAgent(agent);
    const assigned = assignments.filter((a) => a.agentId === agent.id).map((a) => a.taskId);
    setPendingTasks(assigned);
    setDrawerOpen(true);
  };

  const getAssignedCount = (agentId: string) =>
    assignments.filter((a) => a.agentId === agentId).length;

  const addSkill = (agentId: string, skillName: string) => {
    if ((agentSkills[agentId] || []).includes(skillName)) {
      message.warning(`${skillName} 已在该 AI搭档中`);
      return;
    }
    setAgentSkills((prev) => ({ ...prev, [agentId]: [...(prev[agentId] || []), skillName] }));
    message.success(`已添加 Skill: ${skillName}`);
  };

  const removeSkill = (agentId: string, skillName: string) => {
    setAgentSkills((prev) => ({ ...prev, [agentId]: (prev[agentId] || []).filter((s) => s !== skillName) }));
  };

  const confirmAssignment = () => {
    if (!selectedAgent) return;
    const agentId = selectedAgent.id;
    const existing = assignments.filter((a) => a.agentId !== agentId);
    const newAssignments = pendingTasks.map((taskId) => {
      const prev = assignments.find((a) => a.agentId === agentId && a.taskId === taskId);
      return { agentId, taskId, status: prev?.status || 'assigned' as const };
    });
    setAssignments([...existing, ...newAssignments]);
    message.success(`已为 ${selectedAgent.name} 指派 ${pendingTasks.length} 个任务`);
  };

  const getAvailableSkills = (agentId: string) => {
    const current = agentSkills[agentId] || [];
    return skillPool.filter((s) => !current.includes(s.name));
  };

  const getSkillStatus = (agentId: string, skillName: string): 'done' | 'running' | 'pending' | null => {
    const agentOrchs = orchestrations.filter((o) => o.agentId === agentId);
    let latestStatus: 'done' | 'running' | 'pending' | null = null;
    for (const orch of agentOrchs) {
      for (const step of orch.steps) {
        if (step.skillName === skillName) {
          if (step.status === 'running') return 'running';
          if (step.status === 'done') latestStatus = 'done';
          else if (!latestStatus) latestStatus = step.status;
        }
      }
    }
    return latestStatus;
  };

  const findSkillDef = (name: string): SkillDef | undefined =>
    skillPool.find((s) => s.name === name);

  // ─── DnD handlers ───
  const handleDragStart = (event: DragStartEvent) => {
    setActiveSkillDragId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveSkillDragId(null);
    if (!selectedAgent) return;
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // Drag from pool to agent list
    if (activeId.startsWith('pool__')) {
      const skillName = activeId.replace('pool__', '');
      if (overId === 'agent-skill-list' || !overId.startsWith('pool__')) {
        addSkill(selectedAgent.id, skillName);
      }
      return;
    }

    // Reorder within agent list
    const currentSkills = agentSkills[selectedAgent.id] || [];
    if (activeId !== overId && currentSkills.includes(activeId) && currentSkills.includes(overId)) {
      const oldIndex = currentSkills.indexOf(activeId);
      const newIndex = currentSkills.indexOf(overId);
      const reordered = arrayMove(currentSkills, oldIndex, newIndex);
      setAgentSkills((prev) => ({ ...prev, [selectedAgent.id]: reordered }));
    }
  };

  // ─── Skill Modal ───
  const openNewSkillModal = () => {
    setEditingSkill(null);
    setSkillModalOpen(true);
  };

  const openEditSkillModal = (skill: SkillDef) => {
    setEditingSkill(skill);
    setSkillModalOpen(true);
  };

  const handleSkillSave = (skill: SkillDef) => {
    if (editingSkill) {
      setSkillPool((prev) => prev.map((s) => (s.id === editingSkill.id ? skill : s)));
      // Update agent skill names if name changed
      if (skill.name !== editingSkill.name) {
        setAgentSkills((prev) => {
          const updated = { ...prev };
          Object.keys(updated).forEach((agentId) => {
            updated[agentId] = updated[agentId].map((n) => (n === editingSkill.name ? skill.name : n));
          });
          return updated;
        });
      }
      message.success(`Skill "${skill.name}" 已更新`);
    } else {
      setSkillPool((prev) => [...prev, skill]);
      // Auto-add to current agent if drawer open
      if (selectedAgent) {
        addSkill(selectedAgent.id, skill.name);
      }
      message.success(`Skill "${skill.name}" 已创建`);
    }
    setSkillModalOpen(false);
  };

  // ─── Agent CRUD ───
  const openCreateModal = () => {
    setEditingAgent(null);
    setSelectedEmoji('🤖');
    setSelectedColor(agentColorPresets[0]);
    agentForm.resetFields();
    setModalOpen(true);
  };

  const openEditModal = (agent: AgentDef) => {
    setEditingAgent(agent);
    setSelectedEmoji(agent.emoji);
    const matchColor = agentColorPresets.find((c) => c.color === agent.color) || agentColorPresets[0];
    setSelectedColor(matchColor);
    agentForm.setFieldsValue({ name: agent.name, role: agent.role, description: agent.description });
    setDrawerOpen(false);
    setModalOpen(true);
  };

  const handleModalOk = () => {
    agentForm.validateFields().then((values) => {
      if (editingAgent) {
        const updated: AgentDef = {
          ...editingAgent, name: values.name, role: values.role, description: values.description,
          emoji: selectedEmoji, color: selectedColor.color, bgColor: selectedColor.bgColor, borderColor: selectedColor.borderColor,
        };
        setAgents((prev) => prev.map((a) => (a.id === editingAgent.id ? updated : a)));
        if (selectedAgent?.id === editingAgent.id) setSelectedAgent(updated);
        message.success(`AI搭档“${values.name}”已更新`);
      } else {
        const newId = `custom-agent-${++agentIdCounter}`;
        const newAgent: AgentDef = {
          id: newId, name: values.name, role: values.role, description: values.description,
          emoji: selectedEmoji, color: selectedColor.color, bgColor: selectedColor.bgColor, borderColor: selectedColor.borderColor,
          skills: [],
        };
        setAgents((prev) => [...prev, newAgent]);
        setAgentSkills((prev) => ({ ...prev, [newId]: [] }));
        message.success(`AI搭档“${values.name}”已创建`);
      }
      setModalOpen(false);
      agentForm.resetFields();
    });
  };

  const handleDelete = (agent: AgentDef) => {
    Modal.confirm({
      title: `确认删除 ${agent.name}？`,
      icon: <ExclamationCircleOutlined />,
      content: '删除后该 AI搭档的所有 Skill 配置和任务指派将被清除，此操作不可撤销。',
      okText: '删除', okType: 'danger', cancelText: '取消',
      onOk: () => {
        setAgents((prev) => prev.filter((a) => a.id !== agent.id));
        setAssignments((prev) => prev.filter((a) => a.agentId !== agent.id));
        setOrchestrations((prev) => prev.filter((o) => o.agentId !== agent.id));
        setAgentSkills((prev) => { const n = { ...prev }; delete n[agent.id]; return n; });
        setDrawerOpen(false);
        setSelectedAgent(null);
        message.success(`AI搭档“${agent.name}”已删除`);
      },
    });
  };

  // ─── Render ──────────────────────────────────────────────────────────
  return (
    <div>
      <Alert
        type="info" showIcon icon={<TeamOutlined />}
        message="团队版 AI搭档"
        description="每个 AI搭档对应一个专业角色，拥有独立的 Skill 集合。AI搭档通过调度和编排 Skill 完成指派的任务。支持拖拽排序 Skill、从 Skill 池拖入 AI搭档、新建和编辑 Skill。"
        style={{ marginBottom: 24, borderRadius: 8 }}
      />

      <Row gutter={[16, 16]} style={{ alignItems: 'stretch' }}>
        {agents.map((agent) => {
          const skills = agentSkills[agent.id] || [];
          const count = getAssignedCount(agent.id);
          return (
            <Col xs={24} sm={12} lg={8} key={agent.id} style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                {count > 0 && (
                  <div style={{
                    position: 'absolute', top: -8, right: -8, zIndex: 10,
                    minWidth: 20, height: 20,
                    background: agent.color, color: '#fff',
                    borderRadius: 10, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 11, fontWeight: 600,
                    padding: '0 6px', boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                  }}>{count}</div>
                )}
                <Card
                  hoverable onClick={() => openDrawer(agent)}
                  style={{ borderRadius: 12, border: `1px solid ${agent.borderColor}`, background: `linear-gradient(135deg, ${agent.bgColor} 0%, #fff 100%)`, width: '100%', height: '100%' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 28 }}>{agent.emoji}</span>
                    <div>
                      <Text strong style={{ fontSize: 15 }}>{agent.name}</Text>
                      <br />
                      <Text type="secondary" style={{ fontSize: 12 }}>{agent.role}</Text>
                    </div>
                  </div>
                  <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>{agent.description}</Paragraph>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {skills.slice(0, 3).map((s) => {
                      const def = findSkillDef(s);
                      const cat = def?.category || '';
                      const status = getSkillStatus(agent.id, s);
                      return (
                        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6, background: '#fff', border: `1px solid ${agent.borderColor}`, fontSize: 11 }}>
                          {status && <span style={{ color: skillStatusConfig[status]?.color, fontSize: 10 }}>{skillStatusConfig[status]?.icon}</span>}
                          <span style={{ fontWeight: 500 }}>{s}</span>
                          {cat && <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }} color={categoryColor[cat]}>{cat}</Tag>}
                        </div>
                      );
                    })}
                    {skills.length > 3 && (
                      <div style={{ padding: '3px 8px', borderRadius: 6, background: '#f5f5f5', fontSize: 11, color: '#8c8c8c' }}>+{skills.length - 3}</div>
                    )}
                  </div>
                  {count > 0 && (
                    <div style={{ marginTop: 8, fontSize: 12, color: agent.color }}><ThunderboltOutlined /> 已绑定 {count} 个任务</div>
                  )}
                </Card>
              </div>
            </Col>
          );
        })}

        <Col xs={24} sm={12} lg={8} style={{ display: 'flex', flexDirection: 'column' }}>
          <Card
            hoverable onClick={openCreateModal}
            style={{ borderRadius: 12, border: '2px dashed #d9d9d9', background: '#fafafa', width: '100%', height: '100%', minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            styles={{ body: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%' } }}
          >
            <PlusOutlined style={{ fontSize: 32, color: '#bfbfbf', marginBottom: 8 }} />
            <Text type="secondary" style={{ fontSize: 14 }}>创建新 AI搭档</Text>
          </Card>
        </Col>
      </Row>

      {/* ─── Agent Detail Drawer ─── */}
      <Drawer
        title={
          selectedAgent ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}>{selectedAgent.emoji}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>{selectedAgent.name}</div>
                  <Text type="secondary" style={{ fontSize: 12 }}>{selectedAgent.role}</Text>
                </div>
              </div>
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(selectedAgent)}>编辑</Button>
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(selectedAgent)}>删除</Button>
              </Space>
            </div>
          ) : 'AI搭档详情'
        }
        placement="right" width={580} open={drawerOpen} onClose={() => setDrawerOpen(false)}
      >
        {selectedAgent && (
          <>
            <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 8 }}>{selectedAgent.description}</Paragraph>

            <Tabs
              defaultActiveKey="skills"
              items={[
                {
                  key: 'skills',
                  label: <span><ApiOutlined /> Skill 管理</span>,
                  children: (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                    >
                      {/* Agent's Skills - sortable */}
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text strong style={{ fontSize: 13 }}>
                            <AppstoreOutlined style={{ marginRight: 4 }} />
                            AI搭档的 Skill
                            <Tag style={{ marginLeft: 6 }} color="blue">{(agentSkills[selectedAgent.id] || []).length}</Tag>
                          </Text>
                          <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={openNewSkillModal}>
                            新建 Skill
                          </Button>
                        </div>

                        <AgentSkillDropZone>
                          <SortableContext
                            items={agentSkills[selectedAgent.id] || []}
                            strategy={verticalListSortingStrategy}
                          >
                            {(agentSkills[selectedAgent.id] || []).length === 0 ? (
                              <Empty
                                description={<span style={{ fontSize: 12 }}>从下方 Skill 池拖入，或点击 + 添加</span>}
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                style={{ padding: '16px 0' }}
                              />
                            ) : (
                              (agentSkills[selectedAgent.id] || []).map((skillName) => (
                                <SortableSkillCard
                                  key={skillName}
                                  skillName={skillName}
                                  skillDef={findSkillDef(skillName)}
                                  borderColor={selectedAgent.borderColor}
                                  status={getSkillStatus(selectedAgent.id, skillName)}
                                  onRemove={() => removeSkill(selectedAgent.id, skillName)}
                                  onEdit={openEditSkillModal}
                                />
                              ))
                            )}
                          </SortableContext>
                        </AgentSkillDropZone>
                      </div>

                      <Divider style={{ margin: '12px 0' }}>
                        <Text type="secondary" style={{ fontSize: 11 }}>Skill 池（拖入上方或点击 + 添加）</Text>
                      </Divider>

                      {/* Skill Pool */}
                      <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                        {getAvailableSkills(selectedAgent.id).length === 0 ? (
                          <Empty description="所有 Skill 已添加" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '12px 0' }} />
                        ) : (
                          <SortableContext
                            items={getAvailableSkills(selectedAgent.id).map((s) => `pool__${s.name}`)}
                            strategy={verticalListSortingStrategy}
                          >
                            {getAvailableSkills(selectedAgent.id).map((skill) => (
                              <DraggablePoolSkill
                                key={skill.id}
                                skill={skill}
                                onDirectAdd={(name) => addSkill(selectedAgent.id, name)}
                                onEdit={openEditSkillModal}
                              />
                            ))}
                          </SortableContext>
                        )}
                      </div>

                      <DragOverlay>
                        {activeSkillDragId ? (
                          <div style={{ padding: '6px 12px', background: '#1264e5', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                            {activeSkillDragId.startsWith('pool__')
                              ? activeSkillDragId.replace('pool__', '')
                              : activeSkillDragId}
                          </div>
                        ) : null}
                      </DragOverlay>
                    </DndContext>
                  ),
                },
                {
                  key: 'orchestration',
                  label: <span><ThunderboltOutlined /> 任务编排</span>,
                  children: (
                    <div>
                      <Title level={5} style={{ marginBottom: 12, fontSize: 14 }}>指派任务</Title>
                      <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 8, padding: 8, marginBottom: 12 }}>
                        <Checkbox.Group value={pendingTasks} onChange={(v) => setPendingTasks(v as string[])} style={{ width: '100%' }}>
                          <Space direction="vertical" style={{ width: '100%' }}>
                            {taskList.map((task) => {
                              const otherAgent = assignments.find((a) => a.taskId === task.id && a.agentId !== selectedAgent.id);
                              return (
                                <Checkbox key={task.id} value={task.id} style={{ width: '100%' }} disabled={!!otherAgent}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Tag color={task.priority === 'P0' ? 'red' : task.priority === 'P1' ? 'orange' : 'default'} style={{ fontSize: 11 }}>{task.priority}</Tag>
                                    <Text style={{ fontSize: 13, flex: 1 }}>{task.title}</Text>
                                    <Tag color={taskStatusTag[task.status]?.color} style={{ fontSize: 11 }}>{taskStatusTag[task.status]?.label}</Tag>
                                    {otherAgent && <Text type="secondary" style={{ fontSize: 11 }}>已占用</Text>}
                                  </div>
                                </Checkbox>
                              );
                            })}
                          </Space>
                        </Checkbox.Group>
                      </div>
                      <Button type="primary" icon={<CheckCircleOutlined />} onClick={confirmAssignment} style={{ width: '100%', marginBottom: 24 }}>
                        确认指派（{pendingTasks.length} 个任务）
                      </Button>

                      <Divider style={{ margin: '0 0 16px' }} />
                      <Title level={5} style={{ marginBottom: 12, fontSize: 14 }}>
                        <RobotOutlined style={{ marginRight: 6 }} />执行编排
                      </Title>
                      {assignments.filter((a) => a.agentId === selectedAgent.id).length === 0 ? (
                        <Empty description="暂无指派任务" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                      ) : (
                        <Collapse
                          accordion size="small"
                          style={{ background: '#fafafa', borderRadius: 8 }}
                          items={assignments
                            .filter((a) => a.agentId === selectedAgent.id)
                            .map((a) => {
                              const task = taskList.find((t) => t.id === a.taskId);
                              const orch = orchestrations.find((o) => o.agentId === selectedAgent.id && o.taskId === a.taskId);
                              return {
                                key: a.taskId,
                                label: (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {assignStatusIcon[a.status]}
                                    <Text strong style={{ fontSize: 13 }}>{task?.title || a.taskId}</Text>
                                    {task && (
                                      <>
                                        <Tag color={task.priority === 'P0' ? 'red' : 'orange'} style={{ fontSize: 10 }}>{task.priority}</Tag>
                                        <Tag color={taskStatusTag[task.status]?.color} style={{ fontSize: 10 }}>{taskStatusTag[task.status]?.label}</Tag>
                                      </>
                                    )}
                                  </div>
                                ),
                                children: orch ? (
                                  <Timeline
                                    items={orch.steps.map((step) => {
                                      const cfg = skillStatusConfig[step.status];
                                      return {
                                        dot: step.status === 'running'
                                          ? <LoadingOutlined style={{ color: cfg.color }} />
                                          : step.status === 'done'
                                          ? <CheckCircleOutlined style={{ color: cfg.color }} />
                                          : <ClockCircleOutlined style={{ color: cfg.color }} />,
                                        children: (
                                          <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                              <Text strong style={{ fontSize: 13 }}>{step.skillName}</Text>
                                              <Tag style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px' }} color={cfg.color}>{cfg.text}</Tag>
                                            </div>
                                            {step.output && <Text type="secondary" style={{ fontSize: 12 }}>{step.output}</Text>}
                                          </div>
                                        ),
                                      };
                                    })}
                                  />
                                ) : (
                                  <div style={{ padding: '12px 0', textAlign: 'center' }}>
                                    <Text type="secondary" style={{ fontSize: 12 }}><ClockCircleOutlined style={{ marginRight: 6 }} />等待 AI搭档调度...</Text>
                                  </div>
                                ),
                              };
                            })}
                        />
                      )}
                    </div>
                  ),
                },
              ]}
            />
          </>
        )}
      </Drawer>

      {/* ─── Create / Edit Agent Modal ─── */}
      <Modal
        title={editingAgent ? `编辑 AI搭档：${editingAgent.name}` : '创建新 AI搭档'}
        open={modalOpen}
        onOk={handleModalOk}
        onCancel={() => { setModalOpen(false); agentForm.resetFields(); }}
        okText={editingAgent ? '保存' : '创建'}
        cancelText="取消"
        width={520}
      >
        <Form form={agentForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="AI搭档名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：Security Agent" />
          </Form.Item>
          <Form.Item name="role" label="角色定位" rules={[{ required: true, message: '请输入角色' }]}>
            <Input placeholder="如：安全工程师" />
          </Form.Item>
          <Form.Item name="description" label="职责描述" rules={[{ required: true, message: '请输入描述' }]}>
            <TextArea rows={2} placeholder="一句话描述该 Agent 的核心职责" />
          </Form.Item>
          <Form.Item label="Emoji 标识">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {emojiPresets.map((e) => (
                <div key={e} onClick={() => setSelectedEmoji(e)}
                  style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, borderRadius: 8, cursor: 'pointer',
                    border: selectedEmoji === e ? '2px solid #1264e5' : '1px solid #f0f0f0', background: selectedEmoji === e ? '#e6f0ff' : '#fafafa' }}>
                  {e}
                </div>
              ))}
            </div>
          </Form.Item>
          <Form.Item label="配色方案">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {agentColorPresets.map((c) => (
                <Tooltip key={c.label} title={c.label}>
                  <div onClick={() => setSelectedColor(c)}
                    style={{ width: 36, height: 36, borderRadius: 8, cursor: 'pointer', background: c.bgColor,
                      border: selectedColor.color === c.color ? `3px solid ${c.color}` : `1px solid ${c.borderColor}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: c.color }} />
                  </div>
                </Tooltip>
              ))}
            </div>
          </Form.Item>
          <Form.Item label="预览">
            <Card size="small" style={{ borderRadius: 10, border: `1px solid ${selectedColor.borderColor}`, background: `linear-gradient(135deg, ${selectedColor.bgColor} 0%, #fff 100%)` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 22 }}>{selectedEmoji}</span>
                <div>
                  <Text strong style={{ fontSize: 13 }}>{agentForm.getFieldValue('name') || 'Agent 名称'}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 11 }}>{agentForm.getFieldValue('role') || '角色定位'}</Text>
                </div>
              </div>
            </Card>
          </Form.Item>
        </Form>
      </Modal>

      {/* ─── Skill Edit Modal ─── */}
      <SkillEditModal
        open={skillModalOpen}
        editingSkill={editingSkill}
        onClose={() => setSkillModalOpen(false)}
        onSave={handleSkillSave}
        categoryOptions={teamCategoryOptions}
      />
    </div>
  );
};

export default AgentWorkshop;
