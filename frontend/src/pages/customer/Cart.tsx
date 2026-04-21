import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { cartService } from '../../services/cart'
import type { SavedItem } from '../../services/cart'
import { useCartStore } from '../../store/cartStore'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import { AnimatedPage, FadeInView } from '../../components/common/AnimatedPage'
import { aiClient } from '../../services/api'

export default function Cart() {
    const { setCart } = useCartStore()
    const qc = useQueryClient()
    const navigate = useNavigate()

    const { data: cart, isLoading } = useQuery({
        queryKey: ['cart'],
        queryFn: cartService.getCart,
    })

    const { data: savedItems } = useQuery({
        queryKey: ['saved-items'],
        queryFn: cartService.getSavedItems,
    })

    const removeMutation = useMutation({
        mutationFn: (productId: string) => cartService.removeItem(productId),
        onSuccess: async () => {
            const updated = await cartService.getCart()
            setCart(updated)
            await qc.invalidateQueries({ queryKey: ['cart'] })
            toast.success('Item removed')
        },
    })

    const updateMutation = useMutation({
        mutationFn: ({ productId, qty }: { productId: string; qty: number }) =>
            cartService.updateItem(productId, qty),
        onSuccess: async () => {
            const updated = await cartService.getCart()
            setCart(updated)
            await qc.invalidateQueries({ queryKey: ['cart'] })
        },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update'),
    })

    const saveForLaterMutation = useMutation({
        mutationFn: (productId: string) => cartService.saveForLater(productId),
        onSuccess: async () => {
            const updated = await cartService.getCart()
            setCart(updated)
            await qc.invalidateQueries({ queryKey: ['cart'] })
            await qc.invalidateQueries({ queryKey: ['saved-items'] })
            toast.success('Saved for later')
        },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to save'),
    })

    const moveToCartMutation = useMutation({
        mutationFn: (productId: string) => cartService.moveToCart(productId),
        onSuccess: async () => {
            const updated = await cartService.getCart()
            setCart(updated)
            await qc.invalidateQueries({ queryKey: ['cart'] })
            await qc.invalidateQueries({ queryKey: ['saved-items'] })
            toast.success('Moved to cart')
        },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to move to cart'),
    })

    const removeSavedMutation = useMutation({
        mutationFn: (productId: string) => cartService.removeSavedItem(productId),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: ['saved-items'] })
            toast.success('Removed from saved items')
        },
    })

    if (isLoading) return <LoadingSpinner />

    const cartProductIds = cart?.items.map(i => i.product_id) ?? []

    return <CartContent
        cart={cart}
        cartProductIds={cartProductIds}
        removeMutation={removeMutation}
        updateMutation={updateMutation}
        saveForLaterMutation={saveForLaterMutation}
        moveToCartMutation={moveToCartMutation}
        removeSavedMutation={removeSavedMutation}
        savedItems={savedItems ?? []}
        navigate={navigate}
    />
}

