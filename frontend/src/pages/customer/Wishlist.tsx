import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { cartService } from '../../services/cart'
import { useCartStore } from '../../store/cartStore'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import { AnimatedPage, FadeInView } from '../../components/common/AnimatedPage'
import { useAuthStore } from '../../store/authStore'

export default function Wishlist() {
    const { user } = useAuthStore()
    const { setCart } = useCartStore()
    const qc = useQueryClient()

    const { data: items, isLoading } = useQuery({
        queryKey: ['saved-items'],
        queryFn: cartService.getSavedItems,
        enabled: !!user,
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
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Could not move to cart'),
    })

    const removeMutation = useMutation({
        mutationFn: (productId: string) => cartService.removeSavedItem(productId),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: ['saved-items'] })
            toast.success('Removed from wishlist')
        },
    })

    if (!user) {
        return (
            <AnimatedPage>
                <div className="text-center py-24">
                    <div className="w-20 h-20 bg-pink-50 dark:bg-pink-900/20 rounded-3xl flex items-center justify-center mx-auto mb-6">
                        <svg className="w-10 h-10 text-pink-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Sign in to view your wishlist</h2>
                    <p className="text-gray-500 dark:text-gray-400 mb-8">Save items you love and buy them later</p>
                    <Link to="/login" className="btn-primary">Sign In</Link>
                </div>
            </AnimatedPage>
        )
    }

    if (isLoading) return <LoadingSpinner />

    return (
        <AnimatedPage>
            <div className="max-w-4xl mx-auto space-y-8">
                {/* Header */}
                <FadeInView>
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                                <span className="w-10 h-10 bg-pink-50 dark:bg-pink-900/20 rounded-2xl flex items-center justify-center">
                                    <svg className="w-5 h-5 text-pink-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
                                </span>
                                Wishlist
                            </h1>
                            {items && items.length > 0 && (
                                <p className="text-gray-500 dark:text-gray-400 mt-1">{items.length} saved item{items.length !== 1 ? 's' : ''}</p>
                            )}
                        </div>
                        <Link to="/products" className="btn-secondary text-sm flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"/></svg>
                            Add More
                        </Link>
                    </div>
                </FadeInView>

                {!items || items.length === 0 ? (
                    <div className="text-center py-24">
                        <div className="w-20 h-20 bg-pink-50 dark:bg-pink-900/20 rounded-3xl flex items-center justify-center mx-auto mb-6">
                            <svg className="w-10 h-10 text-pink-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
                        </div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Your wishlist is empty</h2>
                        <p className="text-gray-500 dark:text-gray-400 mb-8">
                            Save items from your cart using "Save for Later", or browse products to find something you love.
                        </p>
                        <div className="flex items-center justify-center gap-3">
                            <Link to="/products" className="btn-primary">Browse Products</Link>
                            <Link to="/cart" className="btn-secondary">Go to Cart</Link>
                        </div>
                    </div>
                ) : (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        <AnimatePresence>
                            {items.map((item, i) => {
                                const isOutOfStock = item.stock_status === 'out_of_stock'
                                const priceDiff = Number(item.current_price) - Number(item.price_snapshot)
                                const priceChanged = Math.abs(priceDiff) > 0.01

                                return (
                                    <motion.div
                                        key={item.product_id}
                                        initial={{ opacity: 0, y: 16 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        transition={{ delay: i * 0.05 }}
                                        className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden hover:shadow-md transition-shadow"
                                    >
                                        {/* Product image */}
                                        <Link to={`/products/${item.product_id}`} className="block relative">
                                            <div className="aspect-square bg-gray-50 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
                                                {item.image_url ? (
                                                    <img src={item.image_url} alt={item.product_name} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
                                                ) : (
                                                    <svg className="w-12 h-12 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
                                                )}
                                            </div>
                                            {isOutOfStock && (
                                                <div className="absolute inset-0 bg-white/70 dark:bg-gray-900/70 flex items-center justify-center">
                                                    <span className="text-sm font-semibold text-gray-600 dark:text-gray-300 bg-white/90 dark:bg-gray-800/90 px-3 py-1.5 rounded-xl">Out of Stock</span>
                                                </div>
                                            )}
                                        </Link>

                                        {/* Info */}
                                        <div className="p-4 space-y-3">
                                            <Link to={`/products/${item.product_id}`}>
                                                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 line-clamp-2 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">{item.product_name}</h3>
                                            </Link>

                                            <div>
                                                <p className="text-lg font-bold text-gray-900 dark:text-white">₹{Number(item.current_price).toLocaleString('en-IN')}</p>
                                                {priceChanged && (
                                                    <p className={`text-xs font-medium flex items-center gap-1 mt-0.5 ${priceDiff > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                                                        {priceDiff > 0 ? (
                                                            <>
                                                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
                                                                Price went up from ₹{Number(item.price_snapshot).toLocaleString('en-IN')}
                                                            </>
                                                        ) : (
                                                            <>
                                                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd"/></svg>
                                                                Price dropped from ₹{Number(item.price_snapshot).toLocaleString('en-IN')}
                                                            </>
                                                        )}
                                                    </p>
                                                )}
                                                {item.stock_status === 'low_stock' && (
                                                    <p className="text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1 mt-0.5">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                                        Only a few left
                                                    </p>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-2 pt-1">
                                                <button
                                                    onClick={() => moveToCartMutation.mutate(item.product_id)}
                                                    disabled={moveToCartMutation.isPending || isOutOfStock}
                                                    className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white text-sm font-semibold py-2 rounded-xl transition-colors flex items-center justify-center gap-1.5"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                                                    Move to Cart
                                                </button>
                                                <button
                                                    onClick={() => removeMutation.mutate(item.product_id)}
                                                    disabled={removeMutation.isPending}
                                                    className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-xl transition-all"
                                                    title="Remove from wishlist"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                )
                            })}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </AnimatedPage>
    )
}
