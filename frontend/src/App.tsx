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

