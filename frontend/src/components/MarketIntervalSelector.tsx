import './MarketIntervalSelector.css'

export type MarketInterval = 'hourly' | '15min'

interface MarketIntervalSelectorProps {
  selectedInterval: MarketInterval
  onIntervalChange: (interval: MarketInterval) => void
}

export default function MarketIntervalSelector({
  selectedInterval,
  onIntervalChange
}: MarketIntervalSelectorProps) {
  const intervals: { value: MarketInterval; label: string }[] = [
    { value: 'hourly', label: 'Hourly' },
    { value: '15min', label: '15 Minutes' }
  ]

  return (
    <div className="market-interval-selector">
      <label htmlFor="market-interval-select">
        <span className="selector-label">Market Interval:</span>
        <select
          id="market-interval-select"
          value={selectedInterval}
          onChange={(e) => onIntervalChange(e.target.value as MarketInterval)}
          className="interval-select"
        >
          {intervals.map((interval) => (
            <option key={interval.value} value={interval.value}>
              {interval.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

