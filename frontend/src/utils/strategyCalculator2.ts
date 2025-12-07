export interface PriceData {
  slug: string
  timestamp: string
  upTokenPrice: number
  downTokenPrice: number
  createdAt: string
}

export interface FirstSellOrder {
  price: number
  timestamp: string
  size: number
  tokenType: 'up' | 'down'
}

export interface SecondSellLimitOrder {
  price: number
  timestamp: string | null
  size: number
  tokenType: 'up' | 'down'
  isFilled: boolean
}

export interface StrategyResult {
  totalProfit: number
  totalCost: number
  finalValue: number
  firstSellOrder: FirstSellOrder | null
  secondSellLimitOrder: SecondSellLimitOrder | null
  totalReceived: number
}

/**
 * Calculate Pre-Purchased Dual Token Sell Strategy results
 * 
 * Strategy:
 * 1. Initial: Buy both UP and DOWN tokens at 50c each (total cost = 100c)
 * 2. When one side reaches sellThreshold (default 65c), sell it immediately
 * 3. Place limit order for the other side at (targetTotal - sellThreshold) to ensure total >= targetTotal
 *    Example: If UP sold at 65c, place DOWN limit at 40c (105 - 65 = 40)
 * 4. Wait for the opposite side to reach the limit price, then sell it
 * 
 * @param priceData - Array of price data points
 * @param targetTotal - Target total sell price (in cents, default 105)
 * @param sellThreshold - Price threshold for immediate sell (in cents, default 65)
 * @param orderSize - Size of each token position (default 1)
 */
export function calculatePrePurchasedSellStrategy(
  priceData: PriceData[],
  targetTotal: number = 105,
  sellThreshold: number = 65,
  orderSize: number = 1
): StrategyResult {
  if (priceData.length === 0) {
    return {
      totalProfit: 0,
      totalCost: 0,
      finalValue: 0,
      firstSellOrder: null,
      secondSellLimitOrder: null,
      totalReceived: 0
    }
  }

  // Initial purchase: Buy both tokens at 50c each
  const initialCost = 0.5 * orderSize * 2 // Both UP and DOWN
  let totalReceived = 0

  // Track state
  let firstSellOrder: FirstSellOrder | null = null
  let secondSellLimitOrder: SecondSellLimitOrder | null = null

  // Process price data chronologically
  for (let i = 0; i < priceData.length; i++) {
    const data = priceData[i]
    const upSellPriceCents = 100 -Math.round(data.upTokenPrice * 100)
    const downSellPriceCents = 100 -Math.round(data.downTokenPrice * 100)

    // If we haven't sold yet, check if either token reaches sell threshold
    if (firstSellOrder === null) {
      // Check if UP token reaches sell threshold
      if (upSellPriceCents >= sellThreshold) {
        // Sell UP token immediately
        firstSellOrder = {
          price: upSellPriceCents,
          timestamp: data.timestamp,
          size: orderSize,
          tokenType: 'up'
        }
        totalReceived += firstSellOrder.price * firstSellOrder.size

        // Place limit order for DOWN token
        // Target: ensure total >= targetTotal
        // If UP sold at sellThreshold, DOWN limit = targetTotal - sellThreshold
        const limitPriceCents = targetTotal - sellThreshold
        secondSellLimitOrder = {
          price: limitPriceCents,
          timestamp: null,
          size: orderSize,
          tokenType: 'down',
          isFilled: false
        }
      }
      // Check if DOWN token reaches sell threshold
      else if (downSellPriceCents >= sellThreshold) {
        // Sell DOWN token immediately
        firstSellOrder = {
          price: downSellPriceCents,
          timestamp: data.timestamp,
          size: orderSize,
          tokenType: 'down'
        }
        totalReceived += firstSellOrder.price * firstSellOrder.size

        // Place limit order for UP token
        const limitPriceCents = targetTotal - sellThreshold
        secondSellLimitOrder = {
          price: limitPriceCents,
          timestamp: null,
          size: orderSize,
          tokenType: 'up',
          isFilled: false
        }
      }
    }

    // Check if limit order should be filled
    if (secondSellLimitOrder && !secondSellLimitOrder.isFilled) {
      const currentPriceCents = secondSellLimitOrder.tokenType === 'up' 
        ? upSellPriceCents 
        : downSellPriceCents
      const limitPriceCents = Math.round(secondSellLimitOrder.price * 100)

      // Limit order fills when current price reaches or goes below limit price
      // (selling the remaining token)
      if (currentPriceCents <= limitPriceCents) {
        secondSellLimitOrder.isFilled = true
        secondSellLimitOrder.timestamp = data.timestamp
        totalReceived += secondSellLimitOrder.price * secondSellLimitOrder.size
      }
    }
  }

  // Calculate final value
  // If limit order was never filled, use final market price for remaining token
  let finalValue = totalReceived

  if (firstSellOrder && secondSellLimitOrder && !secondSellLimitOrder.isFilled) {
    // Limit order never filled, use final market price
    const lastData = priceData[priceData.length - 1]
    const remainingTokenPrice = secondSellLimitOrder.tokenType === 'up'
      ? lastData.upTokenPrice
      : lastData.downTokenPrice
    finalValue += remainingTokenPrice * secondSellLimitOrder.size
  } else if (!firstSellOrder) {
    // Never sold, use final market prices for both tokens
    const lastData = priceData[priceData.length - 1]
    finalValue = (100 - lastData.upTokenPrice + 100 - lastData.downTokenPrice) * orderSize
  }

  finalValue = finalValue / 100;
  const totalProfit = finalValue - initialCost

  return {
    totalProfit: Math.round(totalProfit * 100) / 100,
    totalCost: Math.round(initialCost * 100) / 100,
    finalValue: Math.round(finalValue * 100) / 100,
    firstSellOrder,
    secondSellLimitOrder,
    totalReceived: Math.round(totalReceived * 100) / 100
  }
}

