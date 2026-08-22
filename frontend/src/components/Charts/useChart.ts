import { useRef, useEffect, useCallback } from 'react'
import * as echarts from 'echarts/core'
import type { EChartsOption } from 'echarts'
import { LineChart, BarChart, GaugeChart, PieChart, ScatterChart, BoxplotChart } from 'echarts/charts'
import {
  TooltipComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  MarkAreaComponent,
  DataZoomComponent,
  TitleComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { chartTheme } from './theme'

echarts.use([
  LineChart,
  BarChart,
  GaugeChart,
  PieChart,
  ScatterChart,
  BoxplotChart,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  MarkAreaComponent,
  DataZoomComponent,
  TitleComponent,
  CanvasRenderer,
])

/**
 * Custom hook that manages ECharts lifecycle:
 * - Initializes chart on mount
 * - Disposes chart on unmount (prevents memory leaks)
 * - Handles window resize with debounce
 * - Updates options when they change
 */
export function useChart(option: EChartsOption | null) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  // Initialize chart on mount, dispose on unmount
  useEffect(() => {
    if (!containerRef.current) return

    const chart = echarts.init(containerRef.current)
    chartRef.current = chart

    // Apply base theme
    chart.setOption(chartTheme)

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      chart.resize()
    })
    resizeObserver.observe(containerRef.current)

    // Also listen to window resize as a fallback
    const handleWindowResize = () => {
      chart.resize()
    }
    window.addEventListener('resize', handleWindowResize)

    return () => {
      window.removeEventListener('resize', handleWindowResize)
      resizeObserver.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  // Update options when they change
  useEffect(() => {
    if (!chartRef.current || !option) return

    chartRef.current.setOption(option, true)
  }, [option])

  return { containerRef, chartRef }
}
