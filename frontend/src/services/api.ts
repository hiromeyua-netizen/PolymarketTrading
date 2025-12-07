import axios from 'axios'

const API_BASE_URL = '/api'

export interface SlugResponse {
  count: number
  slugs: string[]
}

export interface PriceData {
  slug: string
  timestamp: string
  upTokenPrice: number
  downTokenPrice: number
  createdAt: string
}

export interface PriceHistoryResponse {
  slug: string
  count: number
  data: PriceData[]
}

export const fetchAllSlugs = async (): Promise<SlugResponse> => {
  const response = await axios.get<SlugResponse>(`${API_BASE_URL}/slugs`)
  return response.data
}

export const fetchPriceHistory = async (
  slug: string,
  startDate?: string,
  endDate?: string,
  limit?: number
): Promise<PriceHistoryResponse> => {
  const params = new URLSearchParams()
  if (startDate) params.append('startDate', startDate)
  if (endDate) params.append('endDate', endDate)
  if (limit) params.append('limit', limit.toString())

  const queryString = params.toString()
  const url = `${API_BASE_URL}/price-history/${slug}${queryString ? `?${queryString}` : ''}`

  const response = await axios.get<PriceHistoryResponse>(url)
  return response.data
}

export interface TotalProfitResponse {
  totalProfit: number
  totalCost: number
  totalFinalValue: number
  totalEntries: number
  totalHedgesFilled: number
  totalSlugCount: number
  processedSlugCount: number
  actualProcessedCount: number
  parameters: {
    maxTotalCost: number
    gridGap: number
    orderSize: number
    count: number | null
  }
  results: Array<{
    slug: string
    profit: number
    cost: number
    finalValue: number
    entries: number
    hedgesFilled: number
  }>
}

export const fetchTotalProfit = async (
  maxTotalCost: number,
  gridGap: number,
  orderSize: number,
  count?: number
): Promise<TotalProfitResponse> => {
  const params = new URLSearchParams()
  params.append('maxTotalCost', maxTotalCost.toString())
  params.append('gridGap', gridGap.toString())
  params.append('orderSize', orderSize.toString())
  if (count !== undefined) {
    params.append('count', count.toString())
  }

  const response = await axios.get<TotalProfitResponse>(`${API_BASE_URL}/strategy/total-profit?${params.toString()}`)
  return response.data
}

export interface TotalProfit2Response {
  totalProfit: number
  totalCost: number
  totalFinalValue: number
  totalReceived: number
  totalSlugCount: number
  processedSlugCount: number
  actualProcessedCount: number
  parameters: {
    targetTotal: number
    sellThreshold: number
    orderSize: number
    count: number | null
  }
  results: Array<{
    slug: string
    profit: number
    cost: number
    finalValue: number
    totalReceived: number
  }>
}

export const fetchTotalProfit2 = async (
  targetTotal: number,
  sellThreshold: number,
  orderSize: number,
  count?: number
): Promise<TotalProfit2Response> => {
  const params = new URLSearchParams()
  params.append('targetTotal', targetTotal.toString())
  params.append('sellThreshold', sellThreshold.toString())
  params.append('orderSize', orderSize.toString())
  if (count !== undefined) {
    params.append('count', count.toString())
  }

  const response = await axios.get<TotalProfit2Response>(`${API_BASE_URL}/strategy/total-profit-2?${params.toString()}`)
  return response.data
}

