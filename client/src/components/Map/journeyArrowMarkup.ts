import { escapeHtml } from '@trek/shared'

/**
 * The drawn half of the journey overview, shared by all three map renderers.
 *
 * Leaflet wraps these strings in an `L.divIcon`, the GL engines put them in a
 * `Marker({ element })` — the wrapper differs, the pill must not. Keeping the
 * markup here is also what stops the two shells drifting into two slightly
 * different overlays, which is the failure mode every other twinned map feature
 * in this tree has had at least once.
 */

/**
 * The overview's own colour, on both renderers.
 *
 * Not a theme token: a GL line colour is consumed by WebGL, which cannot read a
 * CSS variable, so the one value has to be a literal if the Leaflet and GL
 * layers are to match. Violet on purpose — the day route is `#0a84ff` and
 * bookings are `#3b82f6`, and a third blue on the same map would read as more
 * of the same layer rather than as the altitude above it.
 */
// theme-lint-disable — map geometry colour, see above
export const JOURNEY_ARROW_COLOR = '#7c3aed'

/** White underlay, so the arc survives satellite imagery and dark basemaps. */
// theme-lint-disable — map geometry colour, see above
export const JOURNEY_ARROW_CASING = '#ffffff'

const toDeg = (r: number) => r * 180 / Math.PI
const toRad = (d: number) => d * Math.PI / 180

/**
 * Compass bearing from `a` to `b`, in degrees clockwise from north — the angle a
 * CSS `rotate()` needs to point an upward-drawn arrowhead along the leg.
 */
export function bearingDeg(a: [number, number], b: [number, number]): number {
  const [lat1, lat2] = [toRad(a[0]), toRad(b[0])]
  const dLng = toRad(b[1] - a[1])
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

export interface ArcPoint {
  point: [number, number]
  /** The arc's local heading there, so the arrowhead follows a curved leg. */
  bearing: number
}

/**
 * A point a given fraction along a sampled arc, by arc length rather than by
 * sample index: `geodesicArcs` spaces its samples evenly in angle, which is not
 * evenly in drawn length once a leg is long enough to curve.
 *
 * Measured in plain coordinate space. That is wrong as a distance and exactly
 * right as a position — the arc is already unwrapped past ±180 for the
 * antimeridian, and both renderers project it linearly, so walking it in the
 * same flat space puts the marker where the line is actually drawn.
 */
export function pointAlongArc(arc: [number, number][], fraction: number): ArcPoint | null {
  if (!arc || arc.length === 0) return null
  if (arc.length === 1) return { point: arc[0], bearing: 0 }

  const steps = arc.slice(1).map((p, i) => Math.hypot(p[0] - arc[i][0], p[1] - arc[i][1]))
  const total = steps.reduce((s, d) => s + d, 0)
  if (total === 0) return { point: arc[0], bearing: bearingDeg(arc[0], arc[arc.length - 1]) }

  const target = Math.min(Math.max(fraction, 0), 1) * total
  let walked = 0
  for (let i = 0; i < steps.length; i++) {
    if (walked + steps[i] < target) { walked += steps[i]; continue }
    const t = steps[i] === 0 ? 0 : (target - walked) / steps[i]
    const [a, b] = [arc[i], arc[i + 1]]
    return {
      point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
      bearing: bearingDeg(a, b),
    }
  }
  const last = arc.length - 1
  return { point: arc[last], bearing: bearingDeg(arc[last - 1], arc[last]) }
}

/**
 * `font-family` is spelled out on every pill for the same reason the road-trip
 * labels spell it out: a marker element sits inside the map container, whose own
 * stylesheet sets Helvetica/Arial on everything under it, and without this the
 * overview would be the one piece of TREK chrome not in the app's typeface.
 */
const PILL_FONT = 'font-family:var(--font-system);'

/**
 * The arrowhead that rides the leg: a triangle rotated to the local heading,
 * with the travel date beside it in an upright frosted pill.
 *
 * Only the triangle rotates. Turning the whole pill would point the arrow
 * correctly and leave the date upside down on every westbound leg, which is the
 * obvious version of this and the wrong one.
 */
export function legPillHtml(dateLabel: string, bearing: number): string {
  const head = `<span style="display:block;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:9px solid ${JOURNEY_ARROW_COLOR};transform:rotate(${bearing.toFixed(1)}deg)"></span>`
  const date = dateLabel
    ? `<span style="white-space:nowrap;font-size:11px;font-weight:600;line-height:1;color:var(--text-primary)">${escapeHtml(dateLabel)}</span>`
    : ''
  return `<span style="display:inline-flex;align-items:center;gap:5px;padding:${dateLabel ? '4px 9px 4px 7px' : '5px'};border-radius:999px;background:var(--bg-card);border:1px solid var(--border-primary);box-shadow:0 2px 8px rgba(0,0,0,0.2);${PILL_FONT}">${head}${date}</span>`
}

/**
 * A city centre: its name over the dates you are there. The dot is drawn in the
 * overview's own colour so a stop reads as part of the same layer as the arcs
 * rather than as one more place marker.
 */
export function stopPillHtml(label: string, dateLabel: string): string {
  const dot = `<span style="display:block;width:9px;height:9px;border-radius:50%;background:${JOURNEY_ARROW_COLOR};border:2px solid ${JOURNEY_ARROW_CASING};box-sizing:content-box;flex-shrink:0"></span>`
  const dates = dateLabel
    ? `<span style="font-size:10.5px;font-weight:500;line-height:1.25;color:var(--text-muted)">${escapeHtml(dateLabel)}</span>`
    : ''
  const text = `<span style="display:flex;flex-direction:column;align-items:flex-start;white-space:nowrap"><span style="font-size:12.5px;font-weight:700;line-height:1.25;color:var(--text-primary)">${escapeHtml(label)}</span>${dates}</span>`
  return `<span style="display:inline-flex;align-items:center;gap:7px;padding:5px 11px 5px 8px;border-radius:999px;background:var(--bg-card);border:1px solid var(--border-primary);box-shadow:0 3px 12px rgba(0,0,0,0.22);${PILL_FONT}">${dot}${text}</span>`
}

/**
 * A pill's rendered width, near enough for an icon anchor.
 *
 * Leaflet needs an `iconSize` before the element exists to measure, and the
 * endpoint markers in ReservationOverlay already estimate theirs the same way.
 * Overshooting only costs a slightly loose anchor; undershooting clips nothing,
 * because the pill is inline-flex and sizes itself.
 */
export function estimatePillWidth(label: string, dateLabel: string): number {
  const longest = Math.max(label.length, dateLabel.length)
  return Math.max(52, Math.round(longest * 7 + 36))
}
