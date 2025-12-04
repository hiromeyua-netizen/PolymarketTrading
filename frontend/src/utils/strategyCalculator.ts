export interface PriceData {
  slug: string
  timestamp: string
  upTokenPrice: number
  downTokenPrice: number
  createdAt: string
}

export interface Order {
  price: number
  timestamp: string
  size: number
  tokenType: 'up' | 'down'
  isReEntry: boolean
}

export interface HedgeOrder {
  price: number
  timestamp: string | null
  size: number
  tokenType: 'up' | 'down'
  isFilled: boolean
}

export interface OrderPair {
  entryOrder: Order
  hedgeOrder: HedgeOrder
}

export interface StrategyResult {
  totalProfit: number
  totalCost: number
  finalValue: number
  totalEntries: number
  totalHedgesFilled: number
  gridLevelsUsed: number[]
  orderPoints: { [key: string]: OrderPair[] }
}

interface GridLevelState {
  hasEntered: boolean
  hedgeFilled: boolean
  lastGridLevelCrossed: number | null
  orderPairs: OrderPair[]
}

/**
 * Get grid levels based on gridGap
 * Returns array of grid levels in cents
 * 
 * Examples:
 * - gridGap = 3: [53, 56, 59, ..., 99]
 * - gridGap = 4: [54, 58, 62, ..., 96]
 * - gridGap = 5: [55, 60, 65, ..., 95]
 * 
 * Pattern: start = 50 + gridGap
 * End calculation: for gridGap <= 3, end = 99, otherwise end = 100 - gridGap
 */
function getGridLevels(gridGap: number, maxTotalCost: number = 97): number[] {
  const startLevel = 50 + gridGap
  const endLevel = maxTotalCost
  const levels: number[] = []
  
  for (let level = startLevel; level <= endLevel; level += gridGap) {
    levels.push(level)
  }
  
  return levels
}

/**
 * Find which grid level the current price is at
 * Returns the grid level if price exactly matches a grid level, null otherwise
 */
function getCurrentGridLevel(currentPrice: number, gridLevels: number[]): number | null {
  const currentPriceCents = Math.round(currentPrice * 100)
  
  for (const gridLevel of gridLevels) {
    if (currentPriceCents === gridLevel) {
      return gridLevel
    }
  }
  
  return null
}

/**
 * Process a single token (UP or DOWN) through the strategy
 */
