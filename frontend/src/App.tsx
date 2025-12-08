import { useState, useEffect } from 'react'
import SlugSelector from './components/SlugSelector'
import PriceChart from './components/PriceChart'
import StrategySelector from './components/StrategySelector'
import Strategy1Results from './components/Strategy1Results'
import Strategy2Results from './components/Strategy2Results'
import TotalProfitCalculator from './components/TotalProfitCalculator'
import TotalProfitCalculator2 from './components/TotalProfitCalculator2'
import { fetchAllSlugs, fetchPriceHistory } from './services/api'
import { calculateGridHedgeStrategy, StrategyResult as Strategy1Result } from './utils/strategyCalculator1'
import { calculatePrePurchasedSellStrategy, StrategyResult as Strategy2Result } from './utils/strategyCalculator2'
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

  // Strategy 1 calculation parameters
  const [maxTotalCost, setMaxTotalCost] = useState<number>(97)
  const [gridGap, setGridGap] = useState<number>(5)
  const [orderSize, setOrderSize] = useState<number>(1)
  const [count, setCount] = useState<number | undefined>(undefined)
  const [enableRebuy, setEnableRebuy] = useState<boolean>(true)
  
  // Strategy 2 calculation parameters
  const [targetTotal, setTargetTotal] = useState<number>(105)
  const [sellThreshold, setSellThreshold] = useState<number>(65)
  
  // Selected strategy
  const [selectedStrategy, setSelectedStrategy] = useState<'strategy1' | 'strategy2'>('strategy1')
  
  const [strategyResult, setStrategyResult] = useState<Strategy1Result | null>(null)
  const [strategy2Result, setStrategy2Result] = useState<Strategy2Result | null>(null)

  // Calculate strategy 1 results
  useEffect(() => {
    setStrategyResult(calculateGridHedgeStrategy(priceData, maxTotalCost, gridGap, orderSize, enableRebuy))
  }, [priceData, maxTotalCost, gridGap, orderSize, enableRebuy])

  // Calculate strategy 2 results
  useEffect(() => {
    setStrategy2Result(calculatePrePurchasedSellStrategy(priceData, targetTotal, sellThreshold, orderSize))
  }, [priceData, targetTotal, sellThreshold, orderSize])

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

          <StrategySelector
            selectedStrategy={selectedStrategy}
            onStrategyChange={setSelectedStrategy}
          />

          {selectedStrategy === 'strategy1' && (
            <TotalProfitCalculator
              maxTotalCost={maxTotalCost}
              gridGap={gridGap}
              orderSize={orderSize}
              count={count}
              enableRebuy={enableRebuy}
              onMaxTotalCostChange={setMaxTotalCost}
              onGridGapChange={setGridGap}
              onOrderSizeChange={setOrderSize}
              onCountChange={setCount}
              onEnableRebuyChange={setEnableRebuy}
            />
          )}

          {selectedStrategy === 'strategy2' && (
            <TotalProfitCalculator2
              targetTotal={targetTotal}
              sellThreshold={sellThreshold}
              orderSize={orderSize}
              count={count}
              onTargetTotalChange={setTargetTotal}
              onSellThresholdChange={setSellThreshold}
              onOrderSizeChange={setOrderSize}
              onCountChange={setCount}
            />
          )}

          {selectedSlug && (
            <div className="chart-container">
              {loading ? (
                <div className="loading">Loading price data...</div>
              ) : priceData.length > 0 ? (
                <>
                  {selectedStrategy === 'strategy1' && strategyResult && (
                    <Strategy1Results
                      strategyResult={strategyResult}
                      maxTotalCost={maxTotalCost}
                      gridGap={gridGap}
                      orderSize={orderSize}
                      enableRebuy={enableRebuy}
                      onMaxTotalCostChange={setMaxTotalCost}
                      onGridGapChange={setGridGap}
                      onOrderSizeChange={setOrderSize}
                      onEnableRebuyChange={setEnableRebuy}
                    />
                  )}

                  {selectedStrategy === 'strategy2' && strategy2Result && (
                    <Strategy2Results
                      strategyResult={strategy2Result}
                      targetTotal={targetTotal}
                      sellThreshold={sellThreshold}
                      orderSize={orderSize}
                      onTargetTotalChange={setTargetTotal}
                      onSellThresholdChange={setSellThreshold}
                      onOrderSizeChange={setOrderSize}
                    />
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

