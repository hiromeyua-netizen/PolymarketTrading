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