function processToken(
  priceData: PriceData[],
  tokenType: 'up' | 'down',
  gridLevels: number[],
  orderSize: number,
  maxTotalCost: number
): GridLevelState[] {
  // Initialize state for each grid level
  const gridStates: Map<number, GridLevelState> = new Map()
  gridLevels.forEach(level => {
    gridStates.set(level, {
      hasEntered: false,
      hedgeFilled: false,
      lastGridLevelCrossed: null,
      orderPairs: []
    })
  })

  let previousGridLevel: number | null = null

  // Process each price point chronologically
  for (let i = 0; i < priceData.length; i++) {
    const data = priceData[i]
    const currentPrice = tokenType === 'up' ? data.upTokenPrice : data.downTokenPrice
    const oppositePrice = tokenType === 'up' ? data.downTokenPrice : data.upTokenPrice
    const oppositePriceCents = Math.round(oppositePrice * 100)

    // Determine current grid level
    // Default: same as previousGridLevel if it exists, otherwise null
    let currentGridLevel: number | null = previousGridLevel !== null ? previousGridLevel : null
    
    // If current price exactly matches any grid level, update currentGridLevel to that level
    const matchedGridLevel = getCurrentGridLevel(currentPrice, gridLevels)
    if (matchedGridLevel !== null) {
      currentGridLevel = matchedGridLevel
    }

    // Calculate grid level crossing using currentGridLevel and previousGridLevel
    if (currentGridLevel !== null && previousGridLevel !== null) {
      // We have both current and previous grid levels
      if (currentGridLevel !== previousGridLevel) {
        // Grid level changed - determine direction
        const crossedUp = currentGridLevel > previousGridLevel
        const gridLevel = currentGridLevel
        const state = gridStates.get(gridLevel)!

        if (crossedUp) {
          // Crossed from below (ascending) - reached from lower grid level
          const reachedFromBelow = previousGridLevel < gridLevel

          if (reachedFromBelow) {
            // Check if we should enter:
            // 1. First entry: always enter
            // 2. Re-entry: only if hedge was previously filled
            const shouldEnter = !state.hasEntered || state.hedgeFilled

            if (shouldEnter) {
              // Calculate hedge price (in cents, then convert to decimal)
              const entryPriceCents = gridLevel
              const hedgePriceCents = Math.max(0, maxTotalCost - entryPriceCents)
              const entryPrice = entryPriceCents / 100
              const hedgePrice = hedgePriceCents / 100

              // Create entry order
              const entryOrder: Order = {
                price: entryPrice,
                timestamp: data.timestamp,
                size: orderSize,
                tokenType: tokenType,
                isReEntry: state.hasEntered
              }

              // Create hedge order (initially not filled)
              const hedgeOrder: HedgeOrder = {
                price: hedgePrice,
                timestamp: null,
                size: orderSize,
                tokenType: tokenType === 'up' ? 'down' : 'up',
                isFilled: false
              }

              // Add order pair
              state.orderPairs.push({
                entryOrder,
                hedgeOrder
              })

              state.hasEntered = true
            }
          }
        }
        // If crossed down (descending), we don't enter, just update previousGridLevel below
      }
    } else if (currentGridLevel !== null && previousGridLevel === null) {
      // First time reaching a grid level - assume crossed from below
      const gridLevel = currentGridLevel
      const state = gridStates.get(gridLevel)!

      // Check if we should enter (first entry)
      if (!state.hasEntered || state.hedgeFilled) {
        const shouldEnter = !state.hasEntered || state.hedgeFilled

        if (shouldEnter) {
          // Calculate hedge price (in cents, then convert to decimal)
          const entryPriceCents = gridLevel
          const hedgePriceCents = Math.max(0, 100 - entryPriceCents - 3)
          const entryPrice = entryPriceCents / 100
          const hedgePrice = hedgePriceCents / 100

          // Create entry order
          const entryOrder: Order = {
            price: entryPrice,
            timestamp: data.timestamp,
            size: orderSize,
            tokenType: tokenType,
            isReEntry: state.hasEntered
          }

          // Create hedge order (initially not filled)
          const hedgeOrder: HedgeOrder = {
            price: hedgePrice,
            timestamp: null,
            size: orderSize,
            tokenType: tokenType === 'up' ? 'down' : 'up',
            isFilled: false
          }

          // Add order pair
          state.orderPairs.push({
            entryOrder,
            hedgeOrder
          })

          state.hasEntered = true
        }
      }
    }

    // Check if any hedge orders should be filled
    // Look through all grid levels and check if opposite price reached hedge price
    gridLevels.forEach(level => {
      const levelState = gridStates.get(level)!
      
      levelState.orderPairs.forEach((pair: OrderPair) => {
        if (!pair.hedgeOrder.isFilled) {
          const hedgePriceCents = Math.round(pair.hedgeOrder.price * 100)
          
          // Check if opposite price has reached or crossed hedge price (opposite price <= hedge price)
          if (oppositePriceCents <= hedgePriceCents) {
            pair.hedgeOrder.isFilled = true
            pair.hedgeOrder.timestamp = data.timestamp
            
            // Mark this grid level's hedge as filled if all hedges are filled
            if (levelState.orderPairs.every((p: OrderPair) => p.hedgeOrder.isFilled)) {
              levelState.hedgeFilled = true
            }
          }
        }
      })
    })

    // Update previous grid level for next iteration
    if (currentGridLevel !== null) {
      previousGridLevel = currentGridLevel
    }
  }

  return Array.from(gridStates.values())
}

/**
 * Calculate Grid Hedge Strategy results
 */
