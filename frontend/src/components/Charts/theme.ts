import type { EChartsOption } from 'echarts'

export const chartTheme: Partial<EChartsOption> = {
  backgroundColor: 'transparent',
  textStyle: { color: '#8b95a7', fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif' },
  grid: { left: 60, right: 30, top: 30, bottom: 40 },
  xAxis: {
    axisLine: { lineStyle: { color: 'rgba(64,159,255,0.15)' } },
    axisLabel: { color: '#8b95a7', fontSize: 11 },
    splitLine: { lineStyle: { color: 'rgba(64,159,255,0.05)' } },
  },
  yAxis: {
    axisLine: { lineStyle: { color: 'rgba(64,159,255,0.15)' } },
    axisLabel: { color: '#8b95a7', fontSize: 11 },
    splitLine: { lineStyle: { color: 'rgba(64,159,255,0.06)' } },
  },
}

export const tooltipStyle = {
  backgroundColor: 'rgba(20,26,46,0.95)',
  borderColor: 'rgba(0,212,255,0.3)',
  textStyle: { color: '#e2e8f0' },
}
