import type { RideLap } from '@/entities/activity'
import { lapDistanceWindow } from './lap-route'

export type ChartAxis = 'time' | 'distance'
export type ChartWindow = { start: number; end: number }

export function fullWindow(values: Array<number | null | undefined>) {
  const numbers = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  )
  if (numbers.length === 0) return null
  const start = Math.min(...numbers)
  const end = Math.max(...numbers)
  if (end <= start) return null
  return { start, end }
}

export function baseChartWindow(
  bounds: ChartWindow,
  laps: RideLap[],
  index: number | null,
  axis: ChartAxis,
) {
  if (index == null) return bounds
  const next = lapChartWindow(laps, index, axis)
  if (!next) return bounds
  return clampView(
    {
      start: Math.max(next.start, bounds.start),
      end: Math.min(next.end, bounds.end),
    },
    bounds,
  )
}

export function clampView(view: ChartWindow, bounds: ChartWindow): ChartWindow {
  const min = minSpan(bounds)
  const start = clamp(view.start, bounds.start, bounds.end)
  const end = clamp(view.end, bounds.start, bounds.end)
  if (end - start >= min) return { start, end }
  if (start + min <= bounds.end) return { start, end: start + min }
  return { start: bounds.end - min, end: bounds.end }
}

export function sameWindow(
  left: ChartWindow | null,
  right: ChartWindow | null,
) {
  if (!left || !right) return left === right
  return (
    Math.abs(left.start - right.start) < 0.001 &&
    Math.abs(left.end - right.end) < 0.001
  )
}

export function valueAtRatio(bounds: ChartWindow, ratio: number) {
  return bounds.start + (bounds.end - bounds.start) * clamp(ratio, 0, 1)
}

export function lapChartWindow(
  laps: RideLap[],
  index: number,
  axis: ChartAxis,
) {
  return axis === 'distance'
    ? toWindow(lapDistanceWindow(laps, index))
    : lapTimeWindow(laps, index)
}

export function panWindow(
  current: ChartWindow,
  bounds: ChartWindow,
  delta: number,
): ChartWindow {
  const span = current.end - current.start
  if (span <= 0) return bounds
  let start = current.start + delta
  let end = current.end + delta
  if (start < bounds.start) {
    start = bounds.start
    end = start + span
  }
  if (end > bounds.end) {
    end = bounds.end
    start = end - span
  }
  return {
    start: Math.max(start, bounds.start),
    end: Math.min(end, bounds.end),
  }
}

export function zoomWindow(
  current: ChartWindow,
  bounds: ChartWindow,
  factor: number,
  origin: number,
): ChartWindow {
  const span = current.end - current.start
  if (span <= 0) return bounds
  const nextSpan = clamp(
    span * factor,
    minSpan(bounds),
    bounds.end - bounds.start,
  )
  const ratio = clamp((origin - current.start) / span, 0, 1)
  let start = origin - nextSpan * ratio
  let end = start + nextSpan
  if (start < bounds.start) {
    start = bounds.start
    end = start + nextSpan
  }
  if (end > bounds.end) {
    end = bounds.end
    start = end - nextSpan
  }
  return {
    start: Math.max(start, bounds.start),
    end: Math.min(end, bounds.end),
  }
}

export function originAt(
  left: number,
  width: number,
  clientX: number,
  view: ChartWindow,
  gutter = 48,
) {
  const usable = Math.max(width - gutter, 1)
  const ratio = clamp((clientX - left - gutter) / usable, 0, 1)
  return view.start + (view.end - view.start) * ratio
}

export function windowedPoints<T extends { x: number }>(
  points: T[],
  view: ChartWindow | null,
) {
  if (!view || points.length === 0) return points
  let from = 0
  let to = points.length
  for (const [index, point] of points.entries()) {
    if (point.x < view.start) from = index
    if (point.x > view.end) {
      to = index + 1
      break
    }
  }
  return points.slice(from, to)
}

function lapTimeWindow(laps: RideLap[], index: number) {
  const ordered = [...laps].sort((left, right) => left.index - right.index)
  const at = ordered.findIndex((lap) => lap.index === index)
  const lap = ordered[at]
  if (!lap) return null
  const next = ordered[at + 1]
  const start = lap.elapsed
  const end = next?.elapsed ?? start + (lap.elapsed_time ?? lap.timer_time ?? 0)
  return toWindow({ start, end })
}

function toWindow(range: { start: number; end: number } | null) {
  if (!range || range.end <= range.start) return null
  return range
}

function minSpan(bounds: ChartWindow) {
  const full = bounds.end - bounds.start
  return Math.min(full, Math.max(full * 0.002, 8))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