export function calculateGridHedgeStrategy(
  priceData: PriceData[],
  maxTotalCost: number = 0.97,
  gridGap: number = 5,
  orderSize: number = 1
): StrategyResult {
  if (priceData.length === 0) {
    return {
      totalProfit: 0,
      totalCost: 0,
      finalValue: 0,
      totalEntries: 0,
      totalHedgesFilled: 0,
      gridLevelsUsed: [],
      orderPoints: {}
    }
  }

  // Get grid levels
  const gridLevels = getGridLevels(gridGap, maxTotalCost)

  // Process both UP and DOWN tokens
  const upStates = processToken(priceData, 'up', gridLevels, orderSize, maxTotalCost)
  const downStates = processToken(priceData, 'down', gridLevels, orderSize, maxTotalCost)

  // Combine order points from both tokens
  const orderPoints: { [key: string]: OrderPair[] } = {}
  let totalEntries = 0
  let totalHedgesFilled = 0
  let totalCost = 0
  const gridLevelsUsed: number[] = []

  // Process UP token orders
  gridLevels.forEach((level, index) => {
    const state = upStates[index]
    if (state.orderPairs.length > 0) {
      const levelKey = level.toString()
      if (!orderPoints[levelKey]) {
        orderPoints[levelKey] = []
        gridLevelsUsed.push(level)
      }
      orderPoints[levelKey].push(...state.orderPairs)
      totalEntries += state.orderPairs.length
      state.orderPairs.forEach((pair: OrderPair) => {
        totalCost += pair.entryOrder.price * pair.entryOrder.size
        if (pair.hedgeOrder.isFilled) {
          totalHedgesFilled++
          totalCost += pair.hedgeOrder.price * pair.hedgeOrder.size
        }
      })
    }
  })

  // Process DOWN token orders
  gridLevels.forEach((level, index) => {
    const state = downStates[index]
    if (state.orderPairs.length > 0) {
      const levelKey = level.toString()
      if (!orderPoints[levelKey]) {
        orderPoints[levelKey] = []
        if (!gridLevelsUsed.includes(level)) {
          gridLevelsUsed.push(level)
        }
      }
      orderPoints[levelKey].push(...state.orderPairs)
      totalEntries += state.orderPairs.length
      state.orderPairs.forEach((pair: OrderPair) => {
        totalCost += pair.entryOrder.price * pair.entryOrder.size
        if (pair.hedgeOrder.isFilled) {
          totalHedgesFilled++
          totalCost += pair.hedgeOrder.price * pair.hedgeOrder.size
        }
      })
    }
  })

  // Calculate final value
  // Get the last price point
  const lastData = priceData[priceData.length - 1]

  let lastUpTokenPrice = 0;
  let lastDownTokenPrice = 0;

  if(lastData.upTokenPrice > lastData.downTokenPrice) {
    lastUpTokenPrice = 1;
  } else {
    lastDownTokenPrice = 1;
  }

  let finalValue = 0

  // Calculate value of all positions
  // For each order pair:
  // - Entry order: we own tokens at entry price, current value is current price
  // - Hedge order (if filled): we own tokens at hedge price, current value is current price
  gridLevels.forEach((_level, index) => {
    // UP token orders
    upStates[index].orderPairs.forEach((pair: OrderPair) => {
      // Entry order value
      if (pair.entryOrder.tokenType === 'up') {
        finalValue += lastUpTokenPrice * pair.entryOrder.size
      } else {
        finalValue += lastDownTokenPrice * pair.entryOrder.size
      }
      
      // Hedge order value (only if filled)
      if (pair.hedgeOrder.isFilled) {
        if (pair.hedgeOrder.tokenType === 'up') {
          finalValue += lastUpTokenPrice * pair.hedgeOrder.size
        } else {
          finalValue += lastDownTokenPrice * pair.hedgeOrder.size
        }
      }
    })

    // DOWN token orders
    downStates[index].orderPairs.forEach((pair: OrderPair) => {
      // Entry order value
      if (pair.entryOrder.tokenType === 'up') {
        finalValue += lastUpTokenPrice * pair.entryOrder.size
      } else {
        finalValue += lastDownTokenPrice * pair.entryOrder.size
      }
      
      // Hedge order value (only if filled)
      if (pair.hedgeOrder.isFilled) {
        if (pair.hedgeOrder.tokenType === 'up') {
          finalValue += lastUpTokenPrice * pair.hedgeOrder.size
        } else {
          finalValue += lastDownTokenPrice * pair.hedgeOrder.size
        }
      }
    })
  })

  const totalProfit = finalValue - totalCost

  // Sort grid levels used
  gridLevelsUsed.sort((a, b) => a - b)

  console.log({
    totalProfit: Math.round(totalProfit * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    finalValue: Math.round(finalValue * 100) / 100,
    totalEntries,
    totalHedgesFilled,
    gridLevelsUsed,
    orderPoints
  })

  return {
    totalProfit: Math.round(totalProfit * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    finalValue: Math.round(finalValue * 100) / 100,
    totalEntries,
    totalHedgesFilled,
    gridLevelsUsed,
    orderPoints
  }
}

