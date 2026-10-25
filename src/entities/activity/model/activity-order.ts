export function activitiesNewestFirst<T extends { start_date_local: string }>(
  activities: readonly T[],
) {
  return [...activities].sort((left, right) =>
    right.start_date_local.localeCompare(left.start_date_local),
  )
}
