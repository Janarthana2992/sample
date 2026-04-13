import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { productService } from '../../services/products'
import { ProductCard } from '../../components/common/ProductCard'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import type { Category, SearchHit } from '../../types'

export default function ProductList() {
    const [params, setParams] = useSearchParams()
    const q = params.get('q') || ''
    const page = parseInt(params.get('page') || '1')
    const aiMode = params.get('ai') === '1'

    const [minPrice, setMinPrice] = useState('')
    const [maxPrice, setMaxPrice] = useState('')
    const [inStockOnly, setInStockOnly] = useState(false)
    const [showFilters, setShowFilters] = useState(false)
    const [selectedCategories, setSelectedCategories] = useState<string[]>([])
    const [aiSummary, setAiSummary] = useState<string | null>(null)
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
        // reset to page 1 when filter changes
        setParams(prev => { prev.delete('page'); return prev })
    }

    const { data, isLoading } = useQuery<any>({
        queryKey: ['products', 'search', q, page, minPrice, maxPrice, inStockOnly, selectedCategories, aiMode],
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
        <div className="flex flex-col md:flex-row gap-6">
            {/* Mobile: filter toggle button */}
            <div className="md:hidden">
                <button
                    onClick={() => setShowFilters(v => !v)}
                    className="btn-secondary text-sm w-full"
                >
                    {showFilters ? '✕ Hide Filters' : '⚙ Filters'}
                </button>
            </div>

            {/* AI search summary */}
            {aiSummary && (
                <div className="w-full md:col-span-2 -mt-2">
                    <div className="inline-flex items-center gap-2 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 text-sm px-3 py-1.5 rounded-full border border-purple-200 dark:border-purple-700">
                        <span>✨</span>
                        <span>{aiSummary}</span>
                    </div>
                </div>
            )}

            {/* Filters Sidebar — always visible on md+, toggle on mobile */}
            <aside className={`md:w-64 md:shrink-0 space-y-4 ${showFilters ? 'block' : 'hidden md:block'}`}>
                <div className="card">
                    <h3 className="font-semibold text-gray-900 mb-3">Filters</h3>

                    <div className="space-y-4">
                        {/* Categories */}
                        <div>
                            <p className="text-sm font-medium text-gray-700 mb-2">Category</p>
                            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                                {activeCategories.map(cat => (
                                    <label key={cat.category_id} className="flex items-center gap-2 cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            checked={selectedCategories.includes(cat.name)}
                                            onChange={() => toggleCategory(cat.name)}
                                            className="rounded text-blue-600"
                                        />
                                        <span className="text-sm text-gray-700 group-hover:text-blue-600">{cat.name}</span>
                                    </label>
                                ))}
                            </div>
                            {selectedCategories.length > 0 && (
                                <button
                                    onClick={() => setSelectedCategories([])}
                                    className="mt-2 text-xs text-red-500 hover:underline"
                                >
                                    Clear categories
                                </button>
                            )}
                        </div>

                        <hr className="border-gray-100" />

                        {/* Price */}
                        <div>
                            <p className="text-sm font-medium text-gray-700 mb-2">Price (₹)</p>
                            <div className="space-y-2">
                                <input
                                    type="number"
                                    className="input"
                                    value={minPrice}
                                    onChange={e => setMinPrice(e.target.value)}
                                    placeholder="Min"
                                />
                                <input
                                    type="number"
                                    className="input"
                                    value={maxPrice}
                                    onChange={e => setMaxPrice(e.target.value)}
                                    placeholder="Max"
                                />
                            </div>
                        </div>

                        <hr className="border-gray-100" />

                        {/* Stock */}
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={inStockOnly}
                                onChange={e => setInStockOnly(e.target.checked)}
                                className="rounded text-blue-600"
                            />
                            <span className="text-sm text-gray-700">In stock only</span>
                        </label>
                    </div>
                </div>
            </aside>

            {/* Results */}
            <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-4">
                    <h1 className="text-xl font-bold text-gray-900">
                        {q ? `Results for "${q}"` : selectedCategories.length === 1 ? selectedCategories[0] : 'All Products'}
                        {total > 0 && <span className="text-sm text-gray-500 font-normal ml-2">({total} products)</span>}
                    </h1>
                    {/* Active category chips */}
                    {selectedCategories.map(cat => (
                        <span key={cat} className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 rounded-full px-2.5 py-0.5">
                            {cat}
                            <button onClick={() => toggleCategory(cat)} className="hover:text-blue-900 leading-none">✕</button>
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
                    <LoadingSpinner />
                ) : allProducts.length === 0 ? (
                    <div className="text-center py-16 text-gray-500">
                        <p className="text-4xl mb-4">🔍</p>
                        <p className="text-lg font-medium">No products found</p>
                        <p className="text-sm">Try different search terms or filters</p>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                            {allProducts.map((p: any) => (
                                <ProductCard key={p.product_id} product={p} />
                            ))}
                        </div>

                        {/* Pagination */}
                        <div className="flex items-center justify-center gap-2 mt-8">
                            <button
                                disabled={page <= 1}
                                onClick={() => setPage(page - 1)}
                                className="btn-secondary text-sm disabled:opacity-40"
                            >
                                ← Prev
                            </button>
                            <span className="text-sm text-gray-600">Page {page} of {Math.ceil(total / 20)}</span>
                            <button
                                disabled={page * 20 >= total}
                                onClick={() => setPage(page + 1)}
                                className="btn-secondary text-sm disabled:opacity-40"
                            >
                                Next →
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
