import { describe, it, expect } from 'vitest'
import { buildJourneyLegs, buildJourneyStops, cityCandidates, CITY_RADIUS_KM } from './journeyArrows'
import type { Accommodation, AssignmentsMap, Day } from '../../types'

// Real coordinates, because the thresholds are in kilometres and a made-up grid
// would prove the clustering works on a made-up grid. Versailles is a day out
// from Paris (17 km), Reims is not (129 km), Lyon and Marseille are other trips
// entirely as far as the radius is concerned.
const PARIS: [number, number] = [48.8566, 2.3522]
const VERSAILLES: [number, number] = [48.8014, 2.1301]
const REIMS: [number, number] = [49.2583, 4.0317]
const LYON: [number, number] = [45.7640, 4.8357]
const MARSEILLE: [number, number] = [43.2965, 5.3698]

let nextId = 1

function day(dayNumber: number, date: string | null): Day {
  return { id: 100 + dayNumber, trip_id: 1, day_number: dayNumber, date } as Day
}

interface StopSpec { at: [number, number]; name?: string; address?: string }

function stops(dayRow: Day, specs: StopSpec[]) {
  return specs.map((spec, i) => ({
    id: nextId++,
    day_id: dayRow.id,
    place_id: nextId,
    order_index: i,
    place: {
      id: nextId,
      name: spec.name ?? `Place ${nextId}`,
      lat: spec.at[0],
      lng: spec.at[1],
      address: spec.address ?? null,
    },
  }))
}

/** A trip as the planner holds it: ordered days plus the assignments map. */
function trip(rows: { dayNumber: number; date: string | null; specs: StopSpec[] }[]) {
  const days = rows.map(r => day(r.dayNumber, r.date))
  const assignments: AssignmentsMap = {}
  days.forEach((d, i) => { assignments[String(d.id)] = stops(d, rows[i].specs) as AssignmentsMap[string] })
  return { days, assignments }
}

const at = (point: [number, number], address?: string, name?: string): StopSpec => ({ at: point, address, name })

describe('cityCandidates', () => {
  // The shape most providers actually return, and the one that broke this:
  // the city travels glued to its postcode, so a "drop anything with a digit"
  // filter throws away the answer and leaves the country to win on frequency.
  it('keeps the city that arrives glued to a postcode', () => {
    expect(cityCandidates('5 Avenue Anatole France, 75007 Paris, France'))
      .toEqual(['Avenue Anatole France', 'Paris'])
  })

  it('strips a trailing postcode too', () => {
    expect(cityCandidates('Karlsplatz 1, Wien 1010, Austria')).toEqual(['Karlsplatz', 'Wien'])
  })

  it('keeps a leading city — the first part is not reliably a venue', () => {
    expect(cityCandidates('Paris, Ile-de-France, France')).toEqual(['Paris', 'Ile-de-France'])
    expect(cityCandidates('Amsterdam, North Holland, Netherlands')).toEqual(['Amsterdam', 'North Holland'])
  })

  it('keeps the long Nominatim form intact apart from the country', () => {
    expect(cityCandidates('Eiffel Tower, 5, Avenue Anatole France, Paris, Île-de-France, 75007, France'))
      .toEqual(['Eiffel Tower', 'Avenue Anatole France', 'Paris', 'Île-de-France'])
  })

  it('keeps the city of a short address, dropping only the country', () => {
    expect(cityCandidates('Paris, France')).toEqual(['Paris'])
  })

  it('keeps a lone part as-is — there is nothing to strip it down to', () => {
    expect(cityCandidates('Paris')).toEqual(['Paris'])
  })

  it('answers nothing for an address that is all numbers', () => {
    expect(cityCandidates('75007, 5')).toEqual([])
  })
})

