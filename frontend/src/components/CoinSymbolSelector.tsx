import './CoinSymbolSelector.css'

export type CoinSymbol = 'BTC' | 'ETH' | 'SOL'

interface CoinSymbolSelectorProps {
  selectedCoin: CoinSymbol
  onCoinChange: (coin: CoinSymbol) => void
}

export default function CoinSymbolSelector({
  selectedCoin,
  onCoinChange
}: CoinSymbolSelectorProps) {
  const coins: CoinSymbol[] = ['BTC', 'ETH', 'SOL']

  return (
    <div className="coin-symbol-selector">
      <label htmlFor="coin-symbol-select">
        <span className="selector-label">Coin Symbol:</span>
        <select
          id="coin-symbol-select"
          value={selectedCoin}
          onChange={(e) => onCoinChange(e.target.value as CoinSymbol)}
          className="coin-select"
        >
          {coins.map((coin) => (
            <option key={coin} value={coin}>
              {coin}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

