import { haversineKm } from '../../utils/geo'
import { getDayOrder, isDayInAccommodationRange } from '../../utils/dayOrder'
import type { Accommodation, AssignmentsMap, Day } from '../../types'

/**
 * The trip read as a journey rather than as a list of pins: which cities you are
 * based in, in which order, and roughly when you move between them.
 *
 * The planner map already draws everything at street level — every place, every
 * day route, every booking arc. What it never drew is the shape of the trip:
 * zoom out over a three-week route and you get a field of identical dots with no
 * way to tell Lisbon from Porto, let alone which came first. This module derives
 * the overview layer from data the planner already holds, so it costs no request
 * and works offline like the rest of the plan.
 *
 * Deliberately pure and React-free: both map renderers (Leaflet and the two GL
 * engines) draw the same arrows, and the only way they cannot disagree about
 * WHICH arrows is for neither of them to work it out.
 */

/**
 * How far from a city's centre still counts as being in that city.
 *
 * A radius, not a diameter, and measured against the running centroid of the
 * stay — so a week in Berlin with a day out to Potsdam (26 km) stays one stop,
 * while Berlin → Dresden (165 km) is a move. 45 km is about where a metro area
 * and its day-out ring stop being somewhere you'd describe with one name; the
 * planner's own MAX_DAY_TRIP_KM (150) is far too wide for this, because it
 * answers a different question — how far a day out of a hotel plausibly
 * reaches, not what anyone would call the same place.
 */
export const CITY_RADIUS_KM = 45

/** A day reduced to where you were that day, plus the text that can name it. */
interface DayAnchor {
  day: Day
  order: number
  /**
   * The number the rest of the planner prints for this day (`dayplan.dayN`).
   * Separate from `order`, which only has to sort: getDayOrder falls back to a
   * 0-based index where day_number is 1-based, so it is not a label.
   */
  dayNumber: number
  lat: number
  lng: number
  /** Every address the day offers, best-first (the hotel leads — it is the base). */
  addresses: string[]
  /** Names of the day's stops, for the last-resort label. */
  names: { name: string; lat: number; lng: number }[]
}

/** One city centre the trip is based in for a stretch of consecutive days. */
export interface JourneyStop {
  /** Stable across re-derivations of the same plan — the renderers key on it. */
  key: string
  /** The city name, derived from the stops' addresses (see labelStops). */
  label: string
  lat: number
  lng: number
  dayIds: number[]
  /** Wall-clock dates, `null` on a trip whose days carry none. */
  startDate: string | null
  endDate: string | null
  /** 1-based day numbers, the fallback for a trip planned without dates. */
  startDayNumber: number
  endDayNumber: number
}

/** The move between two consecutive city centres — one drawn arrow. */
export interface JourneyLeg {
  key: string
  from: JourneyStop
  to: JourneyStop
  distanceKm: number
  /**
   * When the move happens, approximately: the first day you are in `to`. The
   * plan records no travel time at this altitude, and pretending otherwise
   * ("depart 09:15") would be inventing data, so the overview says the day and
   * stops there.
   */
  departDate: string | null
  departDayNumber: number
}

export interface JourneyArrowsInput {
  days: Day[]
  assignments: AssignmentsMap
  accommodations?: Accommodation[]
}

const hasCoords = (lat?: number | null, lng?: number | null): boolean =>
  typeof lat === 'number' && Number.isFinite(lat) && typeof lng === 'number' && Number.isFinite(lng)

/**
 * Where a day sits, as one point.
 *
 * The hotel wins when there is one: a stay IS the city you are based in, and it
 * stays put on a day whose activities wander. Without one, the mean of the day's
 * stops is the honest answer — a day with stops on both sides of a city centres
 * on the city.
 */
