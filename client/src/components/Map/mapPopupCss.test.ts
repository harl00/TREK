import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

// The GL map's hover card is styled from index.css while its geometry comes
// from the vendor stylesheet, so the two only agree by convention. These read
// the real files rather than a rendered component: jsdom applies no vendor CSS,
// which is exactly the interaction that can break here.
describe('GL hover popup css', () => {
  // Vitest runs with the client package as its root, so cwd is stable here.
  const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
  const block = (selector: string): string => {
    const at = css.indexOf(selector)
    expect(at, `${selector} missing from index.css`).toBeGreaterThan(-1)
    return css.slice(at, css.indexOf('}', at) + 1)
  }

  it('FE-COMP-MAPPOPUPCSS-001: the tail is off, not merely painted white', () => {
    // Colouring it left a visible notch under the card in every theme.
    expect(block('.trek-map-popup .maplibregl-popup-tip')).toMatch(/display:\s*none/)
  })

  it('FE-COMP-MAPPOPUPCSS-002: the corner radius outweighs the vendor anchor rules', () => {
    // maplibre-gl.css squares one corner per anchor so the tail meets the card
    // flush. With the tail gone that is just a squared corner, and the vendor
    // rule carries the same specificity as a plain `.trek-map-popup .content`
    // — whichever sheet loads last would win. The `[class]` guard settles it.
    const radius = block('.trek-map-popup[class] .maplibregl-popup-content')
    expect(radius).toMatch(/border-radius:\s*10px/)
  })

  it('FE-COMP-MAPPOPUPCSS-003: leaflet click popups keep their tail', () => {
    // Those are anchored, dismissable popups where the tail earns its place —
    // the fix above is scoped to the GL hover card on purpose.
    expect(block('.leaflet-popup-tip')).not.toMatch(/display:\s*none/)
  })

  it('FE-COMP-MAPPOPUPCSS-004: tooltip and popup panes outrank the flattened rest', () => {
    // `.leaflet-pane { z-index: 0 !important }` keeps the map inside its own
    // stacking context, but it also defeats the z-index every pane sets for
    // itself — so ordering falls back to DOM order, and a pane created on
    // demand (the journey overview, the booking endpoints) is appended after
    // the built-in ones. That put those layers over the very tooltip describing
    // them. Restoring Leaflet's own two values fixes it for any such pane, and
    // cannot let either escape the map: both stay inside .leaflet-container.
    expect(block('.leaflet-pane.leaflet-tooltip-pane')).toMatch(/z-index:\s*650\s*!important/)
    expect(block('.leaflet-pane.leaflet-popup-pane')).toMatch(/z-index:\s*700\s*!important/)
  })
})
