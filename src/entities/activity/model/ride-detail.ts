export type RideLap = {
  index: number
  elapsed: number
  distance: number | null
  lat: number | null
  lng: number | null
  timer_time?: number | null
  average_speed?: number | null
  max_speed?: number | null
  average_heartrate?: number | null
  max_heartrate?: number | null
  average_cadence?: number | null
  max_cadence?: number | null
  average_power?: number | null
  max_power?: number | null
  calories?: number | null
  elapsed_time?: number | null
  moving_time?: number | null
  average_altitude?: number | null
  max_altitude?: number | null
  min_altitude?: number | null
  elevation_gain?: number | null
  elevation_loss?: number | null
  average_temperature?: number | null
  max_temperature?: number | null
  avg_pos_grade?: number | null
  max_pos_grade?: number | null
  avg_neg_grade?: number | null
  max_neg_grade?: number | null
  avg_pos_vertical_speed?: number | null
  max_pos_vertical_speed?: number | null
  avg_neg_vertical_speed?: number | null
  max_neg_vertical_speed?: number | null
}

export type RideStreams = {
  elapsed?: Array<number | null>
  distance?: Array<number | null>
  speed?: Array<number | null>
  cadence?: Array<number | null>
  altitude?: Array<number | null>
  heart_rate?: Array<number | null>
  power?: Array<number | null>
  temperature?: Array<number | null>
}

export type RideDetailData = {
  run_id: number
  elapsed_time: number | null
  moving_time: number
  distance: number
  average_speed: number
  average_heartrate: number | null
  elevation_gain: number
  calories?: number | null
  elevation_loss?: number | null
  max_speed?: number | null
  average_cadence?: number | null
  max_cadence?: number | null
  max_heartrate?: number | null
  average_power?: number | null
  max_power?: number | null
  average_altitude?: number | null
  max_altitude?: number | null
  min_altitude?: number | null
  average_temperature?: number | null
  max_temperature?: number | null
  timer_time?: number | null
  avg_pos_grade?: number | null
  max_pos_grade?: number | null
  avg_neg_grade?: number | null
  max_neg_grade?: number | null
  avg_pos_vertical_speed?: number | null
  max_pos_vertical_speed?: number | null
  avg_neg_vertical_speed?: number | null
  max_neg_vertical_speed?: number | null
  laps: RideLap[]
  streams: RideStreams
}

export type RideSpeedProfile = {
  distance: number[]
  speed: number[]
}