function anchorForDay(day: Day, position: number, assignments: AssignmentsMap, accommodations: Accommodation[], days: Day[]): DayAnchor | null {
  const stops = (assignments[String(day.id)] ?? [])
    .map(a => a.place)
    .filter((p): p is NonNullable<typeof p> => !!p && hasCoords(p.lat, p.lng))

  const hotel = accommodations.find(a =>
    hasCoords(a.place_lat, a.place_lng)
    && isDayInAccommodationRange(day, a.start_day_id, a.end_day_id, days),
  )

  let lat: number, lng: number
  if (hotel) {
    lat = hotel.place_lat as number
    lng = hotel.place_lng as number
  } else if (stops.length > 0) {
    lat = stops.reduce((s, p) => s + (p.lat as number), 0) / stops.length
    lng = stops.reduce((s, p) => s + (p.lng as number), 0) / stops.length
  } else {
    // Nothing pins this day to the map. It is not evidence of a move, so it is
    // left out entirely rather than breaking the stay it sits inside — the days
    // around it carry the same city and close over it.
    return null
  }

  const addresses = [
    ...(hotel?.place_address ? [hotel.place_address] : []),
    ...stops.map(p => p.address).filter((a): a is string => !!a),
  ]
  const names = [
    ...(hotel?.place_name && hasCoords(hotel.place_lat, hotel.place_lng)
      ? [{ name: hotel.place_name, lat: hotel.place_lat as number, lng: hotel.place_lng as number }]
      : []),
    ...stops.map(p => ({ name: p.name, lat: p.lat as number, lng: p.lng as number })),
  ]

  return { day, order: getDayOrder(day, days), dayNumber: day.day_number ?? position + 1, lat, lng, addresses, names }
}

/** A stay under construction — the anchors that have joined it so far. */
interface Cluster {
  anchors: DayAnchor[]
  lat: number
  lng: number
}

const recentre = (anchors: DayAnchor[]): { lat: number; lng: number } => ({
  lat: anchors.reduce((s, a) => s + a.lat, 0) / anchors.length,
  lng: anchors.reduce((s, a) => s + a.lng, 0) / anchors.length,
})

/** Walk the days in order, opening a new stay whenever the day leaves the current one. */
function clusterAnchors(anchors: DayAnchor[]): Cluster[] {
  const out: Cluster[] = []
  for (const anchor of anchors) {
    const current = out[out.length - 1]
    if (current && haversineKm(current, anchor) <= CITY_RADIUS_KM) {
      current.anchors.push(anchor)
      Object.assign(current, recentre(current.anchors))
      continue
    }
    out.push({ anchors: [anchor], lat: anchor.lat, lng: anchor.lng })
  }
  return out
}

/**
 * Collapse the there-and-back-again that is not a move.
 *
 * A single day out to somewhere past the radius — Paris, a day in Reims, Paris
 * again — clusters as three stays and would draw two arrows describing a trip
 * nobody took. It is a day trip exactly when the stays on either side of it are
 * the same place, which is what the check below asks. Repeated to fixpoint so
 * two such days in one stay collapse too.
 */
function collapseDayTrips(clusters: Cluster[]): Cluster[] {
  let result = clusters
  for (;;) {
    let merged = false
    for (let i = 1; i < result.length - 1; i++) {
      const mid = result[i]
      if (mid.anchors.length !== 1) continue
      if (haversineKm(result[i - 1], result[i + 1]) > CITY_RADIUS_KM) continue
      const anchors = [...result[i - 1].anchors, ...mid.anchors, ...result[i + 1].anchors]
      const joined: Cluster = { anchors, ...recentre(anchors) }
      result = [...result.slice(0, i - 1), joined, ...result.slice(i + 2)]
      merged = true
      break
    }
    if (!merged) return result
  }
}

/**
 * Join neighbours that drifted apart.
 *
 * Clustering compares each day against a centroid that moves as days join it, so
 * two consecutive stays can still end up closer together than the radius — the
 * second opened while the first had been pulled to its far edge. Two stops 20 km
 * apart are one city with a spurious arrow between them.
 */
function mergeNearNeighbours(clusters: Cluster[]): Cluster[] {
  const out: Cluster[] = []
  for (const cluster of clusters) {
    const prev = out[out.length - 1]
    if (prev && haversineKm(prev, cluster) <= CITY_RADIUS_KM) {
      const anchors = [...prev.anchors, ...cluster.anchors]
      out[out.length - 1] = { anchors, ...recentre(anchors) }
      continue
    }
    out.push(cluster)
  }
  return out
}

/** A postcode, a house number, a `7th Arrondissement` — never the name of a city. */
const hasDigit = (s: string) => /\d/.test(s)

/**
 * The parts of one address that could plausibly be a city.
 *
 * Nominatim's display_name runs venue → street → suburb → city → county →
 * state → country, so the city is always in the middle: the first part names
 * the place itself and the last names the country, and neither is ever the
 * answer. Anything carrying a digit goes too.
 */
export function cityCandidates(address: string): string[] {
  const parts = address.split(',').map(p => p.trim()).filter(p => p && !hasDigit(p))
  if (parts.length <= 1) return parts
  const withoutCountry = parts.slice(0, -1)
  return withoutCountry.length >= 2 ? withoutCountry.slice(1) : withoutCountry
}

