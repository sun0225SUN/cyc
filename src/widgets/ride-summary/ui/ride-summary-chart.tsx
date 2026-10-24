'use client'

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/shared/ui/chart'
import type { SummaryPoint } from '../model/build-summary'

const chartConfig = {
  km: {
    label: 'km',
    color: 'var(--color-ride)',
  },
} satisfies ChartConfig

type RideSummaryChartProps = {
  data: SummaryPoint[]
  labels: Record<string, string>
}

export function RideSummaryChart({ data, labels }: RideSummaryChartProps) {
  return (
    <ChartContainer
      config={chartConfig}
      className='ride-summary-chart aspect-auto h-56 w-full'
    >
      <BarChart
        data={data}
        accessibilityLayer={false}
        margin={{ left: 0, right: 8 }}
      >
        <CartesianGrid vertical={false} syncWithTicks />
        <XAxis
          dataKey='key'
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={12}
          tickFormatter={(value: string) => labels[value] ?? value}
        />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} width={36} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(value) =>
                labels[String(value)] ?? String(value ?? '')
              }
            />
          }
        />
        <Bar
          dataKey='km'
          fill='var(--color-ride)'
          radius={[4, 4, 0, 0]}
          maxBarSize={36}
          cursor='pointer'
        />
      </BarChart>
    </ChartContainer>
  )
}
