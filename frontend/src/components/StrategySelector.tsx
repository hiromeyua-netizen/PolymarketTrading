import './StrategySelector.css'

interface StrategySelectorProps {
  selectedStrategy: 'strategy1' | 'strategy2' | 'strategy3'
  onStrategyChange: (strategy: 'strategy1' | 'strategy2' | 'strategy3') => void
}

export default function StrategySelector({
  selectedStrategy,
  onStrategyChange
}: StrategySelectorProps) {
  return (
    <div className="strategy-selector">
      <label>
        <strong>Select Strategy:</strong>
        <select
          value={selectedStrategy}
          onChange={(e) => onStrategyChange(e.target.value as 'strategy1' | 'strategy2' | 'strategy3')}
          className="strategy-select"
        >
          <option value="strategy1">Strategy 1: Grid Hedge Strategy</option>
          <option value="strategy2">Strategy 2: Pre-Purchased Sell Strategy</option>
          <option value="strategy3">Strategy 3: New Hedge Strategy</option>
        </select>
      </label>
    </div>
  )
}

