interface StarRatingProps {
    rating: number
    max?: number
    size?: 'sm' | 'md'
    interactive?: boolean
    onChange?: (rating: number) => void
}

export function StarRating({ rating, max = 5, size = 'md', interactive = false, onChange }: StarRatingProps) {
    const starSize = size === 'sm' ? 'text-sm' : 'text-lg'

    return (
        <div className={`flex gap-0.5 ${starSize}`}>
            {Array.from({ length: max }, (_, i) => i + 1).map((star) => (
                <button
                    key={star}
                    type="button"
                    disabled={!interactive}
                    onClick={() => interactive && onChange?.(star)}
                    className={`${interactive ? 'cursor-pointer hover:scale-110' : 'cursor-default'} transition-transform`}
                >
                    <span className={star <= rating ? 'text-yellow-400' : 'text-gray-300'}>★</span>
                </button>
            ))}
        </div>
    )
}
