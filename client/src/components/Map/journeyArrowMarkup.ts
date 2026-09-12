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
 * Every pill hangs off a zero-sized box, and the marker is anchored on that box
 * rather than on the pill.
 *
 * This is what lets a pill expand on hover without the thing it labels moving.
 * Both renderers centre a marker element on its coordinate — Leaflet through
 * `iconAnchor`, the GL engines through `translate(-50%, -50%)` — so centring the
 * PILL would slide the dot sideways by half the newly-revealed width the moment
 * the pointer touched it, and slide it back as the pointer chased it. A 0×0
 * anchor is centred on nothing, so the dot stays put and the body grows out of
 * it. It also means neither renderer has to estimate a pill's width any more.
 */
const ANCHOR_OPEN = '<span class="trek-journey-anchor">'
const ANCHOR_CLOSE = '</span>'

/**
 * The arrowhead that rides the leg, collapsed to just the triangle until the
 * pointer arrives — at which point it opens to the date and, when a booking
 * says so, how you travelled.
 *
 * Only the triangle rotates. Turning the whole pill would point the arrow
 * correctly and leave the date upside down on every westbound leg, which is the
 * obvious version of this and the wrong one.
 */
export function legPillHtml(dateLabel: string, bearing: number, modeLabel = '', modeIcon = ''): string {
  const head = `<span class="trek-journey-head" style="border-bottom-color:${JOURNEY_ARROW_COLOR};transform:rotate(${bearing.toFixed(1)}deg)"></span>`
  const mode = modeLabel
    ? `<span class="trek-journey-mode">${modeIcon}${escapeHtml(modeLabel)}</span>`
    : ''
  const date = dateLabel ? `<span class="trek-journey-date">${escapeHtml(dateLabel)}</span>` : ''
  const body = date || mode ? `<span class="trek-journey-body">${date}${mode}</span>` : ''
  return `${ANCHOR_OPEN}<span class="trek-journey-pill trek-journey-leg" style="${PILL_FONT}">${head}${body}</span>${ANCHOR_CLOSE}`
}

/**
 * A city centre. Collapsed it is only its dot — which is the point of the
 * redesign: fifteen open pills across Europe is a wall of text, fifteen dots is
 * a route. The name and dates arrive on hover.
 *
 * The dot is drawn in the overview's own colour so a stop reads as part of the
 * same layer as the arcs rather than as one more place marker.
 */
export function stopPillHtml(label: string, dateLabel: string): string {
  const dot = `<span class="trek-journey-dot" style="background:${JOURNEY_ARROW_COLOR};border-color:${JOURNEY_ARROW_CASING}"></span>`
  const dates = dateLabel ? `<span class="trek-journey-dates">${escapeHtml(dateLabel)}</span>` : ''
  const body = `<span class="trek-journey-body"><span class="trek-journey-name">${escapeHtml(label)}</span>${dates}</span>`
  return `${ANCHOR_OPEN}<span class="trek-journey-pill trek-journey-stop" style="${PILL_FONT}">${dot}${body}</span>${ANCHOR_CLOSE}`
}
