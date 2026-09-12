import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * The journey overview's collapse-on-hover behaviour lives entirely in CSS, so
 * that all three renderers get it from one place. jsdom applies no stylesheet to
 * a divIcon's innerHTML, which means no component test can see any of this —
 * these read the real file instead, the same way mapPopupCss.test.ts does.
 */
describe('journey overview css', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
  const block = (selector: string): string => {
    const at = css.indexOf(`${selector} {`)
    expect(at, `${selector} missing from index.css`).toBeGreaterThan(-1)
    return css.slice(at, css.indexOf('}', at) + 1)
  }

  it('FE-COMP-JOURNEYCSS-001: the anchor is zero-sized, so hovering cannot move the dot', () => {
    // Both renderers centre a marker on its coordinate. Centring a pill that
    // changes width on hover would slide the dot out from under the pointer.
    const anchor = block('.trek-journey-anchor')
    expect(anchor).toMatch(/width:\s*0/)
    expect(anchor).toMatch(/height:\s*0/)
  })

  it('FE-COMP-JOURNEYCSS-002: the body is hidden until the pill is hovered', () => {
    expect(block('.trek-journey-pill .trek-journey-body')).toMatch(/display:\s*none/)
    expect(css).toMatch(/\.trek-journey-pill:hover\s+\.trek-journey-body\s*\{\s*display:\s*flex/)
  })

  it('FE-COMP-JOURNEYCSS-003: a collapsed pill is only its dot — no card behind it', () => {
    const pill = block('.trek-journey-pill')
    expect(pill).toMatch(/background:\s*transparent/)
    expect(pill).toMatch(/box-shadow:\s*none/)
    // …and the card arrives with the pointer.
    expect(block('.trek-journey-pill:hover')).toMatch(/background:\s*var\(--bg-card\)/)
  })

  it('FE-COMP-JOURNEYCSS-004: the pill catches its own pointer events', () => {
    // The Leaflet pane and the GL marker wrapper are passive so the map stays
    // draggable; without this opt-in nothing would ever hover.
    expect(block('.trek-journey-pill')).toMatch(/pointer-events:\s*auto/)
  })

  it('FE-COMP-JOURNEYCSS-005: an opened pill rises above its neighbours', () => {
    // At fifteen stops the dots are frequently a few pixels apart, and an
    // expanded pill covered by the next dot along is the bug this replaces.
    expect(block('.trek-journey-pill:hover')).toMatch(/z-index:\s*\d+/)
  })

  it('FE-COMP-JOURNEYCSS-007: the tooltip and popup panes outrank the flattened rest', () => {
    // `.leaflet-pane { z-index: 0 !important }` flattens every pane, so order
    // falls back to DOM order — and a pane created on demand is appended last.
    // That put the journey layer over the very tooltip describing it. These two
    // exemptions are what keep hover chrome on top of any such pane.
    expect(css).toMatch(/\.leaflet-pane\.leaflet-tooltip-pane\s*\{[^}]*z-index:\s*650\s*!important/)
    expect(css).toMatch(/\.leaflet-pane\.leaflet-popup-pane\s*\{[^}]*z-index:\s*700\s*!important/)
  })

  it('FE-COMP-JOURNEYCSS-006: the mode glyph inherits the text colour', () => {
    // The icons are serialized with color="currentColor", so the rule only has
    // to size them; a hard-coded fill here would break one of the two themes.
    const svg = block('.trek-journey-mode svg')
    expect(svg).toMatch(/width:\s*11px/)
    expect(svg).not.toMatch(/color:|fill:/)
  })
})
