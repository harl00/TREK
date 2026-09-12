import { Waypoints } from 'lucide-react'
import { useSettingsStore } from '../../store/settingsStore'
import { useTranslation } from '../../i18n'

/**
 * Turns the journey overview on and off, in the same frosted round shell as
 * MapLayerSwitcher so it lines up with the other map controls.
 *
 * Self-contained rather than prop-driven: it is mounted by all three renderers,
 * and a component that reads and writes the one setting itself is the version of
 * that which cannot drift between the desktop and phone shells.
 */
export function JourneyArrowsToggle() {
  const { t } = useTranslation()
  const active = useSettingsStore(s => s.settings.map_journey_arrows) === true
  const updateSetting = useSettingsStore(s => s.updateSetting)
  const label = t(active ? 'map.journey.hide' : 'map.journey.show')

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', padding: 4, borderRadius: 999, pointerEvents: 'auto',
      background: 'var(--sidebar-bg)',
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      boxShadow: 'var(--sidebar-shadow, 0 4px 16px rgba(0,0,0,0.14))',
    }}>
      <button
        type="button"
        // The store flips synchronously, so the layer appears offline too; a
        // failed save is logged there, exactly as the base-layer switch does.
        onClick={() => { updateSetting('map_journey_arrows', !active).catch(() => {}) }}
        aria-label={label}
        title={label}
        aria-pressed={active}
        className={active ? 'text-accent' : 'text-content-muted'}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 34, height: 34, borderRadius: 999, border: 'none', cursor: 'pointer',
          background: 'transparent', padding: 0,
          transition: 'background 0.14s, color 0.14s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      >
        <Waypoints size={17} strokeWidth={2} />
      </button>
    </div>
  )
}
