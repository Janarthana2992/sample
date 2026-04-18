import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { cartService } from '../../services/cart'
import { useAuthStore } from '../../store/authStore'
import type { Product } from '../../types'

/** Strip any absolute localhost/127.0.0.1 origin so images work in production via Nginx proxy */
function normalizeImageUrl(url: string | undefined): string | undefined {
    if (!url) return undefined
    try {
        const parsed = new URL(url)
        if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
            return parsed.pathname + parsed.search
        }
    } catch { /* relative URL — fine as-is */ }
    return url
}

interface Props {
    product: Product | { product_id: string; name: string; mrp: number; selling_price: number; stock_status: string; images?: { url: string }[]; image_url?: string; score?: number; promotion_badge?: string; is_featured?: boolean; is_promoted?: boolean; rating?: number; review_count?: number }
}

export function ProductCard({ product }: Props) {
    const navigate = useNavigate()
    const { user } = useAuthStore()
    const qc = useQueryClient()

    const { data: savedItems } = useQuery({
        queryKey: ['saved-items'],
        queryFn: cartService.getSavedItems,
        enabled: !!user,
        staleTime: 60_000,
    })

    const isSaved = savedItems?.some((item: any) => item.product_id === product.product_id) ?? false

    const saveMutation = useMutation({
        mutationFn: () => cartService.saveForLater(product.product_id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['saved-items'] }); toast.success('Added to wishlist') },
        onError: () => toast.error('Could not add to wishlist'),
    })

    const removeMutation = useMutation({
        mutationFn: () => cartService.removeSavedItem(product.product_id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['saved-items'] }); toast.success('Removed from wishlist') },
        onError: () => toast.error('Could not remove from wishlist'),
    })

    function handleWishlist(e: React.MouseEvent) {
        e.preventDefault()
        e.stopPropagation()
        if (!user) { navigate('/login'); return }
        if (isSaved) removeMutation.mutate()
        else saveMutation.mutate()
    }

    const isPending = saveMutation.isPending || removeMutation.isPending
    const discount = product.mrp > product.selling_price
        ? Math.round(((product.mrp - product.selling_price) / product.mrp) * 100)
        : 0

    const imageUrl = normalizeImageUrl(
        'images' in product && product.images?.[0]?.url
            ? product.images[0].url
            : ('image_url' in product ? product.image_url : undefined)
    )
    const promotionBadge = 'promotion_badge' in product ? product.promotion_badge : undefined
    const isFeatured = 'is_featured' in product ? product.is_featured : false
    const isOutOfStock = product.stock_status === 'out_of_stock'
    const rating = 'rating' in product ? (product as any).rating : undefined
    const reviewCount = 'review_count' in product ? (product as any).review_count : undefined

    return (
        <div className="group relative block">
            {/* Wishlist button — always visible, top-right of whole card */}
            <button
                onClick={handleWishlist}
                disabled={isPending}
                aria-label={isSaved ? 'Remove from wishlist' : 'Add to wishlist'}
                className={`absolute top-2.5 right-2.5 z-10 w-9 h-9 rounded-full shadow-md flex items-center justify-center transition-all duration-200 hover:scale-110 disabled:opacity-60
                    ${isSaved
                        ? 'bg-pink-50 dark:bg-pink-900/40 border border-pink-200 dark:border-pink-700'
                        : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-pink-300 dark:hover:border-pink-600'
                    }`}
            >
                <svg
                    className={`w-4.5 h-4.5 transition-all duration-200 ${isSaved ? 'fill-pink-500 text-pink-500 scale-110' : 'fill-transparent text-gray-400 dark:text-gray-500 group-hover:text-pink-400'}`}
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                    style={{ width: '18px', height: '18px' }}
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
            </button>

            <Link to={`/products/${product.product_id}`} className="block">
                <motion.div
                    whileHover={{ y: -4 }}
                    transition={{ duration: 0.2 }}
                    className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-card hover:shadow-card-hover transition-shadow duration-300"
                >
                    <div className="relative aspect-square bg-gray-50 dark:bg-gray-800 overflow-hidden">
                        {imageUrl ? (
                            <img
                                src={imageUrl}
                                alt={product.name}
                                loading="lazy"
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-gray-600">
                                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                </svg>
                            </div>
                        )}

                        {/* Discount badge */}
                        {discount > 0 && (
                            <span className="absolute top-3 left-3 bg-red-500 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg shadow-sm">
                                −{discount}%
                            </span>
                        )}

                        {/* Promotion / Featured badge */}
                        {(promotionBadge || isFeatured) && (
                            <span className="absolute top-3 right-3 bg-primary-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg shadow-sm max-w-[75%] truncate">
                                {promotionBadge || 'Featured'}
                            </span>
                        )}

                        {/* Wishlist button */}
                        <button
                            onClick={handleWishlist}
                            disabled={isPending}
                            aria-label={isSaved ? 'Remove from wishlist' : 'Add to wishlist'}
                            className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm shadow flex items-center justify-center transition-all hover:scale-110 disabled:opacity-60"
                        >
                            <svg className={`w-4 h-4 transition-colors ${isSaved ? 'fill-pink-500 text-pink-500' : 'fill-transparent text-gray-500 dark:text-gray-400'}`} stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                            </svg>
                        </button>

                        {/* Out of stock overlay */}
                        {isOutOfStock && (
                            <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-[2px] flex items-center justify-center">
                                <span className="text-gray-600 dark:text-gray-400 font-semibold text-sm bg-white/90 dark:bg-gray-800/90 px-4 py-2 rounded-xl">Out of Stock</span>
                            </div>
                        )}

                        {/* Quick view overlay gradient */}
                        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    </div>

                    <div className="p-4">
                        <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200 line-clamp-2 leading-snug group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors duration-200">
                            {product.name}
                        </h3>
                        <div className="mt-2.5 flex items-baseline gap-2">
                            <span className="text-lg font-bold text-gray-900 dark:text-white">₹{product.selling_price.toLocaleString('en-IN')}</span>
                            {discount > 0 && (
                                <span className="text-xs text-gray-400 line-through">₹{product.mrp.toLocaleString('en-IN')}</span>
                            )}
                        </div>
                        {rating != null && rating >= 1 && (
                            <div className="mt-1.5 flex items-center gap-1">
                                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{rating.toFixed(1)}</span>
                                <span className="text-amber-500 text-xs">★</span>
                                {reviewCount != null && reviewCount > 0 && (
                                    <span className="text-[11px] text-gray-400 dark:text-gray-500">({reviewCount})</span>
                                )}
                            </div>
                        )}
                        {product.stock_status === 'low_stock' && (
                            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5 font-medium flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                Only a few left
                            </p>
                        )}
                    </div>
                </motion.div>
            </Link>
        </div>
    )
}
