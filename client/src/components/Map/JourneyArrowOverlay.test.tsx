import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '../../../tests/helpers/render'
import { resetAllStores, seedStore } from '../../../tests/helpers/store'
import { useSettingsStore } from '../../store/settingsStore'
import { useTripStore } from '../../store/tripStore'
import type { AssignmentsMap, Day } from '../../types'

// The Leaflet map jsdom cannot provide. Only the pane registry matters here —
// the overlay draws nothing that depends on the projection.
const leaflet = vi.hoisted(() => {
  const panes = new Map<string, HTMLElement>()
  return {
    panes,
    map: {
      getPane: (name: string) => panes.get(name),
      createPane: (name: string) => {
        const el = document.createElement('div')
        panes.set(name, el)
        return el
      },
    },
  }
})

interface MarkerProps {
  position: [number, number]
  icon?: { options?: { html?: string } }
  pane?: string
  interactive?: boolean
}
interface PolylineProps {
  positions: [number, number][]
  pathOptions?: Record<string, unknown>
  pane?: string
}

vi.mock('react-leaflet', () => ({
  Marker: ({ position, icon, pane, interactive }: MarkerProps) => (
    <div
      data-testid="journey-marker"
      data-lat={position[0]}
      data-lng={position[1]}
      data-pane={pane ?? ''}
      data-interactive={String(interactive)}
      data-icon-html={icon?.options?.html ?? ''}
    />
  ),
  Polyline: ({ positions, pathOptions, pane }: PolylineProps) => (
    <div
      data-testid="journey-line"
      data-pane={pane ?? ''}
      data-point-count={positions.length}
      data-path-options={JSON.stringify(pathOptions ?? null)}
    />
  ),
  useMap: () => leaflet.map,
}))

vi.mock('leaflet', () => {
  const divIcon = vi.fn((options: Record<string, unknown>) => ({ options }))
  return { default: { divIcon }, divIcon }
})

const JourneyArrowOverlay = (await import('./JourneyArrowOverlay')).default

const PARIS: [number, number] = [48.8566, 2.3522]
const LYON: [number, number] = [45.7640, 4.8357]

function seedTrip() {
  const days: Day[] = [
    { id: 1, trip_id: 1, day_number: 1, date: '2026-04-12' },
    { id: 2, trip_id: 1, day_number: 2, date: '2026-04-14' },
  ] as Day[]
  const assignments: AssignmentsMap = {
    '1': [{ id: 1, day_id: 1, place_id: 1, order_index: 0, place: { id: 1, name: 'Louvre', lat: PARIS[0], lng: PARIS[1], address: 'Paris, Ile-de-France, France' } }],
    '2': [{ id: 2, day_id: 2, place_id: 2, order_index: 0, place: { id: 2, name: 'Fourvière', lat: LYON[0], lng: LYON[1], address: 'Lyon, Auvergne-Rhône-Alpes, France' } }],
  } as unknown as AssignmentsMap
  seedStore(useTripStore, { days, assignments })
}

const enable = (on: boolean) =>
  seedStore(useSettingsStore, { settings: { ...useSettingsStore.getState().settings, map_journey_arrows: on } })

afterEach(() => {
  resetAllStores()
  leaflet.panes.clear()
})

describe('JourneyArrowOverlay', () => {
  it('draws nothing at all while the layer is off', () => {
    seedTrip()
    enable(false)
    render(<JourneyArrowOverlay />)
    expect(screen.queryByTestId('journey-line')).toBeNull()
    expect(screen.queryByTestId('journey-marker')).toBeNull()
  })

  it('draws a casing and a dashed line per leg, plus a pill per stop and per move', () => {
    seedTrip()
    enable(true)
    render(<JourneyArrowOverlay />)
    const lines = screen.getAllByTestId('journey-line')
    // One leg, drawn twice: the white casing under the dashed violet line.
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0].dataset.pathOptions!).dashArray).toBeUndefined()
    expect(JSON.parse(lines[1].dataset.pathOptions!).dashArray).toBe('9, 7')
    // Two city pills and one arrowhead pill.
    expect(screen.getAllByTestId('journey-marker')).toHaveLength(3)
  })

  it('names each city and dates each stay', () => {
    seedTrip()
    enable(true)
    render(<JourneyArrowOverlay />)
    const html = screen.getAllByTestId('journey-marker').map(m => m.dataset.iconHtml ?? '').join('')
    expect(html).toContain('Paris')
    expect(html).toContain('Lyon')
    // The move is dated by the first day at its destination. Day and month are
    // ordered by the locale, so assert on the parts rather than on en-US's order.
    const arrow = screen.getAllByTestId('journey-marker')
      .map(m => m.dataset.iconHtml ?? '').find(h => h.includes('rotate('))!
    expect(arrow).toContain('14')
    expect(arrow).toContain('Apr')
  })

  it('points the arrowhead along the leg', () => {
    seedTrip()
    enable(true)
    render(<JourneyArrowOverlay />)
    const head = screen.getAllByTestId('journey-marker').find(m => m.dataset.iconHtml?.includes('rotate('))
    // Paris → Lyon runs roughly south-east.
    const angle = Number(head!.dataset.iconHtml!.match(/rotate\((-?[\d.]+)deg\)/)![1])
    expect(angle).toBeGreaterThan(90)
    expect(angle).toBeLessThan(180)
  })

  it('keeps everything in its own pane, and takes no pointer events', () => {
    seedTrip()
    enable(true)
    render(<JourneyArrowOverlay />)
    const pane = leaflet.panes.get('journey-overview')
    expect(pane?.style.pointerEvents).toBe('none')
    // Above the day route and booking arcs (400), below the endpoints (650).
    expect(Number(pane?.style.zIndex)).toBeGreaterThan(400)
    expect(Number(pane?.style.zIndex)).toBeLessThan(650)
    for (const el of screen.getAllByTestId('journey-marker')) {
      expect(el.dataset.pane).toBe('journey-overview')
      expect(el.dataset.interactive).toBe('false')
    }
    for (const el of screen.getAllByTestId('journey-line')) {
      expect(el.dataset.pane).toBe('journey-overview')
      expect(JSON.parse(el.dataset.pathOptions!).interactive).toBe(false)
    }
  })

  it('draws a labelled centre but no arrow for a trip that never leaves one city', () => {
    seedStore(useTripStore, {
      days: [{ id: 1, trip_id: 1, day_number: 1, date: '2026-04-12' }] as Day[],
      assignments: {
        '1': [{ id: 1, day_id: 1, place_id: 1, order_index: 0, place: { id: 1, name: 'Louvre', lat: PARIS[0], lng: PARIS[1], address: 'Paris, Ile-de-France, France' } }],
      } as unknown as AssignmentsMap,
    })
    enable(true)
    render(<JourneyArrowOverlay />)
    expect(screen.queryByTestId('journey-line')).toBeNull()
    expect(screen.getAllByTestId('journey-marker')).toHaveLength(1)
  })

  it('anchors a stay on the stay, when the planner passes one', () => {
    seedTrip()
    enable(true)
    render(<JourneyArrowOverlay accommodations={[{
      id: 1, trip_id: 1, place_id: 9, start_day_id: 1, end_day_id: 1,
      place_name: 'Hôtel Chopin', place_address: 'Hôtel Chopin, Paris, France',
      place_lat: 48.87, place_lng: 2.34,
    }] as never} />)
    const paris = screen.getAllByTestId('journey-marker').find(m => m.dataset.iconHtml?.includes('Paris'))
    expect(Number(paris!.dataset.lat)).toBeCloseTo(48.87, 4)
  })
})
