import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { productService } from '../../services/products'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import { StarRating } from '../../components/common/StarRating'

export default function StaffReviews() {
    const [selectedReview, setSelectedReview] = useState<any>(null)
    const { register, handleSubmit, reset } = useForm()
    const qc = useQueryClient()

    const { data: reviews, isLoading } = useQuery({
        queryKey: ['staff', 'reviews'],
        queryFn: () => productService.listAllReviews({ page: 1, size: 50 }),
        staleTime: 0,
        refetchOnWindowFocus: true,
    })

    const replyMutation = useMutation({
        mutationFn: ({ reviewId, reply_text }: { reviewId: string; reply_text: string }) =>
            productService.replyToReview(reviewId, { reply_text }),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: ['staff', 'reviews'] })
            setSelectedReview(null)
            reset()
            toast.success('Reply posted')
        },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to reply'),
    })

    const retractMutation = useMutation({
        mutationFn: (reviewId: string) => productService.retractReply(reviewId),
        onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['staff', 'reviews'] }); toast.success('Reply retracted') },
    })

    if (isLoading) return <LoadingSpinner />

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-gray-900">Customer Reviews</h1>

            {selectedReview && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setSelectedReview(null)}>
                    <div className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4" onClick={e => e.stopPropagation()}>
                        <h2 className="font-semibold text-lg">Reply to Review</h2>
                        <p className="text-sm text-gray-700 bg-gray-50 rounded p-3">{selectedReview.review_text}</p>
                        <form onSubmit={handleSubmit(d => replyMutation.mutate({ reviewId: selectedReview.review_id, reply_text: d.reply_text }))} className="space-y-4">
                            <textarea className="input h-28 resize-none" placeholder="Write your reply..." {...register('reply_text', { required: true })} />
                            <div className="flex gap-3">
                                <button type="submit" disabled={replyMutation.isPending} className="btn-primary flex-1">
                                    {replyMutation.isPending ? 'Posting...' : 'Post Reply'}
                                </button>
                                <button type="button" onClick={() => { setSelectedReview(null); reset() }} className="btn-secondary flex-1">Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="space-y-3">
                {reviews?.items?.map((review: any) => (
                    <div key={review.review_id} className="card space-y-2">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="font-medium text-gray-900">{review.user?.full_name ?? 'Anonymous'}</p>
                                <StarRating rating={review.rating} size="sm" />
                            </div>
                            <span className="text-xs text-gray-400">{new Date(review.created_at).toLocaleDateString('en-IN')}</span>
                        </div>
                        <p className="text-sm text-gray-700">{review.review_text}</p>
                        {review.reply?.reply_text ? (
                            <div className="bg-blue-50 rounded p-3 text-sm space-y-1">
                                <p className="font-medium text-blue-800">Staff Reply:</p>
                                <p className="text-blue-700">{review.reply.reply_text}</p>
                                <button
                                    onClick={() => retractMutation.mutate(review.review_id)}
                                    className="text-xs text-red-600 hover:underline"
                                >
                                    Retract Reply
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setSelectedReview(review)}
                                className="text-sm text-blue-600 hover:underline"
                            >
                                + Reply
                            </button>
                        )}
                    </div>
                ))}
                {!reviews?.items?.length && (
                    <p className="text-center text-gray-400 py-10">No reviews yet</p>
                )}
            </div>
        </div>
    )
}
