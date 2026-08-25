import { useRef, useEffect, useState } from 'react'
import * as echarts from 'echarts/core'
import type { EChartsOption } from 'echarts'
import { LineChart, BarChart, GaugeChart, PieChart, ScatterChart, BoxplotChart, HeatmapChart } from 'echarts/charts'
import {
  TooltipComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  MarkAreaComponent,
  DataZoomComponent,
  TitleComponent,
  GraphicComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { chartTheme } from './theme'
import styles from './Charts.module.css'

echarts.use([
  LineChart,
  BarChart,
  GaugeChart,
  PieChart,
  ScatterChart,
  BoxplotChart,
  HeatmapChart,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  MarkAreaComponent,
  DataZoomComponent,
  TitleComponent,
  GraphicComponent,
  CanvasRenderer,
])

/**
 * ECharts hook: creates chart when container+option are both ready,
 * updates option on change, disposes on unmount.
 * Includes smooth fade-in animation and loading state.
 */
export function useChart(option: EChartsOption | null) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // Create chart (or recreate if container DOM element changed)
    if (!chartRef.current || chartRef.current.getDom() !== el) {
      chartRef.current?.dispose()
      chartRef.current = echarts.init(el)
      chartRef.current.setOption(chartTheme)
    }

    // Apply option with smooth animation
    if (option) {
      setIsLoading(false)
      // Add slight delay for fade-in effect
      requestAnimationFrame(() => {
        chartRef.current?.setOption({
          ...option,
          animation: true,
          animationDuration: 800,
          animationEasing: 'cubicOut',
          animationDelay: (_idx: number) => _idx * 10,
        }, true)
        setIsVisible(true)
      })
    } else {
      chartRef.current.clear()
      setIsLoading(true)
      setIsVisible(false)
    }

    // Resize handling
    const ro = new ResizeObserver(() => chartRef.current?.resize())
    ro.observe(el)
    const onResize = () => chartRef.current?.resize()
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      ro.disconnect()
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [option])

  return {
    containerRef,
    chartRef,
    isLoading,
    isVisible,
    chartClassName: `${styles.chartWrapper} ${isVisible ? styles.visible : ''} ${isLoading ? styles.loading : ''}`,
  }
}
