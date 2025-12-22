import { useState } from 'react'
import { TotalProfit3Response, fetchTotalProfit3 } from '../services/api'
import { CoinSymbol } from './CoinSymbolSelector'
import { MarketInterval } from './MarketIntervalSelector'

interface TotalProfitCalculator3Props {
  priceDiff: number
  timeTillEnd: number
  targetPrice: number
  maxTotalCent: number
  orderSize: number
  count: number | undefined
  selectedCoin: CoinSymbol
  selectedInterval: MarketInterval
  onPriceDiffChange: (value: number) => void
  onTimeTillEndChange: (value: number) => void
  onTargetPriceChange: (value: number) => void
  onMaxTotalCentChange: (value: number) => void
  onOrderSizeChange: (value: number) => void
  onCountChange: (value: number | undefined) => void
}

export default function TotalProfitCalculator3({
  priceDiff,
  timeTillEnd,
  targetPrice,
  maxTotalCent,
  orderSize,
  count,
  selectedCoin,
  selectedInterval,
  onPriceDiffChange,
  onTimeTillEndChange,
  onTargetPriceChange,
  onMaxTotalCentChange,
  onOrderSizeChange,
  onCountChange
}: TotalProfitCalculator3Props) {
  const [totalProfitData, setTotalProfitData] = useState<TotalProfit3Response | null>(null)
  const [loadingTotalProfit, setLoadingTotalProfit] = useState<boolean>(false)
  const [totalProfitError, setTotalProfitError] = useState<string | null>(null)

  const handleCalculateTotalProfit = async () => {
    setLoadingTotalProfit(true)
    setTotalProfitError(null)
    try {
      const response = await fetchTotalProfit3(
        priceDiff,
        timeTillEnd,
        targetPrice,
        maxTotalCent,
        orderSize,
        count,
        selectedCoin,
        selectedInterval
      )
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
      <h3>Total Profit Calculator (All Slugs) - Strategy 3</h3>
      <div className="strategy-params">
        <label>
          Price Diff (dollars):
          <input
            type="number"
            step="1"
            min="1"
            max="1000"
            value={priceDiff}
            onChange={(e) => onPriceDiffChange(parseFloat(e.target.value) || 100)}
          />
        </label>
        <label>
          Time Till End (seconds):
          <input
            type="number"
            step="1"
            min="1"
            max="3600"
            value={timeTillEnd}
            onChange={(e) => onTimeTillEndChange(parseInt(e.target.value) || 300)}
          />
        </label>
        <label>
          Target Price (cents):
          <input
            type="number"
            step="1"
            min="1"
            max="100"
            value={targetPrice}
            onChange={(e) => onTargetPriceChange(parseInt(e.target.value) || 50)}
          />
        </label>
        <label>
          Max Total Cent (cents):
          <input
            type="number"
            step="1"
            min="50"
            max="200"
            value={maxTotalCent}
            onChange={(e) => onMaxTotalCentChange(parseInt(e.target.value) || 97)}
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


