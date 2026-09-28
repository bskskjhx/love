import ReactEChartsCore from 'echarts-for-react/esm/core'
import { BarChart, HeatmapChart, LineChart, PieChart } from 'echarts/charts'
import { DataZoomComponent, GridComponent, LegendComponent, MarkPointComponent, TooltipComponent, VisualMapComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'
import { useMemo } from 'react'
import { useIsDark } from '../lib/theme'

echarts.use([BarChart, LineChart, HeatmapChart, PieChart, GridComponent, TooltipComponent, DataZoomComponent, LegendComponent, VisualMapComponent, MarkPointComponent, CanvasRenderer])

/** 与页面一致的配色（iOS 系统色），深浅色各一套 */
export function palette(dark: boolean) {
  return dark
    ? { accent: '#0a84ff', second: '#ff9f0a', third: '#30d158', label: '#ffffff', label2: 'rgba(235,235,245,0.6)', sep: 'rgba(84,84,88,0.6)', grid: 'rgba(84,84,88,0.35)', cell: '#1c1c1e', heat: ['#2c2c2e', '#0a3d73', '#0a84ff', '#64d2ff'], kinds: ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff375f', '#64d2ff', '#ffd60a', '#ac8e68', '#98989d'] }
    : { accent: '#007aff', second: '#ff9500', third: '#34c759', label: '#000000', label2: 'rgba(60,60,67,0.6)', sep: 'rgba(60,60,67,0.29)', grid: 'rgba(60,60,67,0.12)', cell: '#ffffff', heat: ['#f2f2f7', '#b3d7ff', '#007aff', '#003f88'], kinds: ['#007aff', '#34c759', '#ff9500', '#af52de', '#ff2d55', '#5ac8fa', '#ffcc00', '#a2845e', '#8e8e93'] }
}
export type Palette = ReturnType<typeof palette>

/** 各图共用的基础样式：字体、提示框、坐标轴颜色 */
function base(p: Palette): EChartsOption {
  return {
    textStyle: { fontFamily: 'inherit', color: p.label2, fontSize: 11 },
    animationDuration: 700,
    animationEasing: 'cubicOut',
    tooltip: {
      confine: true,
      backgroundColor: p.cell,
      borderColor: 'transparent',
      padding: [8, 12],
      textStyle: { color: p.label, fontSize: 13 },
      extraCssText: 'border-radius:16px;box-shadow:0 0 0 0.5px rgb(0 0 0 / .08),0 10px 30px rgb(0 0 0 / .18);-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);',
    },
    legend: { textStyle: { color: p.label2, fontSize: 12 }, icon: 'circle', itemWidth: 8, itemHeight: 8, itemGap: 14 },
  }
}

export function Chart({
  option,
  height = 240,
  onClick,
  onReady,
}: {
  option: (p: Palette) => EChartsOption
  height?: number
  onClick?: (params: { dataIndex: number; seriesIndex?: number }) => void
  onReady?: (chart: echarts.ECharts) => void
}) {
  const dark = useIsDark()
  const opt = useMemo(() => {
    const p = palette(dark)
    const b = base(p)
    const o = option(p)
    return { ...b, ...o, tooltip: { ...(b.tooltip as object), ...((o.tooltip as object) ?? {}) }, legend: o.legend && { ...(b.legend as object), ...(o.legend as object) } }
  }, [dark, option])
  const events = useMemo(() => (onClick ? { click: onClick } : undefined), [onClick])
  return <ReactEChartsCore echarts={echarts} option={opt} notMerge style={{ height, width: '100%' }} onEvents={events} opts={{ renderer: 'canvas' }} onChartReady={onReady} />
}
