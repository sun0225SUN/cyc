/**
 * Hide the start and end of every ride so home and the finish stay off the map.
 * The cut is applied before ride data reaches the browser.
 * The ride detail sheet then omits the start/end marker switch.
 * Set this to false to draw the full track and show that switch.
 */
export const privacyMode = true

/** Meters cut from the start and from the end while `privacyMode` is on. */
export const privacyHideMeters = 500
