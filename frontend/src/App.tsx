import { useState, useEffect } from 'react'
import SlugSelector from './components/SlugSelector'
import PriceChart from './components/PriceChart'
import InfoModal from './components/InfoModal'
import { fetchAllSlugs, fetchPriceHistory } from './services/api'
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
  const [showModal, setShowModal] = useState<boolean>(true)

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
      {showModal && <InfoModal onClose={() => setShowModal(false)} />}
      
      <div className="container">
        <header className="header">
          <h1>Polymarket Trading Bot</h1>
          <p>Price History Dashboard</p>
          <p> Hi, I am Trong Truong Pham from freelancer.com. Please contact me with the following telegram username: @ttp_trading</p>
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
                <PriceChart data={priceData} slug={selectedSlug} />
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

