import { useState } from 'react'
import { TotalProfitResponse, fetchTotalProfit } from '../services/api'

interface TotalProfitCalculatorProps {
  maxTotalCost: number
  gridGap: number
  orderSize: number
  count: number | undefined
  enableRebuy: boolean
  onMaxTotalCostChange: (value: number) => void
  onGridGapChange: (value: number) => void
  onOrderSizeChange: (value: number) => void
  onCountChange: (value: number | undefined) => void
  onEnableRebuyChange: (value: boolean) => void
}

export default function TotalProfitCalculator({
  maxTotalCost,
  gridGap,
  orderSize,
  count,
  enableRebuy,
  onMaxTotalCostChange,
  onGridGapChange,
  onOrderSizeChange,
  onCountChange,
  onEnableRebuyChange
}: TotalProfitCalculatorProps) {
  const [totalProfitData, setTotalProfitData] = useState<TotalProfitResponse | null>(null)
  const [loadingTotalProfit, setLoadingTotalProfit] = useState<boolean>(false)
  const [totalProfitError, setTotalProfitError] = useState<string | null>(null)

  const handleCalculateTotalProfit = async () => {
    setLoadingTotalProfit(true)
    setTotalProfitError(null)
    try {
      const response = await fetchTotalProfit(maxTotalCost, gridGap, orderSize, count, enableRebuy)
      setTotalProfitData(response)
    } catch (err) {
      setTotalProfitError('Failed to calculate total profit')
      console.error('Error calculating total profit:', err)
    } finally {
      setLoadingTotalProfit(false)
    }
  }

  return (
    <div className="total-profit-section">
      <h3>Total Profit Calculator (All Slugs)</h3>
      <div className="strategy-params">
        <label>
          Max Total Cost:
          <input
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={maxTotalCost}
            onChange={(e) => onMaxTotalCostChange(parseFloat(e.target.value) || 0.97)}
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
        <label>
          Count (optional):
          <input
            type="number"
            step="1"
            min="1"
            placeholder="All slugs"
            value={count || ''}
            onChange={(e) => onCountChange(e.target.value ? parseInt(e.target.value) || undefined : undefined)}
          />
        </label>
      </div>
      <div className="toggle-container">
        <label className="toggle-label" htmlFor="enable-rebuy-toggle-total">
          <div className="toggle-label-content">
            <div className="toggle-title">Enable Rebuy</div>
            <div className="toggle-description">Allow re-entry at grid levels after hedge is filled</div>
          </div>
          <div className="toggle-switch">
            <input
              type="checkbox"
              id="enable-rebuy-toggle-total"
              checked={enableRebuy}
              onChange={(e) => onEnableRebuyChange(e.target.checked)}
              className="toggle-input"
            />
            <span className="toggle-slider"></span>
          </div>
        </label>
      </div>
      <button 
        className="calculate-total-profit-btn"
        onClick={handleCalculateTotalProfit}
        disabled={loadingTotalProfit}
        style={{ marginTop: '15px' }}
      >
        {loadingTotalProfit ? 'Calculating...' : 'Calculate Total Profit'}
      </button>

      {totalProfitError && (
        <div className="error-message">
          {totalProfitError}
        </div>
      )}

      {totalProfitData && (
        <div className="total-profit-results">
          <h4>Results</h4>
          <div className="strategy-stats">
            <div className="stat">
              <span className="stat-label">Total Profit:</span>
              <span className={`stat-value ${totalProfitData.totalProfit >= 0 ? 'positive' : 'negative'}`}>
                {totalProfitData.totalProfit.toFixed(2)}
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Total Cost:</span>
              <span className="stat-value">{totalProfitData.totalCost.toFixed(2)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Total Final Value:</span>
              <span className="stat-value">{totalProfitData.totalFinalValue.toFixed(2)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Total Entries:</span>
              <span className="stat-value">{totalProfitData.totalEntries}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Total Hedges Filled:</span>
              <span className="stat-value">{totalProfitData.totalHedgesFilled}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Total Slugs:</span>
              <span className="stat-value">{totalProfitData.totalSlugCount}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Processed Slugs:</span>
              <span className="stat-value">{totalProfitData.processedSlugCount}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Successfully Processed:</span>
              <span className="stat-value">{totalProfitData.actualProcessedCount}</span>
            </div>
          </div>
          {totalProfitData.parameters.count && (
            <div className="info-note">
              Calculated for last {totalProfitData.parameters.count} slug(s)
            </div>
          )}
        </div>
      )}
    </div>
  )
}

