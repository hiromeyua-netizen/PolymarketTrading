import { StrategyResult } from '../utils/strategyCalculater3'

interface Strategy3ResultsProps {
  strategyResult: StrategyResult
  priceDiff: number
  timeTillEnd: number
  targetPrice: number
  maxTotalCent: number
  orderSize: number
  onPriceDiffChange: (value: number) => void
  onTimeTillEndChange: (value: number) => void
  onTargetPriceChange: (value: number) => void
  onMaxTotalCentChange: (value: number) => void
  onOrderSizeChange: (value: number) => void
}

export default function Strategy3Results({
  strategyResult,
  priceDiff,
  timeTillEnd,
  targetPrice,
  maxTotalCent,
  orderSize,
  onPriceDiffChange,
  onTimeTillEndChange,
  onTargetPriceChange,
  onMaxTotalCentChange,
  onOrderSizeChange
}: Strategy3ResultsProps) {
  return (
    <div className="strategy-results">
      <h3>Strategy 3 Results (New Hedge Strategy)</h3>
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
            onChange={(e) => onMaxTotalCentChange(parseInt(e.target.value) || 100)}
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
          <span className="stat-label">Total Hedges Filled:</span>
          <span className="stat-value">{strategyResult.totalHedgesFilled}</span>
        </div>
      </div>
      
      {(strategyResult.order || strategyResult.hedgeOrder) && (
        <div className="order-points-section">
          <h4>Order Details</h4>
          <div className="order-points-container">
            {strategyResult.order && (
              <div className="order-pair">
                <div className="order-pair-header">
                  <span className="pair-index">First Order (Losing Side)</span>
                </div>
                <div className="order-details">
                  <div className="order-entry">
                    <div className="order-type">Entry Order</div>
                    <div className="order-info">
                      <span><strong>Token:</strong> {strategyResult.order.tokenType.toUpperCase()}</span>
                      <span><strong>Price:</strong> {strategyResult.order.price.toFixed(0)}c</span>
                      <span><strong>Size:</strong> {strategyResult.order.size}</span>
                      <span><strong>Time:</strong> {new Date(strategyResult.order.timestamp).toLocaleString()}</span>
                      <span className={strategyResult.order.isFilled ? 'filled' : 'pending'}>
                        <strong>Status:</strong> {strategyResult.order.isFilled ? 'Filled' : 'Pending'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {strategyResult.hedgeOrder && (
              <div className="order-pair">
                <div className="order-pair-header">
                  <span className="pair-index">Hedge Order (Winning Side)</span>
                </div>
                <div className="order-details">
                  <div className="order-hedge">
                    <div className="order-type">Hedge Order</div>
                    <div className="order-info">
                      <span><strong>Token:</strong> {strategyResult.hedgeOrder.tokenType.toUpperCase()}</span>
                      <span><strong>Price:</strong> {strategyResult.hedgeOrder.price.toFixed(0)}c</span>
                      <span><strong>Size:</strong> {strategyResult.hedgeOrder.size}</span>
                      <span><strong>Time:</strong> {new Date(strategyResult.hedgeOrder.timestamp).toLocaleString()}</span>
                      <span className={strategyResult.hedgeOrder.isFilled ? 'filled' : 'pending'}>
                        <strong>Status:</strong> {strategyResult.hedgeOrder.isFilled ? 'Filled' : 'Pending'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}


