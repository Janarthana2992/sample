export function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
    const sizeClass = { sm: 'h-4 w-4', md: 'h-8 w-8', lg: 'h-12 w-12' }[size]
    const borderClass = { sm: 'border-2', md: 'border-[3px]', lg: 'border-4' }[size]
    return (
        <div className="flex items-center justify-center py-8">
            <div className={`${sizeClass} ${borderClass} animate-spin rounded-full border-primary-200 border-t-primary-600 dark:border-primary-800 dark:border-t-primary-400`} />
        </div>
    )
}
