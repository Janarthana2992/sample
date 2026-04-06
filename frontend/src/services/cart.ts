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
}
