import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { productService } from '../../services/products'
import { cartService } from '../../services/cart'
import { orderService } from '../../services/orders'
import { useCartStore } from '../../store/cartStore'
import { useAuthStore } from '../../store/authStore'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import { ProductCard } from '../../components/common/ProductCard'
import { StarRating } from '../../components/common/StarRating'
import { AnimatedPage, FadeInView } from '../../components/common/AnimatedPage'
import { aiClient } from '../../services/api'

/** Strip localhost origin from image URLs so they work via Nginx in production */
function normalizeImageUrl(url: string | undefined): string | undefined {
    if (!url) return undefined
    try {
        const p = new URL(url)
        if (p.hostname === 'localhost' || p.hostname === '127.0.0.1') return p.pathname + p.search
    } catch { /* relative — fine */ }
    return url
}

// ── View tracking helpers ────────────────────────────────────
const VIEWED_KEY = 'sp_viewed_products'
const MAX_VIEWED = 12

export function trackProductView(productId: string) {
    try {
        const raw = localStorage.getItem(VIEWED_KEY)
        const viewed: string[] = raw ? JSON.parse(raw) : []
        const updated = [productId, ...viewed.filter(id => id !== productId)].slice(0, MAX_VIEWED)
        localStorage.setItem(VIEWED_KEY, JSON.stringify(updated))
    } catch { /* ignore */ }
}

export function getViewedProducts(): string[] {
    try {
        const raw = localStorage.getItem(VIEWED_KEY)
        return raw ? JSON.parse(raw) : []
    } catch { return [] }
}

type SimilarProduct = {
    product_id: string
    score: number
    name?: string
    mrp?: number
    selling_price?: number
    image_url?: string
    stock_status?: 'in_stock' | 'low_stock' | 'out_of_stock'
}

