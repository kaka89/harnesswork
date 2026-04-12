// Type stub for echarts — full types available after pnpm install
declare module 'echarts' {
  export interface EChartsOption {
    [key: string]: unknown;
  }
  export interface ECharts {
    setOption(option: EChartsOption): void;
    resize(): void;
    dispose(): void;
  }
  export function init(dom: HTMLElement): ECharts;
}
