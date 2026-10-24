import type { RideLap } from '@/entities/activity'

export type LapColumnKey =
  | 'index'
  | 'timer_time'
  | 'elapsed_time'
  | 'moving_time'
  | 'distance'
  | 'average_speed'
  | 'max_speed'
  | 'average_heartrate'
  | 'max_heartrate'
  | 'average_cadence'
  | 'max_cadence'
  | 'average_power'
  | 'max_power'
  | 'calories'
  | 'average_altitude'
  | 'max_altitude'
  | 'min_altitude'
  | 'elevation_gain'
  | 'elevation_loss'
  | 'average_temperature'
  | 'max_temperature'
  | 'avg_pos_grade'
  | 'max_pos_grade'
  | 'avg_neg_grade'
  | 'max_neg_grade'
  | 'avg_pos_vertical_speed'
  | 'max_pos_vertical_speed'
  | 'avg_neg_vertical_speed'
  | 'max_neg_vertical_speed'

export type LapColumn = {
  key: LapColumnKey
  label: string
  always?: boolean
}

export const LAP_COLUMNS: LapColumn[] = [
  { key: 'index', label: 'laps', always: true },
  { key: 'timer_time', label: 'time' },
  { key: 'elapsed_time', label: 'elapsed' },
  { key: 'moving_time', label: 'moving' },
  { key: 'distance', label: 'distance' },
  { key: 'average_speed', label: 'averageSpeed' },
  { key: 'max_speed', label: 'maxSpeed' },
  { key: 'average_heartrate', label: 'averageHeartRate' },
  { key: 'max_heartrate', label: 'maxHeartRate' },
  { key: 'average_cadence', label: 'averageCadence' },
  { key: 'max_cadence', label: 'maxCadence' },
  { key: 'average_power', label: 'averagePower' },
  { key: 'max_power', label: 'maxPower' },
  { key: 'calories', label: 'calories' },
  { key: 'average_altitude', label: 'averageAltitude' },
  { key: 'max_altitude', label: 'highest' },
  { key: 'min_altitude', label: 'lowest' },
  { key: 'elevation_gain', label: 'ascent' },
  { key: 'elevation_loss', label: 'descent' },
  { key: 'average_temperature', label: 'temperature' },
  { key: 'max_temperature', label: 'maxTemperature' },
  { key: 'avg_pos_grade', label: 'avgPosGrade' },
  { key: 'max_pos_grade', label: 'maxPosGrade' },
  { key: 'avg_neg_grade', label: 'avgNegGrade' },
  { key: 'max_neg_grade', label: 'maxNegGrade' },
  { key: 'avg_pos_vertical_speed', label: 'avgClimb' },
  { key: 'max_pos_vertical_speed', label: 'maxClimb' },
  { key: 'avg_neg_vertical_speed', label: 'avgDrop' },
  { key: 'max_neg_vertical_speed', label: 'maxDrop' },
]

export function visibleLapColumns(laps: RideLap[]) {
  return LAP_COLUMNS.filter(
    (column) =>
      column.always ||
      laps.some((lap) => hasLapValue(lap[column.key as keyof RideLap])),
  )
}

function hasLapValue(value: RideLap[keyof RideLap]) {
  return value != null && value !== ''
}
