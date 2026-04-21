import { productClient } from './api'
import { aiClient } from './api'
import type { Category, Deal, Paginated, Product, ProductVariant, Review, SearchResponse } from '../types'

export const productService = {
    // Products
    list: (params?: Record<string, unknown>) =>
        productClient.get<Paginated<Product>>('/products', { params }).then(r => r.data),

    listFeatured: (page = 1, size = 8) =>
        productClient.get<Paginated<Product>>('/products/featured', { params: { page, size } }).then(r => r.data),

    listPromoted: (page = 1, size = 20) =>
        productClient.get<Paginated<Product>>('/products', { params: { is_promoted: true, is_active: true, page, size } }).then(r => r.data),

    get: (id: string) => productClient.get<Product>(`/products/${id}`).then(r => r.data),

    create: (formData: FormData) =>
        productClient.post<Product>('/products', formData).then(r => r.data),

    update: (id: string, data: object) =>
        productClient.put<Product>(`/products/${id}`, data).then(r => r.data),

    updateStock: (id: string, data: { stock_quantity?: number; stock_status?: string }) =>
        productClient.patch<Product>(`/products/${id}/stock`, data).then(r => r.data),

    delete: (id: string) => productClient.delete(`/products/${id}`),

    addImages: (id: string, files: File[]) => {
        const fd = new FormData()
        files.forEach(f => fd.append('images', f))
        return productClient.post<import('../types').Product>(`/products/${id}/images`, fd).then(r => r.data)
    },

    deleteImage: (productId: string, imageId: string) =>
        productClient.delete(`/products/${productId}/images/${imageId}`),

    // Bulk import / export
    exportProductsCsv: () =>
        productClient.get('/products/export/csv', { responseType: 'blob' }).then(r => r.data),

    importProductsCsv: (file: File) => {
        const fd = new FormData()
        fd.append('file', file)
        return productClient.post<{ created: number; updated: number; errors: number; error_details: string[] }>(
            '/products/import/csv', fd).then(r => r.data)
    },

    // Low-stock: fetch both low_stock + out_of_stock, sorted by qty asc
    getLowStock: () =>
        productClient.get<Product[]>('/products/low-stock', { params: { size: 100 } }).then(r => r.data),

    getProducts: (params?: Record<string, unknown>) =>
        productClient.get<Paginated<Product>>('/products', { params }).then(r => r.data),

    // Categories
    listCategories: () => productClient.get<Category[]>('/categories').then(r => r.data),
    createCategory: (data: object) => productClient.post<Category>('/categories', data).then(r => r.data),
    deleteCategory: (id: string) => productClient.delete(`/categories/${id}`),

    // Search
    search: (q: string, page = 1, size = 20) =>
        productClient.get<SearchResponse>('/search', { params: { q, page, size } }).then(r => r.data),

    filter: (body: object) =>
        productClient.post<SearchResponse>('/search/filter', body).then(r => r.data),

    autocomplete: (q: string) =>
        productClient.get<{ suggestions: string[] }>('/search/autocomplete', { params: { q } }).then(r => r.data),

    // AI-powered smart search
    parseSearchIntent: (query: string) =>
        aiClient.post<{
            search_terms: string
            filters: { category?: string; min_price?: number; max_price?: number; color?: string; brand?: string }
            intent: string
            rewritten_query: string
            original_query: string
        }>('/search/parse-intent', { query }).then(r => r.data),

    // Deals
    listDeals: (params?: Record<string, unknown>) =>
        productClient.get<Deal[]>('/deals', { params }).then(r => r.data),

    createDeal: (data: object) => productClient.post<Deal>('/deals', data).then(r => r.data),
    updateDeal: (id: string, data: object) => productClient.patch<Deal>(`/deals/${id}`, data).then(r => r.data),
    deleteDeal: (id: string) => productClient.delete(`/deals/${id}`),

    // Reviews
    listReviews: (params?: Record<string, unknown>) =>
        productClient.get<{ items: Review[]; total: number; page: number; size: number }>('/reviews', { params }).then(r => r.data),

    createReview: (data: object) => productClient.post<Review>('/reviews', data).then(r => r.data),

    updateReview: (reviewId: string, data: { rating?: number; review_text?: string }) =>
        productClient.patch<Review>(`/reviews/${reviewId}`, data).then(r => r.data),

    deleteOwnReview: (reviewId: string) => productClient.delete(`/reviews/${reviewId}`),

    replyToReview: (reviewId: string, payload: string | { reply_text: string }) =>
        productClient.post(`/reviews/${reviewId}/reply`, typeof payload === 'string' ? { reply_text: payload } : payload).then(r => r.data),

    listAllReviews: (params?: Record<string, unknown>) =>
        productClient.get<{ items: Review[]; total: number; page: number; size: number }>('/reviews', { params }).then(r => r.data),

    editReply: (reviewId: string, reply_text: string) =>
        productClient.patch(`/reviews/${reviewId}/reply`, { reply_text }).then(r => r.data),

    retractReply: (reviewId: string) => productClient.delete(`/reviews/${reviewId}/reply`),

    deleteReview: (reviewId: string) => productClient.delete(`/reviews/${reviewId}`),

    // Events
    listEvents: (params?: Record<string, unknown>) =>
        productClient.get<import('../types').Event[]>('/events', { params }).then(r => r.data),
    createEvent: (formData: FormData) =>
        productClient.post<import('../types').Event>('/events', formData).then(r => r.data),
    updateEvent: (id: string, formData: FormData) =>
        productClient.patch<import('../types').Event>(`/events/${id}`, formData).then(r => r.data),
    deleteEvent: (id: string) => productClient.delete(`/events/${id}`),

    // Variants
    listVariants: (productId: string) =>
        productClient.get<ProductVariant[]>(`/products/${productId}/variants`).then(r => r.data),
    createVariant: (productId: string, data: object) =>
        productClient.post<ProductVariant>(`/products/${productId}/variants`, data).then(r => r.data),
    updateVariant: (productId: string, variantId: string, data: object) =>
        productClient.patch<ProductVariant>(`/products/${productId}/variants/${variantId}`, data).then(r => r.data),
    deleteVariant: (productId: string, variantId: string) =>
        productClient.delete(`/products/${productId}/variants/${variantId}`),
}
