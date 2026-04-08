import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { productService } from '../../services/products'
import { cartService } from '../../services/cart'
import { orderService } from '../../services/orders'
import { useCartStore } from '../../store/cartStore'
import { useAuthStore } from '../../store/authStore'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import { ProductCard } from '../../components/common/ProductCard'
import { StarRating } from '../../components/common/StarRating'
import { aiClient } from '../../services/api'

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

    const addMutation = useMutation({
        mutationFn: () => cartService.addToCart(id!, quantity),
        onSuccess: async () => {
            const cart = await cartService.getCart()
            setCart(cart)
            toast.success('Added to cart!')
        },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to add'),
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
    if (!product) return <div className="text-center py-16 text-gray-500">Product not found</div>

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
        <div className="space-y-10">
            {/* Breadcrumb */}
            <nav className="text-sm text-gray-500">
                <Link to="/" className="hover:text-blue-600">Home</Link> /
                <Link to="/products" className="hover:text-blue-600 mx-1">Products</Link> /
                <span className="text-gray-900 ml-1">{product.name}</span>
            </nav>

            {/* Product */}
            <div className="grid md:grid-cols-2 gap-8">
                {/* Images */}
                <div className="space-y-3">
                    <div className="aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                        {product.images[selectedImage] ? (
                            <img src={product.images[selectedImage].url} alt={product.name} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-8xl">📦</div>
                        )}
                    </div>
                    {product.images.length > 1 && (
                        <div className="flex gap-2 overflow-x-auto">
                            {product.images.map((img, i) => (
                                <button
                                    key={img.image_id}
                                    onClick={() => setSelectedImage(i)}
                                    className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${selectedImage === i ? 'border-blue-500' : 'border-gray-200'
                                        }`}
                                >
                                    <img src={img.url} alt="" className="w-full h-full object-cover" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Info */}
                <div className="space-y-4">
                    <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
                    <p className="text-sm text-gray-500 font-mono">SKU: {product.sku}</p>

                    <div className="flex items-baseline gap-3">
                        <span className="text-3xl font-extrabold text-gray-900">
                            ₹{product.selling_price.toLocaleString('en-IN')}
                        </span>
                        {discount > 0 && (
                            <>
                                <span className="text-lg text-gray-400 line-through">₹{product.mrp.toLocaleString('en-IN')}</span>
                                <span className="badge bg-red-100 text-red-700">{discount}% off</span>
                            </>
                        )}
                    </div>

                    <div className={`badge ${product.stock_status === 'in_stock' ? 'bg-green-100 text-green-700' :
                        product.stock_status === 'low_stock' ? 'bg-orange-100 text-orange-700' :
                            'bg-red-100 text-red-700'
                        }`}>
                        {product.stock_status === 'in_stock' ? '✓ In Stock' :
                            product.stock_status === 'low_stock' ? `⚠ Low Stock (${product.stock_quantity} left)` :
                                '✗ Out of Stock'}
                    </div>

                    {!isOutOfStock && (
                        <div className="flex items-center gap-3">
                            <div className="flex items-center border border-gray-300 rounded-lg">
                                <button
                                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                                    className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-l-lg"
                                >−</button>
                                <span className="px-4 py-2 text-sm font-semibold">{quantity}</span>
                                <button
                                    onClick={() => setQuantity(q => Math.min(product.stock_quantity, q + 1))}
                                    className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-r-lg"
                                >+</button>
                            </div>
                            {isAuthenticated ? (
                                <button
                                    onClick={() => addMutation.mutate()}
                                    disabled={addMutation.isPending}
                                    className="btn-primary flex-1"
                                >
                                    {addMutation.isPending ? 'Adding...' : '🛒 Add to Cart'}
                                </button>
                            ) : (
                                <Link to="/login" className="btn-primary flex-1 text-center">Login to Buy</Link>
                            )}
                        </div>
                    )}

                    {product.tags && product.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {product.tags.map(tag => (
                                <span key={tag} className="badge bg-gray-100 text-gray-600">#{tag}</span>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Description */}
            <div className="card">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Description</h2>
                <div className="prose prose-sm text-gray-700 max-w-none whitespace-pre-wrap">{product.description}</div>
            </div>

            {(similarLoading || similarItems.length > 0) && (
                <section>
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Similar Products</h2>
                            <p className="text-sm text-gray-500 mt-1">More products related to this item</p>
                        </div>
                        <Link to="/products" className="text-blue-600 text-sm hover:underline">Browse all →</Link>
                    </div>
                    {similarLoading ? (
                        <LoadingSpinner />
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                            {similarItems.map(item => <ProductCard key={item.product_id} product={item} />)}
                        </div>
                    )}
                </section>
            )}

            {/* Reviews */}
            <div className="card">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Customer Reviews ({reviews?.total || 0})</h2>

                {/* Write a review */}
                {isAuthenticated && eligibleOrder && !alreadyReviewed && (
                    <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                        <h3 className="font-semibold text-gray-900 mb-3">Write a Review</h3>
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
                    <p className="mb-4 text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">
                        ✓ You have already reviewed this product.
                    </p>
                )}

                {isAuthenticated && !eligibleOrder && !alreadyReviewed && (
                    <p className="mb-4 text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">
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
        </div>
    )
}
