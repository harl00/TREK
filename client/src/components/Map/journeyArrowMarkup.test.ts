import { describe, it, expect } from 'vitest'
import {
  bearingDeg,
  legPillHtml,
  pointAlongArc,
  stopPillHtml,
  JOURNEY_ARROW_COLOR,
} from './journeyArrowMarkup'

describe('bearingDeg', () => {
  it('reads the four cardinal directions', () => {
    expect(bearingDeg([0, 0], [1, 0])).toBeCloseTo(0, 6)
    expect(bearingDeg([0, 0], [0, 1])).toBeCloseTo(90, 6)
    expect(bearingDeg([1, 0], [0, 0])).toBeCloseTo(180, 6)
    expect(bearingDeg([0, 1], [0, 0])).toBeCloseTo(270, 6)
  })

  it('never answers a negative angle — CSS rotate() gets the compass value', () => {
    expect(bearingDeg([10, 10], [9, 9])).toBeGreaterThan(180)
    expect(bearingDeg([10, 10], [9, 9])).toBeLessThan(270)
  })
})

describe('pointAlongArc', () => {
  const straight: [number, number][] = [[0, 0], [0, 10]]

  it('walks a straight arc by fraction', () => {
    expect(pointAlongArc(straight, 0.5)?.point).toEqual([0, 5])
    expect(pointAlongArc(straight, 0)?.point).toEqual([0, 0])
    expect(pointAlongArc(straight, 1)?.point).toEqual([0, 10])
  })

  it('carries the local heading, so a curved leg points along itself', () => {
    // A right-angle bend: before the corner the arc runs east along the equator,
    // after it due north. Both legs are chosen so the great-circle heading is
    // exact — away from the equator an eastward leg starts at slightly under 90°,
    // which is the geometry being right rather than the helper being wrong.
    const bent: [number, number][] = [[0, 0], [0, 10], [10, 10]]
    expect(pointAlongArc(bent, 0.25)?.bearing).toBeCloseTo(90, 6)
    expect(pointAlongArc(bent, 0.75)?.bearing).toBeCloseTo(0, 6)
  })

  it('measures by arc length, not by sample index', () => {
    // Three samples, unevenly spaced: halfway along is 5° in, which is the
    // middle of the FIRST segment, not the middle sample.
    const uneven: [number, number][] = [[0, 0], [0, 9], [0, 10]]
    expect(pointAlongArc(uneven, 0.5)?.point).toEqual([0, 5])
  })

  it('clamps a fraction outside 0..1 rather than running off the end', () => {
    expect(pointAlongArc(straight, -3)?.point).toEqual([0, 0])
    expect(pointAlongArc(straight, 9)?.point).toEqual([0, 10])
  })

  it('has no answer for an empty arc', () => {
    expect(pointAlongArc([], 0.5)).toBeNull()
  })

  it('answers a one-sample arc with that sample', () => {
    expect(pointAlongArc([[4, 2]], 0.5)).toEqual({ point: [4, 2], bearing: 0 })
  })

  it('survives an arc whose samples are all the same point', () => {
    expect(pointAlongArc([[4, 2], [4, 2]], 0.5)?.point).toEqual([4, 2])
  })
})

describe('legPillHtml', () => {
  it('rotates only the arrowhead, so the date stays the right way up', () => {
    const html = legPillHtml('14 Apr', 217.5)
    expect(html).toContain('rotate(217.5deg)')
    expect(html.match(/rotate\(/g)).toHaveLength(1)
    expect(html).toContain('14 Apr')
  })

  it('hangs the pill off a zero-sized anchor so hovering cannot move it', () => {
    // The dot/arrowhead is welded to its coordinate; only the body grows.
    expect(legPillHtml('14 Apr', 0)).toContain('trek-journey-anchor')
    expect(stopPillHtml('Lyon', '')).toContain('trek-journey-anchor')
  })

  it('puts the date and the mode in the body, which is collapsed by default', () => {
    const html = legPillHtml('14 Apr', 0, 'Flight', '<svg></svg>')
    expect(html).toContain('trek-journey-body')
    expect(html).toContain('Flight')
    expect(html).toContain('<svg></svg>')
  })

  it('draws a bare arrowhead when there is nothing to reveal', () => {
    const html = legPillHtml('', 90)
    expect(html).toContain('trek-journey-head')
    expect(html).not.toContain('trek-journey-body')
  })

  it('leaves out the mode row when no booking records one', () => {
    expect(legPillHtml('14 Apr', 0)).not.toContain('trek-journey-mode')
  })

  it('escapes the date rather than letting it reach the DOM as markup', () => {
    const html = legPillHtml('<img src=x onerror=alert(1)>', 0)
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  it('escapes the mode label too', () => {
    const html = legPillHtml('14 Apr', 0, '<img src=x>', '')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })
})

describe('stopPillHtml', () => {
  it('shows the city over its dates', () => {
    const html = stopPillHtml('Lyon', '14-16 Apr')
    expect(html).toContain('Lyon')
    expect(html).toContain('14-16 Apr')
  })

  it('always draws the dot, which is all there is until the pointer arrives', () => {
    expect(stopPillHtml('Lyon', '14 Apr')).toContain('trek-journey-dot')
    expect(stopPillHtml('Lyon', '14 Apr')).toContain(JOURNEY_ARROW_COLOR)
  })

  it('escapes a place name that came from an import', () => {
    const html = stopPillHtml('<script>alert(1)</script>', '')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('leaves out the date line when the trip has no dates for it', () => {
    expect(stopPillHtml('Lyon', '')).not.toContain('trek-journey-dates')
  })
})
