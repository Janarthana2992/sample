import { create } from 'zustand'
import type { Cart } from '../types'

interface CartState {
    cart: Cart | null
    setCart: (cart: Cart) => void
    clearCart: () => void
    itemCount: number
}

export const useCartStore = create<CartState>((set, get) => ({
    cart: null,
    itemCount: 0,
    setCart: (cart) => set({ cart, itemCount: cart.item_count }),
    clearCart: () => set({ cart: null, itemCount: 0 }),
}))