export default function ProductDetail() {
    const { id } = useParams<{ id: string }>()
    const { isAuthenticated } = useAuthStore()
    const { setCart } = useCartStore()
    const qc = useQueryClient()
    const [selectedImage, setSelectedImage] = useState(0)
    const [quantity, setQuantity] = useState(1)
    const [reviewRating, setReviewRating] = useState(0)
    const [reviewText, setReviewText] = useState('')
    const [editReview, setEditReview] = useState<{ review_id: string; rating: number; review_text: string } | null>(null)

    const { data: product, isLoading } = useQuery({
        queryKey: ['product', id],
        queryFn: () => productService.get(id!),
        enabled: !!id,
    })

    // Track this product view whenever the product loads
    useEffect(() => {
        if (id && product) {
            trackProductView(id)
            // Invalidate recommendations on home page so they refresh next visit
            qc.invalidateQueries({ queryKey: ['recommendations'] })
        }
    }, [id, product, qc])

    const { data: reviews } = useQuery({
        queryKey: ['reviews', id],
        queryFn: () => productService.listReviews({ product_id: id, size: 10 }),
    })

    const { data: similar, isLoading: similarLoading } = useQuery<{ items: SimilarProduct[] }>({
        queryKey: ['similar', id],
        queryFn: async (): Promise<{ items: SimilarProduct[] }> => {
            const response = await aiClient.get(`/recommend/similar/${id}`)
            return response.data
        },
        enabled: !!id,
    })

    const { data: boughtTogether } = useQuery<{ items: SimilarProduct[] }>({
        queryKey: ['bought-together', id],
        queryFn: async (): Promise<{ items: SimilarProduct[] }> => {
            const response = await aiClient.get(`/recommend/frequently-bought-together/${id}`, { params: { top_n: 4 } })
            return response.data
        },
        enabled: !!id,
    })

    const addMutation = useMutation({
        mutationFn: () => cartService.addToCart(id!, quantity),
        onSuccess: async () => {
            const cart = await cartService.getCart()
            setCart(cart)
            toast.success('Added to cart!')
        },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to add'),
    })

    const { data: savedItems } = useQuery({
        queryKey: ['saved-items'],
        queryFn: cartService.getSavedItems,
        enabled: !!isAuthenticated,
        staleTime: 60_000,
    })

    const isSaved = savedItems?.some((item: any) => item.product_id === id) ?? false

    const saveMutation = useMutation({
        mutationFn: () => cartService.saveForLater(id!),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['saved-items'] }); toast.success('Added to wishlist') },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Could not add to wishlist'),
    })

    const removeSavedMutation = useMutation({
        mutationFn: () => cartService.removeSavedItem(id!),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['saved-items'] }); toast.success('Removed from wishlist') },
        onError: () => toast.error('Could not remove from wishlist'),
    })

    // Fetch user's orders to find one eligible for review
    const { data: ordersData } = useQuery({
        queryKey: ['my-orders-for-review', id],
        queryFn: () => orderService.listOrders({ size: 100 }),
        enabled: !!id && isAuthenticated,
        staleTime: 0,
        refetchOnWindowFocus: true,
    })

    const eligibleOrder = ordersData?.items.find(order =>
        order.status === 'delivered' &&
        order.items.some(item => item.product_id === id)
    )

    const { user } = useAuthStore()
    const alreadyReviewed = reviews?.items.some(r => r.user_id === user?.user_id)

    const reviewMutation = useMutation({
        mutationFn: (data: { product_id: string; order_id: string; rating: number; review_text?: string }) =>
            productService.createReview(data),
        onSuccess: async () => {
            toast.success('Review submitted!')
            setReviewRating(0)
            setReviewText('')
            await qc.invalidateQueries({ queryKey: ['reviews', id] })
            await qc.invalidateQueries({ queryKey: ['my-orders-for-review', id] })
            await qc.invalidateQueries({ queryKey: ['admin', 'reviews'] })
        },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to submit review'),
    })

    const updateReviewMutation = useMutation({
        mutationFn: (data: { rating: number; review_text: string }) =>
            productService.updateReview(editReview!.review_id, data),
        onSuccess: async () => {
            toast.success('Review updated!')
            setEditReview(null)
            await qc.invalidateQueries({ queryKey: ['reviews', id] })
            await qc.invalidateQueries({ queryKey: ['admin', 'reviews'] })
        },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update review'),
    })

    const deleteReviewMutation = useMutation({
        mutationFn: (reviewId: string) => productService.deleteOwnReview(reviewId),
        onSuccess: async () => {
            toast.success('Review deleted')
            await qc.invalidateQueries({ queryKey: ['reviews', id] })
            await qc.invalidateQueries({ queryKey: ['my-orders-for-review', id] })
            await qc.invalidateQueries({ queryKey: ['admin', 'reviews'] })
        },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to delete review'),
    })

    if (isLoading) return <LoadingSpinner />
    if (!product) return (
        <div className="text-center py-20">
            <svg className="mx-auto h-16 w-16 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
            <p className="mt-4 text-lg font-semibold text-surface-700 dark:text-surface-300">Product not found</p>
            <Link to="/products" className="mt-4 inline-block btn-primary">Browse Products</Link>
        </div>
    )

    const discount = product.mrp > product.selling_price
        ? Math.round(((product.mrp - product.selling_price) / product.mrp) * 100)
        : 0

    const isOutOfStock = product.stock_status === 'out_of_stock'
    const similarItems: Array<{
        product_id: string
        name: string
        mrp: number
        selling_price: number
        stock_status: 'in_stock' | 'low_stock' | 'out_of_stock'
        image_url?: string
        score: number
    }> = (similar?.items ?? [])
        .filter((item: SimilarProduct) => item.product_id !== id)
        .map((item: SimilarProduct) => ({
            product_id: item.product_id,
            name: item.name || 'Recommended Product',
            mrp: item.mrp ?? item.selling_price ?? 0,
            selling_price: item.selling_price ?? item.mrp ?? 0,
            stock_status: item.stock_status ?? 'in_stock',
            image_url: item.image_url,
            score: item.score,
        }))

    return (
        <AnimatedPage>
            <div className="space-y-10">
                {/* Breadcrumb */}
                <nav className="flex items-center gap-2 text-sm text-surface-500 dark:text-surface-400">
                    <Link to="/" className="hover:text-primary-600 transition-colors">Home</Link>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    <Link to="/products" className="hover:text-primary-600 transition-colors">Products</Link>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    <span className="text-surface-900 dark:text-white font-medium truncate max-w-[200px]">{product.name}</span>
                </nav>

                {/* Product */}
                <div className="grid md:grid-cols-2 gap-10">
                    {/* Images */}
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }} className="space-y-4">
                        <div className="aspect-square rounded-2xl overflow-hidden bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 shadow-card">
                            <AnimatePresence mode="wait">
                                {product.images[selectedImage] ? (
                                    <motion.img key={selectedImage} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} src={normalizeImageUrl(product.images[selectedImage].url)} alt={product.name} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <svg className="w-24 h-24 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                                    </div>
                                )}
                            </AnimatePresence>
                        </div>
                        {product.images.length > 1 && (
                            <div className="flex gap-3 overflow-x-auto pb-1">
                                {product.images.map((img, i) => (
                                    <button
                                        key={img.image_id}
                                        onClick={() => setSelectedImage(i)}
                                        className={`shrink-0 w-18 h-18 rounded-xl overflow-hidden border-2 transition-all duration-200 ${selectedImage === i ? 'border-primary-500 ring-2 ring-primary-500/20 scale-105' : 'border-surface-200 dark:border-surface-700 hover:border-primary-300'}`}
                                    >
                                        <img src={normalizeImageUrl(img.url)} alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} className="w-full h-full object-cover" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </motion.div>

                    {/* Info */}
                    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.1 }} className="space-y-5">
                        <div>
                            <h1 className="text-2xl lg:text-3xl font-bold text-surface-900 dark:text-white leading-tight">{product.name}</h1>
                            <p className="text-sm text-surface-400 font-mono mt-1">SKU: {product.sku}</p>
                        </div>

                        <div className="flex items-baseline gap-3">
                            <span className="text-3xl lg:text-4xl font-extrabold text-surface-900 dark:text-white">
                                ₹{product.selling_price.toLocaleString('en-IN')}
                            </span>
                            {discount > 0 && (
                                <>
                                    <span className="text-lg text-surface-400 line-through">₹{product.mrp.toLocaleString('en-IN')}</span>
                                    <span className="badge-danger">{discount}% off</span>
                                </>
                            )}
                        </div>

                        <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${product.stock_status === 'in_stock' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                product.stock_status === 'low_stock' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                                    'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            }`}>
                            {product.stock_status === 'in_stock' ? (
                                <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>In Stock</>
                            ) : product.stock_status === 'low_stock' ? (
                                <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>Low Stock ({product.stock_quantity} left)</>
                            ) : (
                                <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>Out of Stock</>
                            )}
                        </div>

                        {!isOutOfStock && (
                            <div className="flex items-center gap-4">
                                <div className="flex items-center border border-surface-200 dark:border-surface-700 rounded-xl bg-surface-50 dark:bg-surface-800">
                                    <button
                                        onClick={() => setQuantity(q => Math.max(1, q - 1))}
                                        className="px-3.5 py-2.5 text-surface-500 hover:text-surface-900 dark:hover:text-white hover:bg-surface-100 dark:hover:bg-surface-700 rounded-l-xl transition-colors"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
                                    </button>
                                    <span className="px-5 py-2.5 text-sm font-bold text-surface-900 dark:text-white min-w-[3rem] text-center">{quantity}</span>
                                    <button
                                        onClick={() => setQuantity(q => Math.min(product.stock_quantity, q + 1))}
                                        className="px-3.5 py-2.5 text-surface-500 hover:text-surface-900 dark:hover:text-white hover:bg-surface-100 dark:hover:bg-surface-700 rounded-r-xl transition-colors"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                    </button>
                                </div>
                                {isAuthenticated ? (
                                    <button
                                        onClick={() => addMutation.mutate()}
                                        disabled={addMutation.isPending}
                                        className="btn-primary flex-1 flex items-center justify-center gap-2"
                                    >
                                        {addMutation.isPending ? (
                                            <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Adding...</>
                                        ) : (
                                            <><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" /></svg>Add to Cart</>
                                        )}
                                    </button>
                                ) : (
                                    <Link to="/login" className="btn-primary flex-1 text-center">Login to Buy</Link>
                                )}
                                {/* Wishlist button */}
                                <button
                                    onClick={() => {
                                        if (!isAuthenticated) { window.location.href = '/login'; return }
                                        if (isSaved) removeSavedMutation.mutate()
                                        else saveMutation.mutate()
                                    }}
                                    disabled={saveMutation.isPending || removeSavedMutation.isPending}
                                    aria-label={isSaved ? 'Remove from wishlist' : 'Add to wishlist'}
                                    className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center transition-all duration-200 hover:scale-105 shrink-0 disabled:opacity-60
                                    ${isSaved
                                            ? 'border-pink-400 bg-pink-50 dark:bg-pink-900/30'
                                            : 'border-surface-200 dark:border-surface-700 hover:border-pink-300 bg-surface-50 dark:bg-surface-800'
                                        }`}
                                >
                                    <svg
                                        style={{ width: 22, height: 22 }}
                                        className={`transition-all duration-200 ${isSaved ? 'fill-pink-500 text-pink-500 scale-110' : 'fill-transparent text-surface-400 dark:text-surface-500 hover:text-pink-400'}`}
                                        stroke="currentColor"
                                        strokeWidth={2}
                                        viewBox="0 0 24 24"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                    </svg>
                                </button>
                            </div>
                        )}

                        {/* Wishlist for out-of-stock products */}
                        {isOutOfStock && (
                            <button
                                onClick={() => {
                                    if (!isAuthenticated) { window.location.href = '/login'; return }
                                    if (isSaved) removeSavedMutation.mutate()
                                    else saveMutation.mutate()
                                }}
                                disabled={saveMutation.isPending || removeSavedMutation.isPending}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all duration-200 disabled:opacity-60
                                ${isSaved
                                        ? 'border-pink-400 bg-pink-50 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400'
                                        : 'border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-400 hover:border-pink-300 hover:text-pink-500'
                                    }`}
                            >
                                <svg style={{ width: 18, height: 18 }} className={isSaved ? 'fill-pink-500 text-pink-500' : 'fill-transparent'} stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                </svg>
                                {isSaved ? 'Wishlisted' : 'Wishlist — Notify me'}
                            </button>
                        )}

                        {product.tags && product.tags.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-2">
                                {product.tags.map(tag => (
                                    <Link key={tag} to={`/products?search=${tag}`} className="px-3 py-1 rounded-full text-xs font-medium bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400 hover:bg-primary-50 hover:text-primary-600 dark:hover:bg-primary-900/30 transition-colors">#{tag}</Link>
                                ))}
                            </div>
                        )}
                    </motion.div>
                </div>

                {/* Description */}
                <FadeInView>
                    <div className="card">
                        <h2 className="text-lg font-bold text-surface-900 dark:text-white mb-4">Description</h2>
                        <div className="prose prose-sm text-surface-600 dark:text-surface-400 max-w-none whitespace-pre-wrap">{product.description}</div>
                    </div>
                </FadeInView>

                {/* Frequently Bought Together */}
                {boughtTogether && boughtTogether.items.filter(i => i.product_id !== id).length > 0 && (
                    <FadeInView>
                        <section>
                            <h2 className="section-title">Frequently Bought Together</h2>
                            <div className="flex gap-3 overflow-x-auto pb-2 items-start">
                                {/* Current product */}
                                <div className="shrink-0 w-36 rounded-2xl border-2 border-primary-500 overflow-hidden bg-white dark:bg-surface-800 shadow-card">
                                    <div className="w-full aspect-square bg-surface-100 dark:bg-surface-700 flex items-center justify-center overflow-hidden">
                                        {product.images[0]
                                            ? <img src={normalizeImageUrl(product.images[0].url)} alt={product.name} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} className="w-full h-full object-cover" />
                                            : <svg className="w-10 h-10 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                                        }
                                    </div>
                                    <div className="p-2.5">
                                        <p className="text-xs font-semibold text-surface-800 dark:text-surface-200 line-clamp-2">{product.name}</p>
                                        <p className="text-xs font-bold text-surface-900 dark:text-white mt-1">₹{product.selling_price.toLocaleString('en-IN')}</p>
                                    </div>
                                </div>
                                {boughtTogether.items.filter(i => i.product_id !== id).map((item) => (
                                    <div key={item.product_id} className="flex items-start gap-3">
                                        <span className="text-surface-300 text-xl mt-12 shrink-0 font-bold">+</span>
                                        <Link to={`/products/${item.product_id}`} className="shrink-0 w-36 rounded-2xl border border-surface-200 dark:border-surface-700 hover:shadow-card-hover transition-all overflow-hidden bg-white dark:bg-surface-800">
                                            <div className="w-full aspect-square bg-surface-100 dark:bg-surface-700 flex items-center justify-center overflow-hidden">
                                                {item.image_url
                                                    ? <img src={normalizeImageUrl(item.image_url)} alt={item.name} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} className="w-full h-full object-cover" />
                                                    : <svg className="w-10 h-10 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                                                }
                                            </div>
                                            <div className="p-2.5">
                                                <p className="text-xs font-semibold text-surface-800 dark:text-surface-200 line-clamp-2">{item.name || 'View Product'}</p>
                                                {item.selling_price && (
                                                    <p className="text-xs font-bold text-surface-900 dark:text-white mt-1">₹{Number(item.selling_price).toLocaleString('en-IN')}</p>
                                                )}
                                            </div>
                                        </Link>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </FadeInView>
                )}

                {(similarLoading || similarItems.length > 0) && (
                    <FadeInView>
                        <section>
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h2 className="section-title">Similar Products</h2>
                                    <p className="section-subtitle">More products related to this item</p>
                                </div>
                                <Link to="/products" className="text-primary-600 text-sm font-medium hover:text-primary-700 transition-colors flex items-center gap-1">Browse all <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></Link>
                            </div>
                            {similarLoading ? (
                                <LoadingSpinner />
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                                    {similarItems.map(item => <ProductCard key={item.product_id} product={item} />)}
                                </div>
                            )}
                        </section>
                    </FadeInView>
                )}

                {/* Reviews */}
                <FadeInView>
                    <div className="card">
                        <h2 className="text-lg font-bold text-surface-900 dark:text-white mb-4">Customer Reviews ({reviews?.total || 0})</h2>

                        {/* Write a review */}
                        {isAuthenticated && eligibleOrder && !alreadyReviewed && (
                            <div className="mb-6 p-5 bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 rounded-2xl">
                                <h3 className="font-semibold text-surface-900 dark:text-white mb-3">Write a Review</h3>
                                {/* Star picker */}
                                <div className="flex items-center gap-1 mb-3">
                                    {[1, 2, 3, 4, 5].map(star => (
                                        <button
                                            key={star}
                                            type="button"
                                            onClick={() => setReviewRating(star)}
                                            className={`text-2xl transition-transform hover:scale-110 ${star <= reviewRating ? 'text-yellow-400' : 'text-gray-300'}`}
                                        >
                                            ★
                                        </button>
                                    ))}
                                    {reviewRating > 0 && (
                                        <span className="text-sm text-gray-500 ml-2">{reviewRating}/5</span>
                                    )}
                                </div>
                                <textarea
                                    value={reviewText}
                                    onChange={e => setReviewText(e.target.value)}
                                    placeholder="Share your experience with this product... (optional)"
                                    rows={3}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                />
                                <button
                                    disabled={reviewRating === 0 || reviewMutation.isPending}
                                    onClick={() => reviewMutation.mutate({
                                        product_id: id!,
                                        order_id: eligibleOrder.order_id,
                                        rating: reviewRating,
                                        ...(reviewText.trim() ? { review_text: reviewText.trim() } : {}),
                                    })}
                                    className="mt-2 btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {reviewMutation.isPending ? 'Submitting...' : 'Submit Review'}
                                </button>
                            </div>
                        )}

                        {isAuthenticated && alreadyReviewed && (
                            <p className="mb-4 text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-2.5 rounded-xl flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                You have already reviewed this product.
                            </p>
                        )}

                        {isAuthenticated && !eligibleOrder && !alreadyReviewed && (
                            <p className="mb-4 text-sm text-surface-500 dark:text-surface-400 bg-surface-50 dark:bg-surface-800 px-4 py-2.5 rounded-xl">
                                Purchase and receive this product to leave a review.
                            </p>
                        )}

                        {reviews?.items.length === 0 ? (
                            <p className="text-gray-500 text-sm">No reviews yet. Be the first to review!</p>
                        ) : (
                            <div className="space-y-4">
                                {reviews?.items.map(review => (
                                    <div key={review.review_id} className="border-b border-gray-100 pb-4">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                    <StarRating rating={review.rating} size="sm" />
                                                    <span className="text-xs text-gray-400">{new Date(review.created_at).toLocaleDateString('en-IN')}</span>
                                                    <span className="badge bg-green-100 text-green-700 text-xs">✓ Verified Purchase</span>
                                                </div>
                                                {editReview?.review_id === review.review_id ? (
                                                    <div className="space-y-2 mt-2">
                                                        <div className="flex items-center gap-1">
                                                            {[1, 2, 3, 4, 5].map(star => (
                                                                <button key={star} type="button" onClick={() => setEditReview(r => r ? { ...r, rating: star } : r)}
                                                                    className={`text-xl transition-transform hover:scale-110 ${star <= editReview.rating ? 'text-yellow-400' : 'text-gray-300'}`}>★</button>
                                                            ))}
                                                        </div>
                                                        <textarea value={editReview.review_text} onChange={e => setEditReview(r => r ? { ...r, review_text: e.target.value } : r)}
                                                            rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                                                        <div className="flex gap-2">
                                                            <button onClick={() => updateReviewMutation.mutate({ rating: editReview.rating, review_text: editReview.review_text })}
                                                                disabled={updateReviewMutation.isPending} className="btn-primary text-sm py-1.5">
                                                                {updateReviewMutation.isPending ? 'Saving...' : 'Save'}
                                                            </button>
                                                            <button onClick={() => setEditReview(null)} className="btn-secondary text-sm py-1.5">Cancel</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    review.review_text && <p className="text-sm text-gray-700 mt-1">{review.review_text}</p>
                                                )}
                                            </div>
                                            {isAuthenticated && review.user_id === user?.user_id && editReview?.review_id !== review.review_id && (
                                                <div className="flex gap-2 shrink-0">
                                                    <button onClick={() => setEditReview({ review_id: review.review_id, rating: review.rating, review_text: review.review_text || '' })}
                                                        className="text-xs text-blue-600 hover:underline">Edit</button>
                                                    <button onClick={() => { if (confirm('Delete your review?')) deleteReviewMutation.mutate(review.review_id) }}
                                                        className="text-xs text-red-500 hover:underline">Delete</button>
                                                </div>
                                            )}
                                        </div>
                                        {review.reply && !review.reply.is_retracted && (
                                            <div className="mt-2 ml-4 bg-blue-50 border-l-2 border-blue-400 p-2 rounded">
                                                <p className="text-xs font-semibold text-blue-700 mb-1">Brand Reply</p>
                                                <p className="text-xs text-gray-700">{review.reply.reply_text}</p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </FadeInView>
            </div>
        </AnimatedPage>
    )
}