interface Candidate { count: number; indexSum: number }

/** Candidate parts of one stay, with how often and how early each one appears. */
function candidatesOf(cluster: Cluster): Map<string, Candidate> {
  const tally = new Map<string, Candidate>()
  for (const anchor of cluster.anchors) {
    for (const address of anchor.addresses) {
      cityCandidates(address).forEach((part, index) => {
        const seen = tally.get(part) ?? { count: 0, indexSum: 0 }
        tally.set(part, { count: seen.count + 1, indexSum: seen.indexSum + index })
      })
    }
  }
  return tally
}

/**
 * Name each stay, using the whole trip to do it.
 *
 * Within one stay the country and the region are as common as the city — every
 * address in Paris ends "Île-de-France, Metropolitan France" — so frequency
 * alone names half a trip "France". What separates them is that the city is the
 * most common part UNIQUE to this stay: a part shared with any other stay is by
 * construction not what tells them apart. Ties (a city and its department, both
 * on every address) go to whichever sits earlier in the address, which is the
 * order Nominatim writes them in.
 *
 * A trip with one stay has nothing to contrast against and needs no label to
 * distinguish anything — it draws no arrows at all — so it falls through to the
 * frequency answer, then to the name of the stop nearest the centre.
 */
function labelStops(clusters: Cluster[]): string[] {
  const tallies = clusters.map(candidatesOf)
  return clusters.map((cluster, i) => {
    const own = tallies[i]
    const elsewhere = new Set(tallies.flatMap((t, j) => (j === i ? [] : [...t.keys()])))
    const ranked = [...own.entries()]
      .sort(([aPart, a], [bPart, b]) =>
        b.count - a.count
        || a.indexSum / a.count - b.indexSum / b.count
        || aPart.length - bPart.length
        || aPart.localeCompare(bPart))

    const distinctive = ranked.find(([part]) => !elsewhere.has(part))
    if (distinctive) return distinctive[0]
    if (ranked.length > 0) return ranked[0][0]

    // No usable address anywhere in the stay: the stop closest to its centre is
    // the most honest thing left to call it.
    const nearest = cluster.anchors
      .flatMap(a => a.names)
      .sort((a, b) => haversineKm(cluster, a) - haversineKm(cluster, b))[0]
    return nearest?.name ?? ''
  })
}

const datesOf = (anchors: DayAnchor[]): { startDate: string | null; endDate: string | null } => {
  const dates = anchors.map(a => a.day.date).filter((d): d is string => !!d).sort()
  return { startDate: dates[0] ?? null, endDate: dates[dates.length - 1] ?? null }
}

/**
 * The trip's city centres in itinerary order.
 *
 * Exported on its own because the stops are worth drawing even when there is
 * only one of them — a single-city trip has no arrows but still has a labelled
 * centre.
 */
export function buildJourneyStops({ days, assignments, accommodations = [] }: JourneyArrowsInput): JourneyStop[] {
  const ordered = [...(days ?? [])].sort((a, b) => getDayOrder(a, days) - getDayOrder(b, days))
  const anchors = ordered
    .map((day, position) => anchorForDay(day, position, assignments ?? {}, accommodations, days))
    .filter((a): a is DayAnchor => a !== null)
  if (anchors.length === 0) return []

  const clusters = mergeNearNeighbours(collapseDayTrips(clusterAnchors(anchors)))
  const labels = labelStops(clusters)

  return clusters.map((cluster, i) => {
    const dayIds = cluster.anchors.map(a => a.day.id)
    return {
      // The first day pins the stop: day ids are stable, and a stay that gains
      // or loses a day at its end keeps its identity (and so its marker).
      key: `stop-${dayIds[0]}`,
      label: labels[i],
      lat: cluster.lat,
      lng: cluster.lng,
      dayIds,
      ...datesOf(cluster.anchors),
      startDayNumber: cluster.anchors[0].dayNumber,
      endDayNumber: cluster.anchors[cluster.anchors.length - 1].dayNumber,
    }
  })
}

/** The arrows: one per move between consecutive city centres. */
export function buildJourneyLegs(input: JourneyArrowsInput): JourneyLeg[] {
  const stops = buildJourneyStops(input)
  return stops.slice(1).map((to, i) => {
    const from = stops[i]
    return {
      key: `${from.key}->${to.key}`,
      from,
      to,
      distanceKm: haversineKm(from, to),
      departDate: to.startDate,
      departDayNumber: to.startDayNumber,
    }
  })
}