function CartContent({ cart, cartProductIds, removeMutation, updateMutation, saveForLaterMutation, moveToCartMutation, removeSavedMutation, savedItems, navigate }: {
    cart: import('../../types').Cart | undefined
    cartProductIds: string[]
    removeMutation: any
    updateMutation: any
    saveForLaterMutation: any
    moveToCartMutation: any
    removeSavedMutation: any
    savedItems: SavedItem[]
    navigate: any
}) {
    const { data: cartRecs } = useQuery({
        queryKey: ['cart-recs', ...cartProductIds],
        queryFn: async () => {
            if (cartProductIds.length === 0) return []
            const r = await aiClient.get('/recommend/interest', {
                params: { product_ids: cartProductIds.join(','), top_n: 6 },
            })
            return (r.data.items || []).filter((i: any) => !cartProductIds.includes(i.product_id))
        },
        enabled: cartProductIds.length > 0,
        staleTime: 60_000,
    })

    if (!cart || cart.items.length === 0) {
        return (
            <AnimatedPage>
                <div className="text-center py-24">
                    <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-3xl flex items-center justify-center mx-auto mb-6">
                        <svg className="w-10 h-10 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Your cart is empty</h2>
                    <p className="text-gray-500 dark:text-gray-400 mb-8">Add some products to get started</p>
                    <Link to="/products" className="btn-primary">Browse Products</Link>
                </div>
            </AnimatedPage>
        )
    }

    return (
        <AnimatedPage>
            <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                    <h1 className="section-title">Shopping Cart <span className="text-gray-400 dark:text-gray-500 font-normal text-lg">({cart.item_count})</span></h1>

                    {cart.items.map((item, i) => (
                        <motion.div
                            key={item.product_id}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="card flex flex-col gap-3"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-20 h-20 bg-gray-50 dark:bg-gray-800 rounded-xl flex items-center justify-center shrink-0 overflow-hidden">
                                    {item.image_url ? <img src={item.image_url} alt={item.product_name} className="w-full h-full object-cover rounded-xl" /> : <svg className="w-8 h-8 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-medium text-gray-900 dark:text-white truncate">{item.product_name}</h3>
                                    <p className="text-sm font-bold text-gray-800 dark:text-gray-200 mt-1">₹{item.current_price.toLocaleString('en-IN')}</p>
                                    {item.price_stale && (
                                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 flex items-center gap-1">
                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                            Price changed
                                        </p>
                                    )}
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden">
                                        <button
                                            onClick={() => updateMutation.mutate({ productId: item.product_id, qty: item.quantity - 1 })}
                                            disabled={item.quantity <= 1 || updateMutation.isPending}
                                            className="px-3 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 text-sm transition-colors"
                                        >−</button>
                                        <span className="px-3 py-2 text-sm font-semibold text-gray-900 dark:text-white min-w-[2rem] text-center">{item.quantity}</span>
                                        <button
                                            onClick={() => updateMutation.mutate({ productId: item.product_id, qty: item.quantity + 1 })}
                                            disabled={updateMutation.isPending}
                                            className="px-3 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm transition-colors"
                                        >+</button>
                                    </div>
                                    <button
                                        onClick={() => removeMutation.mutate(item.product_id)}
                                        disabled={removeMutation.isPending}
                                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-xl transition-all duration-200"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 border-t border-gray-100 dark:border-gray-800 pt-3">
                                <button
                                    onClick={() => saveForLaterMutation.mutate(item.product_id)}
                                    disabled={saveForLaterMutation.isPending}
                                    className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium flex items-center gap-1 transition-colors"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                                    Save for Later
                                </button>
                                <span className="text-gray-300 dark:text-gray-600">|</span>
                                <button
                                    onClick={() => navigate(`/checkout?buyNow=${item.product_id}`)}
                                    className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium flex items-center gap-1 transition-colors"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                    Buy Only This
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Summary */}
                <div>
                    <div className="card sticky top-24 space-y-5">
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Order Summary</h2>
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between text-gray-500 dark:text-gray-400">
                                <span>Subtotal ({cart.item_count} items)</span>
                                <span className="font-medium text-gray-700 dark:text-gray-300">₹{cart.subtotal.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between text-gray-500 dark:text-gray-400">
                                <span>Shipping</span>
                                <span className="font-semibold text-emerald-600 dark:text-emerald-400">Free</span>
                            </div>
                            <div className="border-t border-gray-100 dark:border-gray-800 pt-3 flex justify-between font-bold text-gray-900 dark:text-white text-base">
                                <span>Total</span>
                                <span>₹{cart.subtotal.toLocaleString('en-IN')}</span>
                            </div>
                        </div>
                        <Link to="/checkout" className="btn-primary w-full text-center block">
                            Proceed to Checkout
                        </Link>
                        <Link to="/products" className="btn-ghost w-full text-center block text-sm">
                            Continue Shopping
                        </Link>
                    </div>
                </div>

                {/* Saved for Later */}
                {savedItems.length > 0 && (
                    <FadeInView className="lg:col-span-3">
                        <h2 className="section-title mb-4">Saved for Later ({savedItems.length})</h2>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {savedItems.map((item) => (
                                <motion.div
                                    key={item.product_id}
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="card flex items-center gap-4"
                                >
                                    <div className="w-16 h-16 bg-gray-50 dark:bg-gray-800 rounded-xl flex items-center justify-center shrink-0 overflow-hidden">
                                        {item.image_url ? <img src={item.image_url} alt={item.product_name} className="w-full h-full object-cover rounded-xl" /> : <svg className="w-6 h-6 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.product_name}</h3>
                                        <p className="text-sm font-bold text-gray-800 dark:text-gray-200 mt-0.5">₹{Number(item.current_price).toLocaleString('en-IN')}</p>
                                        {item.stock_status === 'out_of_stock' && (
                                            <p className="text-xs text-red-500 mt-0.5">Out of stock</p>
                                        )}
                                    </div>
                                    <div className="flex flex-col gap-1.5 shrink-0">
                                        <button
                                            onClick={() => moveToCartMutation.mutate(item.product_id)}
                                            disabled={moveToCartMutation.isPending || item.stock_status === 'out_of_stock'}
                                            className="text-xs bg-primary-600 hover:bg-primary-700 text-white px-3 py-1.5 rounded-lg font-medium disabled:opacity-40 transition-colors"
                                        >
                                            Move to Cart
                                        </button>
                                        <button
                                            onClick={() => removeSavedMutation.mutate(item.product_id)}
                                            disabled={removeSavedMutation.isPending}
                                            className="text-xs text-gray-400 hover:text-red-500 font-medium transition-colors"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </FadeInView>
                )}

                {/* You might also like */}
                {cartRecs && cartRecs.length > 0 && (
                    <FadeInView className="lg:col-span-3">
                        <h2 className="section-title mb-4">You Might Also Like</h2>
                        <div className="flex gap-4 overflow-x-auto pb-3 -mx-1 px-1 snap-x">
                            {cartRecs.map((rec: any) => (
                                <Link
                                    key={rec.product_id}
                                    to={`/products/${rec.product_id}`}
                                    className="shrink-0 w-40 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 hover:shadow-card-hover transition-all duration-300 overflow-hidden snap-start group"
                                >
                                    <div className="w-full aspect-square bg-gray-50 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
                                        {rec.image_url
                                            ? <img src={rec.image_url} alt={rec.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                            : <svg className="w-8 h-8 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                                        }
                                    </div>
                                    <div className="p-3">
                                        <p className="text-xs font-medium text-gray-800 dark:text-gray-200 line-clamp-2 leading-snug mb-1.5 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{rec.name || 'View Product'}</p>
                                        {rec.selling_price && (
                                            <div className="flex items-baseline gap-1.5">
                                                <span className="text-sm font-bold text-gray-900 dark:text-white">₹{Number(rec.selling_price).toLocaleString('en-IN')}</span>
                                                {rec.mrp && rec.mrp > rec.selling_price && (
                                                    <span className="text-[11px] text-gray-400 line-through">₹{Number(rec.mrp).toLocaleString('en-IN')}</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </FadeInView>
                )}
            </div>
        </AnimatedPage>
    )
}
