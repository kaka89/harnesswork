export interface SprintData {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  currentDay: number;
  capacity: number;
  spiIndex: number;
  completionRate: number;
  blockedTasks: number;
  predictedEnd: string;
  originalEnd: string;
  burndown: { day: number; ideal: number; actual: number }[];
  risks: { level: 'high' | 'medium' | 'low'; message: string }[];
}

export const currentSprint: SprintData = {
  id: 'SPRINT-2026-W17',
  name: 'Sprint W17',
  startDate: '2026-04-06',
  endDate: '2026-04-16',
  totalDays: 10,
  currentDay: 5,
  capacity: 29,
  spiIndex: 0.82,
  completionRate: 44,
  blockedTasks: 1,
  predictedEnd: '2026-05-05',
  originalEnd: '2026-05-02',
  burndown: [
    { day: 1, ideal: 29, actual: 29 },
    { day: 2, ideal: 26, actual: 27 },
    { day: 3, ideal: 23, actual: 25 },
    { day: 4, ideal: 20, actual: 23 },
    { day: 5, ideal: 17, actual: 21 },
    { day: 6, ideal: 14, actual: 0 },
    { day: 7, ideal: 12, actual: 0 },
    { day: 8, ideal: 9, actual: 0 },
    { day: 9, ideal: 6, actual: 0 },
    { day: 10, ideal: 0, actual: 0 },
  ],
  risks: [
    { level: 'high', message: 'TASK-001-02 超时 28%，影响关键路径，建议 @张开发 更新ETA' },
    { level: 'medium', message: 'cosmic-ap staging 2天未更新，可能影响集成测试（TASK-008）' },
    { level: 'medium', message: 'Sprint 第5天 SPI = 0.82，建议今日讨论范围调整' },
  ],
};

export interface BacklogItem {
  id: string;
  title: string;
  estimate: number;
  priority: 'P0' | 'P1' | 'P2';
  inSprint: boolean;
}

export const backlogItems: BacklogItem[] = [
  { id: 'TASK-001-09', title: 'SDD文档更新', estimate: 1.0, priority: 'P0', inSprint: false },
  { id: 'TASK-002-01', title: '多币种-汇率服务', estimate: 2.0, priority: 'P1', inSprint: false },
  { id: 'TASK-002-02', title: '多币种-前端选择器', estimate: 1.5, priority: 'P1', inSprint: false },
  { id: 'TASK-002-03', title: '多币种-外部API对接', estimate: 2.5, priority: 'P1', inSprint: false },
  { id: 'TASK-003-01', title: '期末结转-规则引擎', estimate: 3.0, priority: 'P1', inSprint: false },
];

export const historyVelocity = [
  { sprint: 'W14', points: 22 },
  { sprint: 'W15', points: 24 },
  { sprint: 'W16', points: 24 },
  { sprint: 'W17', points: 22 },
  { sprint: 'W18', points: 26 },
];