describe('buildJourneyStops', () => {
  it('has nothing to say about a trip with no days', () => {
    expect(buildJourneyStops({ days: [], assignments: {} })).toEqual([])
  })

  it('ignores days that pin nothing to the map', () => {
    const { days, assignments } = trip([
      { dayNumber: 1, date: '2026-04-12', specs: [] },
      { dayNumber: 2, date: '2026-04-13', specs: [at(PARIS, 'Paris, Ile-de-France, France')] },
    ])
    const [stop, ...rest] = buildJourneyStops({ days, assignments })
    expect(rest).toEqual([])
    // Day 1 contributes no geography, so the stay starts on the day that does.
    expect(stop.startDate).toBe('2026-04-13')
    expect(stop.dayIds).toEqual([days[1].id])
  })

  it('reads a week in one city as one stop', () => {
    const { days, assignments } = trip([
      { dayNumber: 1, date: '2026-04-12', specs: [at(PARIS, 'Paris, Ile-de-France, France')] },
      { dayNumber: 2, date: '2026-04-13', specs: [at(VERSAILLES, 'Versailles, Ile-de-France, France')] },
      { dayNumber: 3, date: '2026-04-14', specs: [at(PARIS, 'Paris, Ile-de-France, France')] },
    ])
    const result = buildJourneyStops({ days, assignments })
    expect(result).toHaveLength(1)
    expect(result[0].startDate).toBe('2026-04-12')
    expect(result[0].endDate).toBe('2026-04-14')
    expect(result[0].dayIds).toHaveLength(3)
  })

  it('splits when the trip moves city, and dates each stay', () => {
    const { days, assignments } = trip([
      { dayNumber: 1, date: '2026-04-12', specs: [at(PARIS, 'Paris, Ile-de-France, France')] },
      { dayNumber: 2, date: '2026-04-13', specs: [at(PARIS, 'Paris, Ile-de-France, France')] },
      { dayNumber: 3, date: '2026-04-14', specs: [at(LYON, 'Lyon, Auvergne-Rhône-Alpes, France')] },
      { dayNumber: 4, date: '2026-04-15', specs: [at(LYON, 'Lyon, Auvergne-Rhône-Alpes, France')] },
    ])
    const result = buildJourneyStops({ days, assignments })
    expect(result.map(s => s.label)).toEqual(['Paris', 'Lyon'])
    expect(result[0]).toMatchObject({ startDate: '2026-04-12', endDate: '2026-04-13', startDayNumber: 1, endDayNumber: 2 })
    expect(result[1]).toMatchObject({ startDate: '2026-04-14', endDate: '2026-04-15', startDayNumber: 3, endDayNumber: 4 })
  })

  it('does not read a single day out past the radius as a move', () => {
    const { days, assignments } = trip([
      { dayNumber: 1, date: '2026-04-12', specs: [at(PARIS, 'Paris, Ile-de-France, France')] },
      { dayNumber: 2, date: '2026-04-13', specs: [at(REIMS, 'Reims, Grand Est, France')] },
      { dayNumber: 3, date: '2026-04-14', specs: [at(PARIS, 'Paris, Ile-de-France, France')] },
    ])
    // Paris → Reims → Paris is a day trip, not two moves.
    expect(buildJourneyStops({ days, assignments })).toHaveLength(1)
  })

  it('keeps a stop that is passed through for more than a day', () => {
    const { days, assignments } = trip([
      { dayNumber: 1, date: '2026-04-12', specs: [at(PARIS, 'Paris, Ile-de-France, France')] },
      { dayNumber: 2, date: '2026-04-13', specs: [at(REIMS, 'Reims, Grand Est, France')] },
      { dayNumber: 3, date: '2026-04-14', specs: [at(REIMS, 'Reims, Grand Est, France')] },
      { dayNumber: 4, date: '2026-04-15', specs: [at(PARIS, 'Paris, Ile-de-France, France')] },
    ])
    expect(buildJourneyStops({ days, assignments }).map(s => s.label)).toEqual(['Paris', 'Reims', 'Paris'])
  })

  it('joins two stays that drifted apart but are the same place', () => {
    // Built on the equator so the distances are exactly 111.19 km per degree of
    // longitude: the third day opens a second stay (50 km from the first stay's
    // moved centroid) and the fourth pulls that stay back to within the radius.
    const eq = (lng: number): [number, number] => [0, lng]
    const { days, assignments } = trip([
      { dayNumber: 1, date: '2026-04-12', specs: [at(eq(0))] },
      { dayNumber: 2, date: '2026-04-13', specs: [at(eq(0.4))] },
      { dayNumber: 3, date: '2026-04-14', specs: [at(eq(0.65))] },
      { dayNumber: 4, date: '2026-04-15', specs: [at(eq(0.3))] },
    ])
    const result = buildJourneyStops({ days, assignments })
    expect(result).toHaveLength(1)
    expect(result[0].dayIds).toHaveLength(4)
  })

  it('centres a stay on its hotel rather than on that day’s activities', () => {
    const { days, assignments } = trip([
      { dayNumber: 1, date: '2026-04-12', specs: [at(VERSAILLES, 'Versailles, Ile-de-France, France')] },
    ])
    const hotel = {
      id: 1, trip_id: 1, place_id: 9, start_day_id: days[0].id, end_day_id: days[0].id,
      place_name: 'Hôtel du Louvre', place_address: 'Hôtel du Louvre, Paris, France',
      place_lat: PARIS[0], place_lng: PARIS[1],
    } as Accommodation
    const [stop] = buildJourneyStops({ days, assignments, accommodations: [hotel] })
    // The stay sits on the hotel, 17 km from the day's only activity.
    expect(stop.lat).toBeCloseTo(PARIS[0], 4)
    expect(stop.lng).toBeCloseTo(PARIS[1], 4)
  })

  it('never names a stay after a region another stay is also in', () => {
    // The region beats the city on frequency inside the first stay — one of its
    // two pins carries no city at all — so only the fact that the SECOND stay is
    // in the same region can rule it out. Nice and Aix are 150 km apart, which
    // is two stays and one Provence.
    const NICE: [number, number] = [43.7009, 7.2683]
    const AIX: [number, number] = [43.5297, 5.4474]
    const { days, assignments } = trip([
      { dayNumber: 1, date: '2026-04-12', specs: [
        at(NICE, 'Nice, Provence-Alpes-Côte d’Azur, France'),
        at(NICE, 'Provence-Alpes-Côte d’Azur, France'),
      ] },
      { dayNumber: 2, date: '2026-04-13', specs: [
        at(AIX, 'Aix-en-Provence, Provence-Alpes-Côte d’Azur, France'),
      ] },
    ])
    expect(buildJourneyStops({ days, assignments }).map(s => s.label))
      .toEqual(['Nice', 'Aix-en-Provence'])
  })

  it('never names a stay after the country every stay shares', () => {
    const { days, assignments } = trip([
      { dayNumber: 1, date: '2026-04-12', specs: [at(PARIS, 'Paris, France')] },
      { dayNumber: 2, date: '2026-04-13', specs: [at(MARSEILLE, 'Marseille, France')] },
    ])
    expect(buildJourneyStops({ days, assignments }).map(s => s.label)).toEqual(['Paris', 'Marseille'])
  })

  it('prefers the city to its region when both appear on every address', () => {
    const { days, assignments } = trip([
      { dayNumber: 1, date: '2026-04-12', specs: [
        at(PARIS, 'Louvre, Paris, Île-de-France, France'),
        at(PARIS, 'Orsay, Paris, Île-de-France, France'),
      ] },
      { dayNumber: 2, date: '2026-04-13', specs: [at(LYON, 'Fourvière, Lyon, Rhône, France')] },
    ])
    // Both parts appear twice; the city is the one written first.
    expect(buildJourneyStops({ days, assignments })[0].label).toBe('Paris')
  })

  // Built from a real 53-day Europe itinerary, which is where the labelling
  // first went wrong: every stop came out named for its region or its country
  // ("France" for Paris, "Auvergne-Rhône-Alpes" for Lyon) because the synthetic
  // fixtures above all used the long Nominatim form and real pins do not.
  it('names a city-marker stop after the city, not its region', () => {
    const { days, assignments } = trip([
      { dayNumber: 1, date: '2027-06-24', specs: [at(LYON, 'Lyon, Auvergne-Rhône-Alpes, France', 'Lyon')] },
      { dayNumber: 2, date: '2027-07-07', specs: [at([45.068, 7.682], 'Turin, Piedmont, Italy', 'Turin')] },
    ])
    expect(buildJourneyStops({ days, assignments }).map(s => s.label)).toEqual(['Lyon', 'Turin'])
  })

  it('names a busy city stay after the city every street in it shares', () => {
    const { days, assignments } = trip([
      { dayNumber: 1, date: '2027-06-18', specs: [
        at(PARIS, 'Paris, Ile-de-France, France', 'Paris'),
        at([48.858, 2.295], '5 Avenue Anatole France, 75007 Paris, France', 'Eiffel Tower'),
        at([48.860, 2.294], 'Port de la Bourdonnais, 75007 Paris, France', 'Bateaux Parisiens'),
      ] },
      { dayNumber: 2, date: '2027-06-19', specs: [
        at([48.861, 2.338], 'Rue Saint-Honoré, 75001 Paris, France', 'Louvre Museum'),
      ] },
      // The day out to Versailles is inside the radius, so it joins Paris and
      // must not rename it.
      { dayNumber: 3, date: '2027-06-22', specs: [
        at([48.804, 2.120], "Place d'Armes, 78000 Versailles, France", 'Palace of Versailles'),
      ] },
      { dayNumber: 4, date: '2027-06-24', specs: [at(LYON, 'Lyon, Auvergne-Rhône-Alpes, France', 'Lyon')] },
    ])
    const result = buildJourneyStops({ days, assignments })
    expect(result.map(s => s.label)).toEqual(['Paris', 'Lyon'])
    expect(result[0].dayIds).toHaveLength(3)
  })

  it('falls back to the stop nearest the centre when no address says anything', () => {
    const { days, assignments } = trip([
      { dayNumber: 1, date: '2026-04-12', specs: [at(PARIS, undefined, 'Notre-Dame')] },
      { dayNumber: 2, date: '2026-04-13', specs: [at(LYON, undefined, 'Fourvière')] },
    ])
    expect(buildJourneyStops({ days, assignments }).map(s => s.label)).toEqual(['Notre-Dame', 'Fourvière'])
  })

  it('numbers the days of a trip that carries no dates', () => {
    const { days, assignments } = trip([
      { dayNumber: 1, date: null, specs: [at(PARIS, 'Paris, Ile-de-France, France')] },
      { dayNumber: 2, date: null, specs: [at(PARIS, 'Paris, Ile-de-France, France')] },
      { dayNumber: 3, date: null, specs: [at(LYON, 'Lyon, Auvergne-Rhône-Alpes, France')] },
    ])
    const result = buildJourneyStops({ days, assignments })
    expect(result.map(s => [s.startDate, s.startDayNumber, s.endDayNumber]))
      .toEqual([[null, 1, 2], [null, 3, 3]])
  })

  it('reads the itinerary in day order, not in whatever order the array arrived', () => {
    const { days, assignments } = trip([
      { dayNumber: 1, date: '2026-04-12', specs: [at(PARIS, 'Paris, Ile-de-France, France')] },
      { dayNumber: 2, date: '2026-04-13', specs: [at(LYON, 'Lyon, Auvergne-Rhône-Alpes, France')] },
    ])
    const shuffled = [days[1], days[0]]
    expect(buildJourneyStops({ days: shuffled, assignments }).map(s => s.label)).toEqual(['Paris', 'Lyon'])
  })
})

