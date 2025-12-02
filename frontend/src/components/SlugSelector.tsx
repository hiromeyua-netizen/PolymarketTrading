import './SlugSelector.css'

interface SlugSelectorProps {
  slugs: string[]
  selectedSlug: string
  onSlugChange: (slug: string) => void
  loading: boolean
}

const SlugSelector = ({ slugs, selectedSlug, onSlugChange, loading }: SlugSelectorProps) => {
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
        {slugs.map((slug) => (
          <option key={slug} value={slug}>
            {slug}
          </option>
        ))}
      </select>
      {slugs.length > 0 && (
        <span className="slug-count">{slugs.length} slug(s) available</span>
      )}
    </div>
  )
}

export default SlugSelector

