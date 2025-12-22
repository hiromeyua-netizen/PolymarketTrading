export interface PriceData {
  slug: string
  timestamp: string
  upTokenPrice: number
  downTokenPrice: number
  createdAt: string
  coinPriceBias?: number
}

export interface Order {
  price: number // in cents
  timestamp: string
  size: number
  tokenType: 'up' | 'down'
  isFilled: boolean
}

export interface StrategyResult {
  totalProfit: number
  totalCost: number
  finalValue: number
  totalEntries: number
  totalHedgesFilled: number
  order: Order | null
  hedgeOrder: Order | null
}

/**
 * Calculate New Hedge Strategy results
 * 
 * Strategy:
 * 1. Buy first order at losing side when conditions are met:
 *    - |coinPriceBias| < PriceDiff
 *    - timeTillEnd > TimeTillEnd
 *    - losingSidePrice < TargetPrice (in cents)
 * 2. Immediately buy hedge order on opposite side
 *    - hedgeOrderPrice = MaxTotalCent - firstOrderPrice
 * 
 * @param priceData - Array of price data points
 * @param priceDiff - Maximum absolute coin price bias threshold (in dollars)
 * @param timeTillEnd - Minimum time remaining until event ends (in seconds)
 * @param targetPrice - Maximum price for losing side token (in cents)
 * @param maxTotalCent - Maximum total cost for both orders (in cents)
 * @param orderSize - Size of each order (default 1)
 * @param eventType - Event type: 'hourly' or '15min' (default 'hourly')
 */
export function calculateNewHedgeStrategy(
  priceData: PriceData[],
  priceDiff: number,
  timeTillEnd: number,
  targetPrice: number,
  maxTotalCent: number,
  orderSize: number = 1,
  eventType: 'hourly' | '15min' = 'hourly'
): StrategyResult {
  if (priceData.length === 0) {
    return {
      totalProfit: 0,
      totalCost: 0,
      finalValue: 0,
      totalEntries: 0,
      totalHedgesFilled: 0,
      order: null,
      hedgeOrder: null,
    }
  }

  // Calculate event duration in seconds
  const eventDurationSeconds = eventType === '15min' ? 15 * 60 : 60 * 60 // 900 for 15min, 3600 for hourly
  
  // Get first timestamp as event start reference
  const firstTimestamp = new Date(priceData[0].timestamp).getTime()
  
  let totalCost = 0
  let totalFinalValue = 0
  let totalEntries = 0
  let totalHedgesFilled = 0
  
  let order: Order | null = null
  let hedgeOrder: Order | null = null
  let hedgeFilled = false
  
  // Track if we've already entered
  let hasEntered = false

  // Process price data chronologically
  for (let i = 0; i < priceData.length; i++) {
    const data = priceData[i]
    const currentTimestamp = new Date(data.timestamp).getTime()
    
    // Calculate time remaining until event ends
    const elapsedSeconds = (currentTimestamp - firstTimestamp) / 1000
    const remainingSeconds = eventDurationSeconds - elapsedSeconds

    // If we have already entered, only need to check if hedge order gets filled
    if (hasEntered && order && hedgeOrder && !hedgeFilled) {
      const hedgeSidePriceCents = hedgeOrder.tokenType === 'up'
        ? Math.round(data.upTokenPrice * 100)
        : Math.round(data.downTokenPrice * 100)

      // Buy limit order: it is filled when market price <= limit price
      if (hedgeSidePriceCents <= hedgeOrder.price) {
        totalCost += hedgeOrder.price * hedgeOrder.size
        totalHedgesFilled++
        hedgeFilled = true
        hedgeOrder.timestamp = data.timestamp
        hedgeOrder.isFilled = true
      }

      // Once we've checked hedge fill, move to next data point
      continue
    }

    // If we've already entered and hedge is resolved (filled or never will be), skip further entries
    if (hasEntered) {
      continue
    }

    // Before entry: decide whether to place the first order + hedge
    // Check if coinPriceBias exists
    if (data.coinPriceBias === undefined || data.coinPriceBias === null) {
      continue
    }

    // Determine losing side based on token prices
    // Lower price token = losing side (less likely to win)
    // Higher price token = winning side (more likely to win)
    const losingSide: 'up' | 'down' = data.upTokenPrice <= data.downTokenPrice ? 'up' : 'down'
    const winningSide: 'up' | 'down' = data.upTokenPrice <= data.downTokenPrice ? 'down' : 'up'
    
    // Get losing side price in cents
    const losingSidePriceCents = losingSide === 'up' 
      ? Math.round(data.upTokenPrice * 100)
      : Math.round(data.downTokenPrice * 100)

    // Check all three conditions
    const condition1 = Math.abs(data.coinPriceBias) < priceDiff
    const condition2 = remainingSeconds > timeTillEnd
    const condition3 = losingSidePriceCents < targetPrice

    // If all conditions are met, place orders
    if (condition1 && condition2 && condition3) {
      // Place first order on losing side
      order = {
        price: losingSidePriceCents,
        timestamp: data.timestamp,
        size: orderSize,
        tokenType: losingSide,
        isFilled: true
      }
      totalCost += order.price * order.size
      totalEntries++

      // Immediately place hedge order on winning side
      const hedgePriceCents = maxTotalCent - order.price
      hedgeOrder = {
        price: hedgePriceCents,
        timestamp: data.timestamp, // initial placement time; fill time may be updated later
        size: orderSize,
        tokenType: winningSide,
        isFilled: false
      }

      // Mark as entered
      hasEntered = true
      // Do NOT break here; we must continue iterating to see if/when hedge order is filled
    }
  }

  // Determine outcome side at event end based on final coinPriceBias or final prices
  const lastData = priceData[priceData.length - 1]
  let outcomeSide: 'up' | 'down'
  if (lastData.coinPriceBias !== undefined && lastData.coinPriceBias !== null) {
    outcomeSide = lastData.coinPriceBias >= 0 ? 'up' : 'down'
  } else {
    outcomeSide = lastData.upTokenPrice >= lastData.downTokenPrice ? 'up' : 'down'
  }

  // Calculate final value at settlement:
  // Winning side token is worth 1.0, losing side token is worth 0.
  if (order) {
    const orderPayoutCentsPerToken = order.tokenType === outcomeSide ? 100 : 0
    totalFinalValue += (orderPayoutCentsPerToken * order.size) / 100
  }

  if (hedgeOrder && hedgeFilled) {
    const hedgePayoutCentsPerToken = hedgeOrder.tokenType === outcomeSide ? 100 : 0
    totalFinalValue += (hedgePayoutCentsPerToken * hedgeOrder.size) / 100
  }

  const totalProfit = totalFinalValue - (totalCost / 100) // Convert cents to dollars

  return {
    totalProfit: Math.round(totalProfit * 100) / 100,
    totalCost: Math.round((totalCost / 100) * 100) / 100, // Convert cents to dollars
    finalValue: Math.round(totalFinalValue * 100) / 100,
    totalEntries,
    totalHedgesFilled,
    order,
    hedgeOrder
  }
}

