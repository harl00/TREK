import { Fragment, useMemo } from 'react'
import { Marker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useJourneyArrows } from './useJourneyArrows'
import {
  JOURNEY_ARROW_CASING,
  JOURNEY_ARROW_COLOR,
  estimatePillWidth,
  legPillHtml,
  stopPillHtml,
} from './journeyArrowMarkup'
import type { Accommodation } from '../../types'

/**
 * The journey overview on the Leaflet renderer: the trip's city centres, in
 * order, joined by dated directional arrows.
 *
 * Passive by design — the pane takes no pointer events, so every marker, route
 * and POI underneath stays as clickable as it was with the layer off. It is a
 * caption over the map, not another thing to hit.
 */

const JOURNEY_PANE = 'journey-overview'

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
    pane.style.pointerEvents = 'none'
  }, [map])
}

const PILL_HEIGHT = 34
const HEAD_SIZE = 26

export default function JourneyArrowOverlay({ accommodations }: { accommodations?: Accommodation[] }) {
  useJourneyPane()
  const { enabled, stops, legs } = useJourneyArrows({ accommodations, wrapCopies: true })

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
          <Marker
            position={leg.head.point}
            pane={JOURNEY_PANE}
            interactive={false}
            icon={L.divIcon({
              className: '',
              html: legPillHtml(leg.dateLabel, leg.head.bearing),
              iconSize: [estimatePillWidth('', leg.dateLabel), HEAD_SIZE],
              iconAnchor: [estimatePillWidth('', leg.dateLabel) / 2, HEAD_SIZE / 2],
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
            iconSize: [estimatePillWidth(stop.label, stop.dateLabel), PILL_HEIGHT],
            iconAnchor: [estimatePillWidth(stop.label, stop.dateLabel) / 2, PILL_HEIGHT / 2],
          })}
        />
      ))}
    </>
  )
}
