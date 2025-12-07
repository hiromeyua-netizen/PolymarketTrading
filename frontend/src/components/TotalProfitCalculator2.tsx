import { useState } from 'react'
import { TotalProfit2Response, fetchTotalProfit2 } from '../services/api'

interface TotalProfitCalculator2Props {
  targetTotal: number
  sellThreshold: number
  orderSize: number
  count: number | undefined
  onTargetTotalChange: (value: number) => void
  onSellThresholdChange: (value: number) => void
  onOrderSizeChange: (value: number) => void
  onCountChange: (value: number | undefined) => void
}

export default function TotalProfitCalculator2({
  targetTotal,
  sellThreshold,
  orderSize,
  count,
  onTargetTotalChange,
  onSellThresholdChange,
  onOrderSizeChange,
  onCountChange
}: TotalProfitCalculator2Props) {
  const [totalProfitData, setTotalProfitData] = useState<TotalProfit2Response | null>(null)
  const [loadingTotalProfit, setLoadingTotalProfit] = useState<boolean>(false)
  const [totalProfitError, setTotalProfitError] = useState<string | null>(null)

  const handleCalculateTotalProfit = async () => {
    setLoadingTotalProfit(true)
    setTotalProfitError(null)
    try {
      const response = await fetchTotalProfit2(targetTotal, sellThreshold, orderSize, count)
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
      <h3>Total Profit Calculator (All Slugs) - Strategy 2</h3>
      <div className="strategy-params">
        <label>
          Target Total (cents):
          <input
            type="number"
            step="1"
            min="100"
            max="200"
            value={targetTotal}
            onChange={(e) => onTargetTotalChange(parseInt(e.target.value) || 105)}
          />
        </label>
        <label>
          Sell Threshold (cents):
          <input
            type="number"
            step="1"
            min="50"
            max="100"
            value={sellThreshold}
            onChange={(e) => onSellThresholdChange(parseInt(e.target.value) || 65)}
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
        <button 
          className="calculate-total-profit-btn"
          onClick={handleCalculateTotalProfit}
          disabled={loadingTotalProfit}
        >
          {loadingTotalProfit ? 'Calculating...' : 'Calculate Total Profit'}
        </button>
      </div>

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
              <span className="stat-label">Total Received:</span>
              <span className="stat-value">{totalProfitData.totalReceived.toFixed(2)}</span>
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

