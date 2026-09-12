import { Fragment, useMemo } from 'react'
import { Marker, Polyline, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { LucideIcon } from 'lucide-react'
import { RES_ICONS } from '../Planner/DayPlanSidebar.constants'
import { useJourneyArrows } from './useJourneyArrows'
import {
  JOURNEY_ARROW_CASING,
  JOURNEY_ARROW_COLOR,
  legPillHtml,
  stopPillHtml,
} from './journeyArrowMarkup'
import type { Accommodation, Reservation } from '../../types'

/**
 * The journey overview on the Leaflet renderer: the trip's city centres, in
 * order, joined by dated directional arrows.
 *
 * Both readouts are hover-driven, because the layer has to stay legible at the
 * zoom where it is useful. A fifteen-stop trip drew fifteen open pills that
 * overlapped into a wall of text, so a stop is a dot until pointed at; and the
 * mode of travel hangs off the line rather than adding a third line of text to
 * every pill.
 */

const JOURNEY_PANE = 'journey-overview'

/** Invisible, fat, and the only thing on the layer that catches a pointer. */
const HIT_WEIGHT = 18

function useJourneyPane() {
  const map = useMap()
  useMemo(() => {
    if (typeof map?.getPane !== 'function' || typeof map?.createPane !== 'function') return
    if (map.getPane(JOURNEY_PANE)) return
    const pane = map.createPane(JOURNEY_PANE)
    // Above the day route and the booking arcs (both in the default overlay
    // pane at 400) and below the booking endpoints at 650, whose labels the
    // overview should not bury.
    pane.style.zIndex = '640'
    // `auto`, not `none`: the pills and the hit lines are the whole point of the
    // hover behaviour. Leaflet gives every non-interactive path
    // `pointer-events: none` of its own, so the drawn arcs still let a click
    // through to whatever is under them — only the deliberate targets catch it.
    pane.style.pointerEvents = 'auto'
  }, [map])
}

interface Props {
  accommodations?: Accommodation[]
  reservations?: Reservation[]
}

export default function JourneyArrowOverlay({ accommodations, reservations }: Props) {
  useJourneyPane()
  const { enabled, stops, legs } = useJourneyArrows({ accommodations, reservations, wrapCopies: true })

  if (!enabled) return null

  return (
    <>
      {legs.map(leg => (
        <Fragment key={leg.key}>
          {leg.arcs.map((arc, i) => (
            <Fragment key={`${leg.key}-${i}`}>
              <Polyline
                positions={arc}
                pane={JOURNEY_PANE}
                pathOptions={{
                  color: JOURNEY_ARROW_CASING, weight: 7, opacity: 0.55,
                  lineCap: 'round', lineJoin: 'round', interactive: false,
                }}
              />
              <Polyline
                positions={arc}
                pane={JOURNEY_PANE}
                pathOptions={{
                  color: JOURNEY_ARROW_COLOR, weight: 3, opacity: 0.95,
                  // Dashed: the overview says "you go from here to there", not
                  // "along this line". A solid stroke at this weight reads as a
                  // route, which is the one thing it is not.
                  dashArray: '9, 7', lineCap: 'round', lineJoin: 'round', interactive: false,
                }}
              />
            </Fragment>
          ))}

          {/* A 3px dashed line is not a pointer target, so the readout hangs off
              a transparent band over it — the same trick `trip-route-hit` uses
              to make the day route clickable. Drawn once per leg (on the primary
              arc) rather than per wrapped copy: a duplicate band would put two
              tooltips on the same leg. */}
          <Polyline
            positions={leg.arcs[0]}
            pane={JOURNEY_PANE}
            pathOptions={{ color: JOURNEY_ARROW_COLOR, opacity: 0, weight: HIT_WEIGHT, lineCap: 'round' }}
          >
            <Tooltip sticky direction="top" opacity={1} className="map-tooltip">
              <JourneyLegTip
                mode={leg.mode}
                modeLabel={leg.modeLabel}
                from={leg.from.label}
                to={leg.to.label}
                date={leg.dateLabel}
              />
            </Tooltip>
          </Polyline>

          <Marker
            position={leg.head.point}
            pane={JOURNEY_PANE}
            interactive={false}
            icon={L.divIcon({
              className: '',
              html: legPillHtml(leg.dateLabel, leg.head.bearing, leg.modeLabel, leg.modeIcon),
              iconSize: [0, 0],
              iconAnchor: [0, 0],
            })}
          />
        </Fragment>
      ))}

      {stops.map(stop => (
        <Marker
          key={stop.key}
          position={[stop.lat, stop.lng]}
          pane={JOURNEY_PANE}
          interactive={false}
          icon={L.divIcon({
            className: '',
            html: stopPillHtml(stop.label, stop.dateLabel),
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          })}
        />
      ))}
    </>
  )
}

/**
 * What hovering a leg says: how you travelled, between where and where, on what
 * date.
 *
 * The mode line appears only when a booking actually records one. Most legs on
 * most trips have no booking at all, and filling that in with a guessed "Car"
 * would be inventing the one fact this readout exists to report — so the
 * tooltip simply says less.
 *
 * Rendered as React rather than from the shared markup module because a Leaflet
 * tooltip takes children: the icon can be the real component instead of an SVG
 * string handed to dangerouslySetInnerHTML.
 */
function JourneyLegTip({ mode, modeLabel, from, to, date }: {
  mode: string | null
  modeLabel: string
  from: string
  to: string
  date: string
}) {
  const Icon = mode ? (RES_ICONS as Record<string, LucideIcon | undefined>)[mode] : undefined
  return (
    <>
      {modeLabel && (
        <div className="trek-journey-tip">
          {Icon && <Icon size={12} strokeWidth={2.25} />}
          <span>{modeLabel}</span>
        </div>
      )}
      <div style={{ fontWeight: 600, fontSize: 12 }}>{from} → {to}</div>
      {date && <div className="text-content-muted" style={{ fontSize: 11 }}>{date}</div>}
    </>
  )
}
