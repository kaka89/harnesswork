export interface Contract {
  id: string;
  version: string;
  producer: string;
  consumers: string[];
  pactStatus: 'passed' | 'failed' | 'pending';
  interfaceCount: number;
  behaviorCount: number;
  lastVerified: string;
  sddId: string;
}

export const contractList: Contract[] = [
  {
    id: 'CONTRACT-001',
    version: 'v1.0.0',
    producer: 'cosmic-gl',
    consumers: ['cosmic-ap', 'cosmic-ar'],
    pactStatus: 'passed',
    interfaceCount: 3,
    behaviorCount: 12,
    lastVerified: '1小时前',
    sddId: 'SDD-001',
  },
  {
    id: 'CONTRACT-002',
    version: 'v1.0.0',
    producer: 'cosmic-gl',
    consumers: ['cosmic-tax'],
    pactStatus: 'passed',
    interfaceCount: 2,
    behaviorCount: 8,
    lastVerified: '30分钟前',
    sddId: 'SDD-002',
  },
  {
    id: 'CONTRACT-003',
    version: 'v0.1.0',
    producer: 'cosmic-gl',
    consumers: ['cosmic-ap', 'cosmic-ar', 'cosmic-tax'],
    pactStatus: 'pending',
    interfaceCount: 4,
    behaviorCount: 0,
    lastVerified: '-',
    sddId: 'SDD-003',
  },
];

export interface PactNode {
  id: string;
  label: string;
  type: 'producer' | 'consumer';
}

export interface PactEdge {
  from: string;
  to: string;
  label: string;
  contracts: number;
  status: 'passed' | 'failed' | 'pending';
}

export const pactNetwork: { nodes: PactNode[]; edges: PactEdge[] } = {
  nodes: [
    { id: 'cosmic-gl', label: 'cosmic-gl', type: 'producer' },
    { id: 'cosmic-ap', label: 'cosmic-ap', type: 'consumer' },
    { id: 'cosmic-ar', label: 'cosmic-ar', type: 'consumer' },
    { id: 'cosmic-tax', label: 'cosmic-tax', type: 'consumer' },
  ],
  edges: [
    { from: 'cosmic-ap', to: 'cosmic-gl', label: 'VoucherPosted', contracts: 3, status: 'passed' },
    { from: 'cosmic-ar', to: 'cosmic-gl', label: 'PeriodClosed', contracts: 2, status: 'passed' },
    { from: 'cosmic-tax', to: 'cosmic-gl', label: 'TaxCalc', contracts: 2, status: 'passed' },
  ],
};
