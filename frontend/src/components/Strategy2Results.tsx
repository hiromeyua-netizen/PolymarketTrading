import { StrategyResult } from '../utils/strategyCalculator2'

interface Strategy2ResultsProps {
  strategyResult: StrategyResult
  targetTotal: number
  sellThreshold: number
  orderSize: number
  onTargetTotalChange: (value: number) => void
  onSellThresholdChange: (value: number) => void
  onOrderSizeChange: (value: number) => void
}

export default function Strategy2Results({
  strategyResult,
  targetTotal,
  sellThreshold,
  orderSize,
  onTargetTotalChange,
  onSellThresholdChange,
  onOrderSizeChange
}: Strategy2ResultsProps) {
  return (
    <div className="strategy-results">
      <h3>Strategy 2 Results (Pre-Purchased Sell Strategy)</h3>
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
          <span className="stat-label">Total Received:</span>
          <span className="stat-value">{strategyResult.totalReceived.toFixed(2)}</span>
        </div>
      </div>
      
      {(strategyResult.firstSellOrder || strategyResult.secondSellLimitOrder) && (
        <div className="order-points-section">
          <h4>Order Details</h4>
          <div className="order-points-container">
            {strategyResult.firstSellOrder && (
              <div className="order-pair">
                <div className="order-pair-header">
                  <span className="pair-index">First Sell Order</span>
                </div>
                <div className="order-details">
                  <div className="order-entry">
                    <div className="order-type">Immediate Sell</div>
                    <div className="order-info">
                      <span><strong>Token:</strong> {strategyResult.firstSellOrder.tokenType.toUpperCase()}</span>
                      <span><strong>Price:</strong> {strategyResult.firstSellOrder.price.toFixed(0)}c</span>
                      <span><strong>Size:</strong> {strategyResult.firstSellOrder.size}</span>
                      <span><strong>Time:</strong> {new Date(strategyResult.firstSellOrder.timestamp).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {strategyResult.secondSellLimitOrder && (
              <div className="order-pair">
                <div className="order-pair-header">
                  <span className="pair-index">Second Sell Limit Order</span>
                </div>
                <div className="order-details">
                  <div className="order-hedge">
                    <div className="order-type">Limit Order</div>
                    <div className="order-info">
                      <span><strong>Token:</strong> {strategyResult.secondSellLimitOrder.tokenType.toUpperCase()}</span>
                      <span><strong>Price:</strong> {(strategyResult.secondSellLimitOrder.price).toFixed(0)}c</span>
                      <span><strong>Size:</strong> {strategyResult.secondSellLimitOrder.size}</span>
                      <span className={strategyResult.secondSellLimitOrder.isFilled ? 'filled' : 'pending'}>
                        <strong>Status:</strong> {strategyResult.secondSellLimitOrder.isFilled ? 'Filled' : 'Pending'}
                      </span>
                      {strategyResult.secondSellLimitOrder.timestamp && (
                        <span><strong>Filled Time:</strong> {new Date(strategyResult.secondSellLimitOrder.timestamp).toLocaleString()}</span>
                      )}
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

