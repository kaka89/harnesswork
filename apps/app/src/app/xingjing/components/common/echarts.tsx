import { Component, createEffect, onCleanup } from 'solid-js';
import * as echarts from 'echarts';

interface EChartsProps {
  // Use a permissive type to avoid strict subtype mismatch with complex chart configs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  option: Record<string, any>;
  style?: Record<string, string>;
}

const ECharts: Component<EChartsProps> = (props) => {
  let chartRef: HTMLDivElement | undefined;
  let chartInstance: echarts.ECharts | undefined;

  createEffect(() => {
    if (chartRef) {
      // 初始化图表
      if (!chartInstance) {
        chartInstance = echarts.init(chartRef);
      }

      // 更新配置
      chartInstance.setOption(props.option);

      // 响应式调整大小
      const resizeObserver = new ResizeObserver(() => {
        chartInstance?.resize();
      });
      resizeObserver.observe(chartRef);

      onCleanup(() => {
        resizeObserver.disconnect();
        chartInstance?.dispose();
        chartInstance = undefined;
      });
    }
  });

  return <div ref={chartRef} style={props.style || { height: '300px' }} />;
};

export default ECharts;
