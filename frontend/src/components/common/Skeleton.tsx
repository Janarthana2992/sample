interface SkeletonProps {
    className?: string
    count?: number
}

export function Skeleton({ className = '', count = 1 }: SkeletonProps) {
    return (
        <>
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className={`skeleton ${className}`} />
            ))}
        </>
    )
}

export function ProductCardSkeleton() {
    return (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
            <div className="aspect-square skeleton rounded-none" />
            <div className="p-4 space-y-3">
                <div className="skeleton h-4 w-3/4" />
                <div className="skeleton h-4 w-1/2" />
                <div className="flex gap-2">
                    <div className="skeleton h-5 w-16" />
                    <div className="skeleton h-5 w-12" />
                </div>
            </div>
        </div>
    )
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6">
            {Array.from({ length: count }).map((_, i) => (
                <ProductCardSkeleton key={i} />
            ))}
        </div>
    )
}

export function CartItemSkeleton() {
    return (
        <div className="card flex items-center gap-4">
            <div className="skeleton w-20 h-20 rounded-xl shrink-0" />
            <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-2/3" />
                <div className="skeleton h-4 w-1/3" />
            </div>
            <div className="skeleton h-8 w-24 rounded-lg" />
        </div>
    )
}

export function OrderCardSkeleton() {
    return (
        <div className="card space-y-3">
            <div className="flex justify-between">
                <div className="skeleton h-4 w-32" />
                <div className="skeleton h-6 w-20 rounded-lg" />
            </div>
            <div className="skeleton h-4 w-48" />
            <div className="skeleton h-4 w-24" />
        </div>
    )
}
