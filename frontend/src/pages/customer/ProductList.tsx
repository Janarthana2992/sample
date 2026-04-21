import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { productService } from '../../services/products'
import { ProductCard } from '../../components/common/ProductCard'
import { AnimatedPage } from '../../components/common/AnimatedPage'
import { ProductGridSkeleton } from '../../components/common/Skeleton'
import type { Category, SearchHit } from '../../types'

export default function ProductList() {
    const [params, setParams] = useSearchParams()
    const q = params.get('q') || ''
    const page = parseInt(params.get('page') || '1')
    const aiMode = params.get('ai') === '1'

    const [minPrice, setMinPrice] = useState('')
    const [maxPrice, setMaxPrice] = useState('')
    const [inStockOnly, setInStockOnly] = useState(false)
    const [discountOnly, setDiscountOnly] = useState(false)
    const [showFilters, setShowFilters] = useState(false)
    const [selectedCategories, setSelectedCategories] = useState<string[]>([])
    const [aiSummary, setAiSummary] = useState<string | null>(null)

    const clearSearch = () => {
        setParams(prev => { prev.delete('q'); prev.delete('page'); return prev })
    }
    const { data: categories = [] } = useQuery<Category[]>({
        queryKey: ['categories'],
        queryFn: () => productService.listCategories(),
        staleTime: 5 * 60 * 1000,
    })

    const activeCategories = (categories as Category[]).filter(c => c.is_active)

    const toggleCategory = (name: string) => {
        setSelectedCategories(prev =>
            prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]
        )
        // reset page and clear stale search when applying category filters
        setParams(prev => { prev.delete('page'); prev.delete('q'); return prev })
    }

    const { data, isLoading } = useQuery<any>({
        queryKey: ['products', 'search', q, page, minPrice, maxPrice, inStockOnly, discountOnly, selectedCategories, aiMode],
        queryFn: async () => {
            // AI-powered search: parse intent first, then apply extracted filters
            if (aiMode && q) {
                try {
                    const intent = await productService.parseSearchIntent(q)
                    const f = intent.filters || {}
                    setAiSummary(`AI understood: looking for "${intent.rewritten_query}"${f.category ? ` in ${f.category}` : ''}${f.max_price ? ` under ₹${f.max_price}` : ''}${f.min_price ? ` above ₹${f.min_price}` : ''}`)
                    return productService.filter({
                        q: intent.rewritten_query || q,
                        categories: f.category ? [f.category] : (selectedCategories.length > 0 ? selectedCategories : null),
                        min_price: f.min_price ?? (minPrice ? parseFloat(minPrice) : null),
                        max_price: f.max_price ?? (maxPrice ? parseFloat(maxPrice) : null),
                        in_stock_only: inStockOnly,
                        deals_only: discountOnly,
                        page,
                        size: 20,
                    })
                } catch {
                    setAiSummary(null)
                    // Fallback to normal search
                }
            }
            setAiSummary(null)
            return productService.filter({
                q,
                categories: selectedCategories.length > 0 ? selectedCategories : null,
                min_price: minPrice ? parseFloat(minPrice) : null,
                max_price: maxPrice ? parseFloat(maxPrice) : null,
                in_stock_only: inStockOnly,
                deals_only: discountOnly,
                page,
                size: 20,
            })
        },
    })

    const setPage = (p: number) => setParams(prev => { prev.set('page', String(p)); return prev })

    const d = data as any
    const hits: SearchHit[] = d?.hits ?? []
    const items = d?.items ?? []
    const total: number = d?.total ?? 0
    const suggestion: string | undefined = d?.suggestion

    const allProducts = hits.length > 0 ? hits : items

    return (
        <AnimatedPage>
        <div className="flex flex-col md:flex-row gap-6">
            {/* Mobile: filter toggle button */}
            <div className="md:hidden">
                <button
                    onClick={() => setShowFilters(v => !v)}
                    className="btn-secondary text-sm w-full flex items-center justify-center gap-2"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M3 4h18M3 12h12M3 20h6"/></svg>
                    {showFilters ? 'Hide Filters' : 'Filters'}
                </button>
            </div>

            {/* AI search summary */}
            {aiSummary && (
                <div className="w-full md:col-span-2 -mt-2">
                    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 text-sm px-4 py-2 rounded-xl border border-purple-100 dark:border-purple-800">
                        <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L9.19 8.63L2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61z"/></svg>
                        <span>{aiSummary}</span>
                    </motion.div>
                </div>
            )}

            {/* Filters Sidebar */}
            <AnimatePresence>
            <aside className={`md:w-64 md:shrink-0 space-y-4 ${showFilters ? 'block' : 'hidden md:block'}`}>
                <div className="card sticky top-24">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M3 4h18M3 12h12M3 20h6"/></svg>
                        Filters
                    </h3>

                    <div className="space-y-5">
                        {/* Categories */}
                        <div>
                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2.5">Category</p>
                            <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
                                {activeCategories.map(cat => (
                                    <label key={cat.category_id} className="flex items-center gap-2.5 cursor-pointer group p-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={selectedCategories.includes(cat.name)}
                                            onChange={() => toggleCategory(cat.name)}
                                            className="rounded-md border-gray-300 text-primary-600 focus:ring-primary-500"
                                        />
                                        <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{cat.name}</span>
                                    </label>
                                ))}
                            </div>
                            {selectedCategories.length > 0 && (
                                <button
                                    onClick={() => setSelectedCategories([])}
                                    className="mt-2 text-xs text-red-500 hover:text-red-600 font-medium transition-colors"
                                >
                                    Clear all
                                </button>
                            )}
                        </div>

                        <div className="border-t border-gray-100 dark:border-gray-800" />

                        {/* Price */}
                        <div>
                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2.5">Price Range</p>
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    className="input text-center"
                                    value={minPrice}
                                    onChange={e => setMinPrice(e.target.value)}
                                    placeholder="Min"
                                />
                                <span className="text-gray-300 self-center">—</span>
                                <input
                                    type="number"
                                    className="input text-center"
                                    value={maxPrice}
                                    onChange={e => setMaxPrice(e.target.value)}
                                    placeholder="Max"
                                />
                            </div>
                        </div>

                        <div className="border-t border-gray-100 dark:border-gray-800" />

                        {/* Stock */}
                        <label className="flex items-center gap-2.5 cursor-pointer p-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                            <input
                                type="checkbox"
                                checked={inStockOnly}
                                onChange={e => setInStockOnly(e.target.checked)}
                                className="rounded-md border-gray-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">In stock only</span>
                        </label>

                        {/* Discount */}
                        <label className="flex items-center gap-2.5 cursor-pointer p-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                            <input
                                type="checkbox"
                                checked={discountOnly}
                                onChange={e => setDiscountOnly(e.target.checked)}
                                className="rounded-md border-gray-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">Discounted only</span>
                        </label>
                    </div>
                </div>
            </aside>
            </AnimatePresence>

            {/* Results */}
            <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2.5 mb-6">
                    <h1 className="section-title">
                        {q ? `Results for "${q}"` : selectedCategories.length === 1 ? selectedCategories[0] : 'All Products'}
                    </h1>
                    {total > 0 && <span className="text-sm text-gray-400 dark:text-gray-500 font-medium">{total} products</span>}
                    {/* Clear search chip */}
                    {q && (
                        <button
                            onClick={clearSearch}
                            className="inline-flex items-center gap-1.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg px-3 py-1 font-medium hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
                        >
                            Clear search
                            <span className="leading-none">×</span>
                        </button>
                    )}
                    {/* Active category chips */}
                    {selectedCategories.map(cat => (
                        <span key={cat} className="inline-flex items-center gap-1.5 text-xs bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 rounded-lg px-3 py-1 font-medium">
                            {cat}
                            <button onClick={() => toggleCategory(cat)} className="hover:text-primary-900 dark:hover:text-primary-100 leading-none transition-colors">×</button>
                        </span>
                    ))}
                </div>

                {/* Did you mean? */}
                {suggestion && (
                    <div className="mb-4 text-sm text-gray-600 bg-blue-50 border border-blue-100 rounded-lg px-4 py-2">
                        Did you mean:{' '}
                        <button
                            className="text-blue-600 hover:underline font-medium"
                            onClick={() => {
                                const next = new URLSearchParams(params)
                                next.set('q', suggestion)
                                next.delete('page')
                                setParams(next)
                            }}
                        >
                            {suggestion}
                        </button>
                        ?
                    </div>
                )}

                {isLoading ? (
                    <ProductGridSkeleton count={8} />
                ) : allProducts.length === 0 ? (
                    <div className="text-center py-20">
                        <svg className="w-16 h-16 text-gray-200 dark:text-gray-700 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx={11} cy={11} r={8} strokeWidth={1.5}/><path strokeWidth={1.5} d="m21 21-4.35-4.35"/></svg>
                        <p className="text-lg font-semibold text-gray-600 dark:text-gray-300">No products found</p>
                        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Try different search terms or adjust filters</p>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
                            {allProducts.map((p: any, i: number) => (
                                <motion.div
                                    key={p.product_id}
                                    initial={{ opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.03, duration: 0.3 }}
                                >
                                    <ProductCard product={p} />
                                </motion.div>
                            ))}
                        </div>

                        {/* Pagination */}
                        <div className="flex items-center justify-center gap-3 mt-10">
                            <button
                                disabled={page <= 1}
                                onClick={() => setPage(page - 1)}
                                className="btn-secondary text-sm disabled:opacity-40 flex items-center gap-1.5"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7"/></svg>
                                Prev
                            </button>
                            <span className="text-sm text-gray-500 dark:text-gray-400 font-medium tabular-nums">Page {page} of {Math.max(1, Math.ceil(total / 20))}</span>
                            <button
                                disabled={page * 20 >= total}
                                onClick={() => setPage(page + 1)}
                                className="btn-secondary text-sm disabled:opacity-40 flex items-center gap-1.5"
                            >
                                Next
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
        </AnimatedPage>
    )
}
