import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '../../../tests/helpers/render'
import { fireEvent } from '@testing-library/react'
import { resetAllStores, seedStore } from '../../../tests/helpers/store'
import { useSettingsStore } from '../../store/settingsStore'
import { JourneyArrowsToggle } from './JourneyArrowsToggle'

const seed = (on: boolean, updateSetting = vi.fn().mockResolvedValue(undefined)) => {
  seedStore(useSettingsStore, {
    settings: { ...useSettingsStore.getState().settings, map_journey_arrows: on },
    updateSetting,
  })
  return updateSetting
}

afterEach(() => resetAllStores())

describe('JourneyArrowsToggle', () => {
  it('offers to show the overview while it is off', () => {
    seed(false)
    render(<JourneyArrowsToggle />)
    const button = screen.getByRole('button', { name: 'Show journey overview' })
    expect(button.getAttribute('aria-pressed')).toBe('false')
  })

  it('offers to hide it once it is on, and says so to a screen reader', () => {
    seed(true)
    render(<JourneyArrowsToggle />)
    const button = screen.getByRole('button', { name: 'Hide journey overview' })
    expect(button.getAttribute('aria-pressed')).toBe('true')
  })

  it('writes the flipped value to the one setting both renderers read', () => {
    const updateSetting = seed(false)
    render(<JourneyArrowsToggle />)
    fireEvent.click(screen.getByRole('button'))
    expect(updateSetting).toHaveBeenCalledWith('map_journey_arrows', true)
  })

  it('turns the layer off again from the on state', () => {
    const updateSetting = seed(true)
    render(<JourneyArrowsToggle />)
    fireEvent.click(screen.getByRole('button'))
    expect(updateSetting).toHaveBeenCalledWith('map_journey_arrows', false)
  })

  it('survives a save that fails — the store has already flipped locally', () => {
    const updateSetting = seed(false, vi.fn().mockRejectedValue(new Error('offline')))
    render(<JourneyArrowsToggle />)
    expect(() => fireEvent.click(screen.getByRole('button'))).not.toThrow()
    expect(updateSetting).toHaveBeenCalled()
  })
})
