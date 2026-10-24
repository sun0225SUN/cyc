export type Activity = {
  run_id: number
  name: string
  distance: number
  moving_time: string
  type: string
  subtype: string
  start_date: string
  start_date_local: string
  location_country: string
  summary_polyline: string
  average_heartrate: number | null
  average_speed: number
  elevation_gain: number
  streak: number
}
