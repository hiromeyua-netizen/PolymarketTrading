import { useState } from 'react'
import { StrategyResult } from '../utils/strategyCalculator1'

interface Strategy1ResultsProps {
  strategyResult: StrategyResult
  maxTotalCost: number
  gridGap: number
  orderSize: number
  enableRebuy: boolean
  onMaxTotalCostChange: (value: number) => void
  onGridGapChange: (value: number) => void
  onOrderSizeChange: (value: number) => void
  onEnableRebuyChange: (value: boolean) => void
}

export default function Strategy1Results({
  strategyResult,
  maxTotalCost,
  gridGap,
  orderSize,
  enableRebuy,
  onMaxTotalCostChange,
  onGridGapChange,
  onOrderSizeChange,
  onEnableRebuyChange
}: Strategy1ResultsProps) {
  const [expandedLevels, setExpandedLevels] = useState<Set<number>>(new Set())

  const toggleExpand = (level: number) => {
    setExpandedLevels(prev => {
      const newSet = new Set(prev)
      if (newSet.has(level)) {
        newSet.delete(level)
      } else {
        newSet.add(level)
      }
      return newSet
    })
  }

  return (
    <div className="strategy-results">
      <h3>Strategy 1 Results (Grid Hedge Strategy)</h3>
      <div className="strategy-params">
        <label>
          Max Total Cost (cents):
          <input
            type="number"
            step="1"
            min="50"
            max="100"
            value={maxTotalCost}
            onChange={(e) => onMaxTotalCostChange(parseInt(e.target.value) || 97)}
          />
        </label>
        <label>
          Grid Gap:
          <input
            type="number"
            step="1"
            min="1"
            max="10"
            value={gridGap}
            onChange={(e) => onGridGapChange(parseInt(e.target.value) || 5)}
          />
        </label>
        <label>
          Order Size:
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={orderSize}
            onChange={(e) => onOrderSizeChange(parseFloat(e.target.value) || 1)}
          />
        </label>
      </div>
      <div className="toggle-container">
        <label className="toggle-label" htmlFor="enable-rebuy-toggle">
          <div className="toggle-label-content">
            <div className="toggle-title">Enable Rebuy</div>
            <div className="toggle-description">Allow re-entry at grid levels after hedge is filled</div>
          </div>
          <div className="toggle-switch">
            <input
              type="checkbox"
              id="enable-rebuy-toggle"
              checked={enableRebuy}
              onChange={(e) => onEnableRebuyChange(e.target.checked)}
              className="toggle-input"
            />
            <span className="toggle-slider"></span>
          </div>
        </label>
      </div>
      <div className="strategy-stats">
        <div className="stat">
          <span className="stat-label">Total Profit:</span>
          <span className={`stat-value ${strategyResult.totalProfit >= 0 ? 'positive' : 'negative'}`}>
            {strategyResult.totalProfit.toFixed(2)}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Total Cost:</span>
          <span className="stat-value">{strategyResult.totalCost.toFixed(2)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Final Value:</span>
          <span className="stat-value">{strategyResult.finalValue.toFixed(2)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Total Entries:</span>
          <span className="stat-value">{strategyResult.totalEntries}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Hedges Filled:</span>
          <span className="stat-value">{strategyResult.totalHedgesFilled}</span>
        </div>
      </div>
      
      {Object.keys(strategyResult.orderPoints).length > 0 && (
        <div className="order-points-section">
          <h4>Order Points</h4>
          <div className="order-points-container">
            {strategyResult.gridLevelsUsed.map((level) => {
              const levelKey = level.toString()
              const orderPairs = strategyResult.orderPoints[levelKey] || []
              if (orderPairs.length === 0) return null
              
              const isExpanded = expandedLevels.has(level)
              
              return (
                <div key={level} className="grid-level-group">
                  <div 
                    className="grid-level-header"
                    onClick={() => toggleExpand(level)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggleExpand(level)
                      }
                    }}
                  >
                    <div className="grid-level-header-left">
                      <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>
                        ▼
                      </span>
                      <span className="grid-level-label">Grid Level: {level}c</span>
                    </div>
                    <span className="grid-level-count">{orderPairs.length} order pair(s)</span>
                  </div>
                  {isExpanded && (
                    <div className="order-pairs-list">
                      {orderPairs.map((pair, index) => (
                        <div key={index} className="order-pair">
                          <div className="order-pair-header">
                            <span className="pair-index">Pair #{index + 1}</span>
                            {pair.entryOrder.isReEntry && (
                              <span className="re-entry-badge">Re-entry</span>
                            )}
                          </div>
                          <div className="order-details">
                            <div className="order-entry">
                              <div className="order-type">Entry Order</div>
                              <div className="order-info">
                                <span><strong>Token:</strong> {pair.entryOrder.tokenType.toUpperCase()}</span>
                                <span><strong>Price:</strong> {(pair.entryOrder.price * 100).toFixed(0)}c</span>
                                <span><strong>Size:</strong> {pair.entryOrder.size}</span>
                                <span><strong>Time:</strong> {new Date(pair.entryOrder.timestamp).toLocaleString()}</span>
                              </div>
                            </div>
                            <div className="order-hedge">
                              <div className="order-type">Hedge Order</div>
                              <div className="order-info">
                                <span><strong>Token:</strong> {pair.hedgeOrder.tokenType.toUpperCase()}</span>
                                <span><strong>Price:</strong> {(pair.hedgeOrder.price * 100).toFixed(0)}c</span>
                                <span><strong>Size:</strong> {pair.hedgeOrder.size}</span>
                                <span className={pair.hedgeOrder.isFilled ? 'filled' : 'pending'}>
                                  <strong>Status:</strong> {pair.hedgeOrder.isFilled ? 'Filled' : 'Pending'}
                                </span>
                                {pair.hedgeOrder.timestamp && (
                                  <span><strong>Filled Time:</strong> {new Date(pair.hedgeOrder.timestamp).toLocaleString()}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

