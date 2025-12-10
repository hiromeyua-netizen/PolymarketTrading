import './SlugSelector.css'
import { SlugWithOutcome } from '../services/api'

interface SlugSelectorProps {
  slugs: string[]
  slugsWithOutcome: SlugWithOutcome[]
  selectedSlug: string
  onSlugChange: (slug: string) => void
  loading: boolean
}

const SlugSelector = ({ slugs, slugsWithOutcome, selectedSlug, onSlugChange, loading }: SlugSelectorProps) => {
  // Create a map for quick lookup of outcome by slug
  const outcomeMap = new Map<string, 'UP' | 'DOWN' | null>()
  slugsWithOutcome.forEach(item => {
    outcomeMap.set(item.slug, item.outcome)
  })

  const getOutcomeDisplay = (slug: string): string => {
    const outcome = outcomeMap.get(slug)
    if (outcome === 'UP') return '🟢 UP'
    if (outcome === 'DOWN') return '🔴 DOWN'
    return ''
  }

  const selectedOutcome = selectedSlug ? outcomeMap.get(selectedSlug) : null

  return (
    <div className="slug-selector">
      <label htmlFor="slug-select" className="slug-label">
        Select Market Slug:
      </label>
      <select
        id="slug-select"
        value={selectedSlug}
        onChange={(e) => onSlugChange(e.target.value)}
        disabled={loading || slugs.length === 0}
        className="slug-select"
      >
        <option value="">-- Select a slug --</option>
        {slugs.map((slug) => {
          const outcomeDisplay = getOutcomeDisplay(slug)
          return (
            <option key={slug} value={slug}>
              {slug} {outcomeDisplay && `(${outcomeDisplay})`}
            </option>
          )
        })}
      </select>
      <div className="slug-info">
        {slugs.length > 0 && (
          <span className="slug-count">{slugs.length} slug(s) available</span>
        )}
        {selectedSlug && selectedOutcome && (
          <span className={`outcome-badge outcome-${selectedOutcome.toLowerCase()}`}>
            Outcome: {selectedOutcome}
          </span>
        )}
      </div>
    </div>
  )
}

export default SlugSelector

