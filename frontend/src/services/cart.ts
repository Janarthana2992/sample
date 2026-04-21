import { cartClient } from './api'
import type { Cart } from '../types'

export const cartService = {
    getCart: () => cartClient.get<Cart>('/cart').then(r => r.data),

    addToCart: (product_id: string, quantity: number) =>
        cartClient.post('/cart/add', { product_id, quantity }).then(r => r.data),

    updateItem: (product_id: string, quantity: number) =>
        cartClient.patch(`/cart/${product_id}`, { quantity }).then(r => r.data),

    removeItem: (product_id: string) => cartClient.delete(`/cart/${product_id}`),

    clearCart: () => cartClient.delete('/cart'),

    // Save for Later
    saveForLater: (product_id: string) =>
        cartClient.post(`/cart/save-for-later/${product_id}`).then(r => r.data),

    moveToCart: (product_id: string) =>
        cartClient.post(`/cart/move-to-cart/${product_id}`).then(r => r.data),

    getSavedItems: () =>
        cartClient.get<SavedItem[]>('/cart/saved').then(r => r.data),

    removeSavedItem: (product_id: string) =>
        cartClient.delete(`/cart/saved/${product_id}`),
}

export interface SavedItem {
    product_id: string
    product_name: string
    price_snapshot: string
    current_price: string
    image_url?: string
    stock_status: string
    added_at: string
}