describe('buildJourneyLegs', () => {
  const threeCities = () => trip([
    { dayNumber: 1, date: '2026-04-12', specs: [at(PARIS, 'Paris, Ile-de-France, France')] },
    { dayNumber: 2, date: '2026-04-13', specs: [at(LYON, 'Lyon, Auvergne-Rhône-Alpes, France')] },
    { dayNumber: 3, date: '2026-04-14', specs: [at(MARSEILLE, 'Marseille, Provence, France')] },
  ])

  it('draws no arrow for a trip that never leaves one city', () => {
    const { days, assignments } = trip([
      { dayNumber: 1, date: '2026-04-12', specs: [at(PARIS, 'Paris, Ile-de-France, France')] },
    ])
    expect(buildJourneyLegs({ days, assignments })).toEqual([])
  })

  it('joins consecutive stops, in order', () => {
    const legs = buildJourneyLegs(threeCities())
    expect(legs.map(l => [l.from.label, l.to.label])).toEqual([['Paris', 'Lyon'], ['Lyon', 'Marseille']])
  })

  it('dates each move by the first day at its destination', () => {
    const legs = buildJourneyLegs(threeCities())
    expect(legs.map(l => l.departDate)).toEqual(['2026-04-13', '2026-04-14'])
    expect(legs.map(l => l.departDayNumber)).toEqual([2, 3])
  })

  it('measures the move, and never draws one shorter than a city', () => {
    const legs = buildJourneyLegs(threeCities())
    expect(legs[0].distanceKm).toBeGreaterThan(CITY_RADIUS_KM)
    expect(legs[0].distanceKm).toBeCloseTo(392, -1)
  })

  it('keys each leg by the stops it joins, so a redraw reuses the same marker', () => {
    const input = threeCities()
    expect(buildJourneyLegs(input).map(l => l.key)).toEqual(buildJourneyLegs(input).map(l => l.key))
    expect(new Set(buildJourneyLegs(input).map(l => l.key)).size).toBe(2)
  })
})
