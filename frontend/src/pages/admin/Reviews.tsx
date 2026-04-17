import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { productService } from '../../services/products'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import { StarRating } from '../../components/common/StarRating'
import type { Product, Review } from '../../types'

type RatingSort = 'none' | 'asc' | 'desc'

export default function AdminReviews() {
    const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
    const [ratingSort, setRatingSort] = useState<RatingSort>('none')
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [replyText, setReplyText] = useState('')
    const qc = useQueryClient()

    const { data: productsData, isLoading: productsLoading } = useQuery({
        queryKey: ['admin', 'products-list'],
        queryFn: async () => {
            const first = await productService.list({ size: 100, page: 1, is_active: undefined })
            const items: Product[] = [...(first.items as Product[])]
            const pages = Math.ceil(first.total / 100)
            for (let page = 2; page <= pages; page++) {
                const next = await productService.list({ size: 100, page, is_active: undefined })
                items.push(...(next.items as Product[]))
            }
            return { items }
        },
    })
    const products: Product[] = (productsData as any)?.items ?? []

    const { data: allReviewsData } = useQuery({
        queryKey: ['admin', 'reviews', 'all'],
        queryFn: async () => {
            const first = await productService.listReviews({ size: 100, page: 1 })
            const items: Review[] = [...(first.items ?? [])]
            const pages = Math.ceil(first.total / 100)
            for (let page = 2; page <= pages; page++) {
                const next = await productService.listReviews({ size: 100, page })
                items.push(...(next.items ?? []))
            }
            return { ...first, items }
        },
        staleTime: 0,
        refetchOnWindowFocus: true,
    })
    const allReviews: Review[] = allReviewsData?.items ?? []

    const { data: productReviewsData, isLoading: reviewsLoading } = useQuery({
        queryKey: ['admin', 'reviews', selectedProductId],
        queryFn: () => productService.listReviews({ product_id: selectedProductId!, size: 100 }),
        enabled: !!selectedProductId,
        staleTime: 0,
        refetchOnWindowFocus: true,
    })

    const replyMutation = useMutation({
        mutationFn: ({ reviewId, text }: { reviewId: string; text: string }) =>
            productService.replyToReview(reviewId, text),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: ['admin', 'reviews'] })
            setExpandedId(null)
            setReplyText('')
            toast.success('Reply posted')
        },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to post reply'),
    })

    const retractMutation = useMutation({
        mutationFn: (reviewId: string) => productService.retractReply(reviewId),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: ['admin', 'reviews'] })
            toast.success('Reply retracted')
        },
    })

    const deleteMutation = useMutation({
        mutationFn: (reviewId: string) => productService.deleteReview(reviewId),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: ['admin', 'reviews'] })
            toast.success('Review deleted')
        },
    })

    const reviewSummary = useMemo(() => {
        const map: Record<string, { count: number; total: number }> = {}
        allReviews.forEach(r => {
            if (!map[r.product_id]) map[r.product_id] = { count: 0, total: 0 }
            map[r.product_id].count++
            map[r.product_id].total += r.rating
        })
        return map
    }, [allReviews])

    const sortedReviews = useMemo(() => {
        const items: Review[] = productReviewsData?.items ?? []
        if (ratingSort === 'none') return items
        return [...items].sort((a, b) =>
            ratingSort === 'asc' ? a.rating - b.rating : b.rating - a.rating
        )
    }, [productReviewsData, ratingSort])

    const productsWithReviews = products.filter(p => reviewSummary[p.product_id])

    const ReviewCard = ({ review }: { review: Review }) => (
        <div className="card space-y-3">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <StarRating rating={review.rating} size="sm" />
                        <span className="text-xs text-surface-500 dark:text-surface-400">
                            {new Date(review.created_at).toLocaleDateString('en-IN')}
                        </span>
                        {review.is_flagged && (
                            <span className="badge bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-xs">Flagged</span>
                        )}
                    </div>
                    {review.review_text
                        ? <p className="text-sm text-surface-700 dark:text-surface-300 mt-2">{review.review_text}</p>
                        : <p className="text-sm text-surface-400 italic mt-2">No written comment</p>
                    }
                </div>
                <div className="flex gap-2 shrink-0">
                    <button
                        onClick={() => {
                            setExpandedId(expandedId === review.review_id ? null : review.review_id)
                            setReplyText(review.reply?.reply_text || '')
                        }}
                        className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-600 transition-colors"
                    >
                        {review.reply && !review.reply.is_retracted ? 'Edit Reply' : 'Reply'}
                    </button>
                    {review.reply && !review.reply.is_retracted && (
                        <button onClick={() => retractMutation.mutate(review.review_id)} className="text-xs text-orange-600 hover:text-primary-600 transition-colors">Retract</button>
                    )}
                    <button onClick={() => deleteMutation.mutate(review.review_id)} className="text-xs text-red-600 hover:text-primary-600 transition-colors">Delete</button>
                </div>
            </div>

            {review.reply && !review.reply.is_retracted && (
                <div className="ml-4 bg-blue-50 border-l-2 border-blue-400 p-2 rounded text-sm">
                    <p className="font-semibold text-blue-700 text-xs mb-1">Brand Reply</p>
                    <p className="text-surface-700 dark:text-surface-300">{review.reply.reply_text}</p>
                </div>
            )}

            {expandedId === review.review_id && (
                <div className="border-t pt-3 space-y-2">
                    <textarea
                        className="input min-h-[80px] resize-none"
                        placeholder="Write your reply (max 500 chars)..."
                        maxLength={500}
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={() => replyMutation.mutate({ reviewId: review.review_id, text: replyText })}
                            disabled={!replyText.trim() || replyMutation.isPending}
                            className="btn-primary text-sm py-1.5"
                        >
                            {replyMutation.isPending ? 'Posting...' : 'Post Reply'}
                        </button>
                        <button onClick={() => setExpandedId(null)} className="btn-secondary text-sm py-1.5">Cancel</button>
                    </div>
                </div>
            )}
        </div>
    )

    // ── Detail view: reviews for a specific product ──────────────
    if (selectedProductId) {
        const product = products.find(p => p.product_id === selectedProductId)
        const s = reviewSummary[selectedProductId]
        const avg = s ? (s.total / s.count).toFixed(1) : '—'

        return (
            <div className="space-y-4">
                <div className="flex items-start gap-3 flex-wrap">
                    <button
                        onClick={() => { setSelectedProductId(null); setExpandedId(null); setRatingSort('none') }}
                        className="text-surface-400 hover:text-surface-700 dark:hover:text-white text-xl leading-none mt-1"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" /></svg>
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-2xl font-bold text-surface-900 dark:text-white truncate">{product?.name || 'Product'}</h1>
                        <div className="flex items-center gap-2 mt-1">
                            <StarRating rating={parseFloat(avg)} size="sm" />
                            <span className="text-sm text-surface-500 dark:text-surface-400">
                                {avg} avg · {s?.count ?? 0} review{(s?.count ?? 0) !== 1 ? 's' : ''}
                            </span>
                        </div>
                    </div>
                    <div className="flex gap-1 items-center">
                        <span className="text-sm text-surface-500 dark:text-surface-400 mr-1">Sort:</span>
                        <button
                            onClick={() => setRatingSort(ratingSort === 'asc' ? 'none' : 'asc')}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${ratingSort === 'asc' ? 'bg-primary-600 text-white border-primary-600' : 'bg-white dark:bg-surface-800 text-surface-600 dark:text-surface-400 border-surface-300 dark:border-surface-600 hover:border-blue-400'}`}
                        >
                            ↑ Low→High
                        </button>
                        <button
                            onClick={() => setRatingSort(ratingSort === 'desc' ? 'none' : 'desc')}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${ratingSort === 'desc' ? 'bg-primary-600 text-white border-primary-600' : 'bg-white dark:bg-surface-800 text-surface-600 dark:text-surface-400 border-surface-300 dark:border-surface-600 hover:border-blue-400'}`}
                        >
                            ↓ High→Low
                        </button>
                    </div>
                </div>

                {reviewsLoading ? <LoadingSpinner /> : (
                    <div className="space-y-3">
                        {sortedReviews.length === 0
                            ? <p className="text-surface-400 text-sm py-6 text-center">No reviews for this product.</p>
                            : sortedReviews.map(r => <ReviewCard key={r.review_id} review={r} />)
                        }
                    </div>
                )}
            </div>
        )
    }

    // ── Product card grid ────────────────────────────────────────
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Reviews & Ratings</h1>
                <span className="text-sm text-surface-500 dark:text-surface-400">
                    {allReviews.length} review{allReviews.length !== 1 ? 's' : ''} · {productsWithReviews.length} product{productsWithReviews.length !== 1 ? 's' : ''}
                </span>
            </div>

            {productsLoading ? <LoadingSpinner /> : (
                productsWithReviews.length === 0 ? (
                    <p className="text-surface-400 text-sm py-12 text-center">No reviews yet.</p>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {productsWithReviews.map(p => {
                            const s = reviewSummary[p.product_id]
                            const avg = (s.total / s.count).toFixed(1)
                            const rounded = Math.round(parseFloat(avg))
                            const rawImageUrl = p.images?.[0]?.url
                            const imageUrl = rawImageUrl
                                ? (rawImageUrl.startsWith('http://') || rawImageUrl.startsWith('https://') || rawImageUrl.startsWith('/') ? rawImageUrl : `/${rawImageUrl}`)
                                : null
                            return (
                                <button
                                    key={p.product_id}
                                    onClick={() => setSelectedProductId(p.product_id)}
                                    className="card text-left hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group p-4"
                                >
                                    <div className="w-full h-36 bg-surface-100 dark:bg-surface-800 rounded-lg mb-3 flex items-center justify-center overflow-hidden">
                                        {imageUrl
                                            ? <img src={imageUrl} alt={p.name} className="w-full h-full object-cover" />
                                            : <span className="text-4xl">📦</span>
                                        }
                                    </div>
                                    <p className="font-semibold text-surface-900 dark:text-white text-sm leading-snug line-clamp-2 group-hover:text-blue-700 transition-colors mb-2">
                                        {p.name}
                                    </p>
                                    <div className="flex items-center gap-0.5 mb-1">
                                        {[1, 2, 3, 4, 5].map(star => (
                                            <span key={star} className={`text-lg ${star <= rounded ? 'text-yellow-400' : 'text-surface-200 dark:text-surface-700'}`}>★</span>
                                        ))}
                                    </div>
                                    <p className="text-xs text-surface-500 dark:text-surface-400">
                                        {avg} avg · {s.count} review{s.count !== 1 ? 's' : ''}
                                    </p>
                                </button>
                            )
                        })}
                    </div>
                )
            )}
        </div>
    )
}
