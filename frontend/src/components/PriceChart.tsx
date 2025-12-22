import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, TooltipProps } from 'recharts'
import './PriceChart.css'

interface PriceData {
  slug: string
  timestamp: string
  upTokenPrice: number
  downTokenPrice: number
  createdAt: string
  coinPriceBias?: number
}

interface PriceChartProps {
  data: PriceData[]
  slug: string
}

// Custom Tooltip component to display coin price bias
const CustomTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div className="custom-tooltip" style={{
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        border: '1px solid #ccc',
        borderRadius: '8px',
        padding: '10px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <p style={{ margin: '0 0 8px 0', fontWeight: 'bold' }}>{`Time: ${label}`}</p>
        {payload.map((entry, index) => (
          <p key={index} style={{ margin: '4px 0', color: entry.color }}>
            {`${entry.name}: ${entry.value?.toFixed(4)}`}
          </p>
        ))}
        {data.coinPriceBias !== undefined && data.coinPriceBias !== null && (
          <p style={{ margin: '4px 0', color: '#6366f1', fontWeight: '500' }}>
            {`Coin Price Bias: ${data.coinPriceBias > 0 ? '+' : ''}${data.coinPriceBias.toFixed(2)}`}
          </p>
        )}
      </div>
    )
  }
  return null
}

const PriceChart = ({ data, slug }: PriceChartProps) => {
  // Format data for chart
  const chartData = data.map((item) => ({
    time: new Date(item.timestamp).toLocaleString(),
    timestamp: item.timestamp,
    upTokenPrice: item.upTokenPrice,
    downTokenPrice: item.downTokenPrice,
    coinPriceBias: item.coinPriceBias,
  }))

  console.log(chartData)

  return (
    <div className="price-chart">
      <div className="chart-header">
        <h2>Price History: {slug}</h2>
        <div className="chart-stats">
          <span className="stat-item">
            <span className="stat-label">Total Records:</span>
            <span className="stat-value">{data.length}</span>
          </span>
          <span className="stat-item">
            <span className="stat-label">Time Range:</span>
            <span className="stat-value">
              {data.length > 0
                ? `${new Date(data[0].timestamp).toLocaleString()} - ${new Date(data[data.length - 1].timestamp).toLocaleString()}`
                : 'N/A'}
            </span>
          </span>
        </div>
      </div>

      <div className="chart-wrapper">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis
              dataKey="time"
              stroke="#666"
              angle={-45}
              textAnchor="end"
              height={100}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke="#666"
              domain={[0, 1]}
              tickFormatter={(value) => value.toFixed(2)}
              ticks={Array.from({ length: 21 }, (_, i) => i * 0.05)}
              interval={0}
              allowDecimals={true}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line
              type="monotone"
              dataKey="upTokenPrice"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              name="UP Token Price (Best Ask)"
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone"
              dataKey="downTokenPrice"
              stroke="#ef4444"
              strokeWidth={2}
              dot={false}
              name="DOWN Token Price (Best Ask)"
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-info">
        <div className="info-item">
          <span className="info-label">UP Token:</span>
          <span className="info-value up">Green Line</span>
        </div>
        <div className="info-item">
          <span className="info-label">DOWN Token:</span>
          <span className="info-value down">Red Line</span>
        </div>
      </div>
    </div>
  )
}

export default PriceChart

