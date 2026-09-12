import { useMemo } from 'react'
import { useTripStore } from '../../store/tripStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useTranslation } from '../../i18n'
import { geodesicArcs } from './flightGeodesy'
import { buildJourneyStops, buildJourneyLegs, type JourneyLeg, type JourneyStop } from './journeyArrows'
import { pointAlongArc, type ArcPoint } from './journeyArrowMarkup'
import type { Accommodation } from '../../types'

/**
 * The journey overview, derived once and handed to whichever renderer is
 * mounted: geometry, ready-formatted labels, and whether to draw it at all.
 *
 * Everything a renderer would otherwise have to work out for itself lives here
 * on purpose. Leaflet and the two GL engines draw arcs by completely different
 * means, but they must agree to the metre about WHERE the arcs are and to the
 * character about what the pills say — and the only way to guarantee that is for
 * neither of them to compute it.
 */

/** Where the arrowhead sits on its leg: past the middle, so it reads as motion. */
const ARROWHEAD_FRACTION = 0.62

/**
 * A stable empty default, so a caller with no stays (the collection and journey
 * maps never have any) does not hand this a fresh array every render and
 * invalidate the memo that derives the whole trip.
 */
const NO_ACCOMMODATIONS: Accommodation[] = []

export interface JourneyArrowStop extends JourneyStop {
  /** "12–15 Apr", or "Days 3–5" on a trip planned without dates. */
  dateLabel: string
}

export interface JourneyArrowLeg extends JourneyLeg {
  /** Polylines to draw, already split for the antimeridian by geodesicArcs. */
  arcs: [number, number][][]
  /** Placement and heading of the arrowhead on the primary arc. */
  head: ArcPoint
  /** "14 Apr", or "Day 4" without dates. */
  dateLabel: string
}

export interface JourneyArrows {
  enabled: boolean
  stops: JourneyArrowStop[]
  legs: JourneyArrowLeg[]
}

export interface UseJourneyArrowsOptions {
  /**
   * The trip's stays. Not in tripStore (the planner holds them), so the two
   * shells pass them through; without them the overview still works and simply
   * anchors each day on its own stops instead of on the hotel.
   */
  accommodations?: Accommodation[]
  /**
   * Leaflet's vector layers do not repeat across world copies and the GL
   * engines do — the same distinction geodesicArcs already draws. Passed rather
   * than guessed so the caller's renderer decides.
   */
  wrapCopies: boolean
}

const utcDate = (iso: string): Date | null => {
  const d = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

const DAY_MONTH: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'UTC' }

/**
 * `formatRange` is ES2021 and this workspace's `lib` predates it, so TypeScript
 * does not know the method exists. Optional rather than asserted: a browser old
 * enough to be missing it is exactly what the fallback below is for.
 */
type RangeFormat = Intl.DateTimeFormat & { formatRange?: (start: Date, end: Date) => string }

/**
 * One date, or a range written the way the locale writes ranges ("12–15 Apr",
 * "12 Apr – 3 May"). `formatRange` is what knows to print the month once when
 * both ends share it; where it is missing, two formatted dates with an en dash
 * says the same thing less elegantly.
 */
function formatDateRange(startIso: string, endIso: string, locale: string): string {
  const start = utcDate(startIso)
  const end = utcDate(endIso)
  if (!start) return ''
  const fmt: RangeFormat = new Intl.DateTimeFormat(locale, DAY_MONTH)
  if (!end || startIso === endIso) return fmt.format(start)
  if (typeof fmt.formatRange === 'function') return fmt.formatRange(start, end)
  return `${fmt.format(start)} – ${fmt.format(end)}`
}

export function useJourneyArrows({ accommodations = NO_ACCOMMODATIONS, wrapCopies }: UseJourneyArrowsOptions): JourneyArrows {
  const enabled = useSettingsStore(s => s.settings.map_journey_arrows) === true
  const days = useTripStore(s => s.days)
  const assignments = useTripStore(s => s.assignments)
  const { t, locale } = useTranslation()

  return useMemo<JourneyArrows>(() => {
    // Nothing is derived while the layer is off: the clustering walks every day
    // and every assignment, and the overview is opt-in precisely because most
    // sessions never ask for it.
    if (!enabled) return { enabled, stops: [], legs: [] }

    const input = { days, assignments, accommodations }

    // `dayplan.dayN` rather than a second "Day {n}" of this layer's own: the
    // planner already prints day numbers with it in every locale, and the
    // overview naming the same day differently would be a bug with 23 spellings.
    const dayLabel = (from: number, to: number) =>
      from === to ? t('dayplan.dayN', { n: from }) : t('map.journey.dayRange', { from, to })

    const stops: JourneyArrowStop[] = buildJourneyStops(input).map(stop => ({
      ...stop,
      dateLabel: stop.startDate
        ? formatDateRange(stop.startDate, stop.endDate ?? stop.startDate, locale)
        : dayLabel(stop.startDayNumber, stop.endDayNumber),
    }))

    const legs = buildJourneyLegs(input).flatMap<JourneyArrowLeg>(leg => {
      const arcs = geodesicArcs([leg.from.lat, leg.from.lng], [leg.to.lat, leg.to.lng], wrapCopies)
      const head = pointAlongArc(arcs[0], ARROWHEAD_FRACTION)
      // A zero-length arc has no heading to point along. It should not reach
      // here — the stops it joins are a city apart by construction — but a leg
      // with no direction is not a directional arrow, so it is dropped rather
      // than drawn pointing north.
      if (!head) return []
      return [{
        ...leg,
        arcs,
        head,
        dateLabel: leg.departDate
          ? formatDateRange(leg.departDate, leg.departDate, locale)
          : t('map.journey.dayOne', { n: leg.departDayNumber }),
      }]
    })

    return { enabled, stops, legs }
  }, [enabled, days, assignments, accommodations, wrapCopies, t, locale])
}
