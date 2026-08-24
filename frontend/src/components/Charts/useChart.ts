import { useRef, useEffect } from 'react'
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
 * Custom hook that manages ECharts lifecycle:
 * - Initializes chart when container becomes available and option is provided
 * - Disposes chart on unmount (prevents memory leaks)
 * - Handles window resize
 * - Updates options when they change
 */
export function useChart(option: EChartsOption | null) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  // Combined effect: initialize chart when ready, update option when it changes
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let resizeObserver: ResizeObserver | null = null

    // Lazy-init: create chart instance if not yet created
    if (!chartRef.current) {
      if (el.clientWidth > 0 && el.clientHeight > 0) {
        chartRef.current = echarts.init(el)
        chartRef.current.setOption(chartTheme)
      } else {
        // Container not visible yet — wait for dimensions
        let disposed = false
        const waitObserver = new ResizeObserver((entries) => {
          const entry = entries[0]
          if (entry && entry.contentRect.width > 0 && entry.contentRect.height > 0) {
            waitObserver.disconnect()
            if (!disposed) {
              chartRef.current = echarts.init(el)
              chartRef.current.setOption(chartTheme)
              if (option) chartRef.current.setOption(option, true)
            }
          }
        })
        waitObserver.observe(el)
        return () => {
          disposed = true
          waitObserver.disconnect()
        }
      }
    }

    // Apply option
    if (!option) {
      chartRef.current!.clear()
    } else {
      chartRef.current!.setOption(option, true)
    }

    // Resize observer
    resizeObserver = new ResizeObserver(() => {
      chartRef.current?.resize()
    })
    resizeObserver.observe(el)

    const handleWindowResize = () => {
      chartRef.current?.resize()
    }
    window.addEventListener('resize', handleWindowResize)

    return () => {
      window.removeEventListener('resize', handleWindowResize)
      resizeObserver?.disconnect()
    }
  }, [option])

  // Dispose chart on unmount
  useEffect(() => {
    return () => {
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [])

  return { containerRef, chartRef }
}
