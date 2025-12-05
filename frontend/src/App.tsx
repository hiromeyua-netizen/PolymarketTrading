import { useState, useEffect } from 'react'
import SlugSelector from './components/SlugSelector'
import PriceChart from './components/PriceChart'
import { fetchAllSlugs, fetchPriceHistory } from './services/api'
import { calculateGridHedgeStrategy, StrategyResult } from './utils/strategyCalculator'
import './App.css'

interface PriceData {
  slug: string
  timestamp: string
  upTokenPrice: number
  downTokenPrice: number
  createdAt: string
}

function App() {
  const [slugs, setSlugs] = useState<string[]>([])
  const [selectedSlug, setSelectedSlug] = useState<string>('')
  const [priceData, setPriceData] = useState<PriceData[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // Strategy calculation parameters
  const [maxTotalCost, setMaxTotalCost] = useState<number>(97)
  const [gridGap, setGridGap] = useState<number>(5)
  const [orderSize, setOrderSize] = useState<number>(1)
  
  // Track expanded grid levels for order points
  const [expandedLevels, setExpandedLevels] = useState<Set<number>>(new Set())
  const [strategyResult, setStrategyResult] = useState<StrategyResult | null>(null)

  // Calculate strategy results
  useEffect(() => {
    setStrategyResult(calculateGridHedgeStrategy(priceData, maxTotalCost, gridGap, orderSize))
  }, [priceData, maxTotalCost, gridGap, orderSize])

  useEffect(() => {
    loadSlugs()
  }, [])

  useEffect(() => {
    if (selectedSlug) {
      loadPriceData(selectedSlug)
    } else {
      setPriceData([])
    }
  }, [selectedSlug])

  const loadSlugs = async () => {
    try {
      const response = await fetchAllSlugs()
      setSlugs(response.slugs)
    } catch (err) {
      setError('Failed to load slugs')
      console.error('Error loading slugs:', err)
    }
  }

  const loadPriceData = async (slug: string) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetchPriceHistory(slug)
      setPriceData(response.data)
    } catch (err) {
      setError('Failed to load price data')
      console.error('Error loading price data:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <div className="container">
        <header className="header">
          <h1>Polymarket Trading Bot</h1>
          <p>Price History Dashboard</p>
        </header>

        <div className="content">
          <SlugSelector
            slugs={slugs}
            selectedSlug={selectedSlug}
            onSlugChange={setSelectedSlug}
            loading={loading}
          />

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          {selectedSlug && (
            <div className="chart-container">
              {loading ? (
                <div className="loading">Loading price data...</div>
              ) : priceData.length > 0 ? (
                <>

                  {strategyResult && (
                    <div className="strategy-results">
                      <h3>Strategy Results</h3>
                      <div className="strategy-params">
                        <label>
                          Max Total Cost:
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            value={maxTotalCost}
                            onChange={(e) => setMaxTotalCost(parseFloat(e.target.value) || 0.97)}
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
                            onChange={(e) => setGridGap(parseInt(e.target.value) || 5)}
                          />
                        </label>
                        <label>
                          Order Size:
                          <input
                            type="number"
                            step="0.1"
                            min="0.1"
                            value={orderSize}
                            onChange={(e) => setOrderSize(parseFloat(e.target.value) || 1)}
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
                              
                              const toggleExpand = () => {
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
                                <div key={level} className="grid-level-group">
                                  <div 
                                    className="grid-level-header"
                                    onClick={toggleExpand}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault()
                                        toggleExpand()
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
                  )}
                  <PriceChart data={priceData} slug={selectedSlug} />
                </>
              ) : (
                <div className="no-data">No price data available for this slug</div>
              )}
            </div>
          )}

          {!selectedSlug && (
            <div className="placeholder">
              <p>Select a slug from the dropdown above to view price history</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App

