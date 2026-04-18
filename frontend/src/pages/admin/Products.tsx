import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { productService } from '../../services/products'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import type { Product } from '../../types'
import type { Category } from '../../types'

const STATUS_BADGE: Record<string, string> = {
    in_stock: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    low_stock: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    out_of_stock: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

type SortField = 'name' | 'sku' | 'selling_price' | 'stock_quantity'
type SortDir = 'asc' | 'desc'

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField | null; sortDir: SortDir }) {
    if (sortField !== field) return (
        <svg className="w-3.5 h-3.5 opacity-30 group-hover:opacity-70 ml-1 inline transition-opacity" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
        </svg>
    )
    return sortDir === 'asc' ? (
        <svg className="w-3.5 h-3.5 text-primary-600 ml-1 inline" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
    ) : (
        <svg className="w-3.5 h-3.5 text-primary-600 ml-1 inline" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
    )
}

export default function AdminProducts() {
    const [searchParams, setSearchParams] = useSearchParams()
    const stockParam = searchParams.get('stock') as 'in_stock' | 'low_stock' | 'out_of_stock' | null

    const [page, setPage] = useState(1)
    const [search, setSearch] = useState('')
    const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
    const [stockFilter, setStockFilter] = useState<string | null>(stockParam)
    // When stock filter is active, default sort by stock ascending
    const [sortField, setSortField] = useState<SortField | null>(stockParam ? 'stock_quantity' : null)
    const [sortDir, setSortDir] = useState<SortDir>('asc')

    // Sync URL param → filter state on navigation
    useEffect(() => {
        setStockFilter(stockParam)
        if (stockParam && sortField === null) {
            setSortField('stock_quantity')
            setSortDir('asc')
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stockParam])

    function handleSort(field: SortField) {
        if (sortField === field) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        } else {
            setSortField(field)
            setSortDir('asc')
        }
        setPage(1)
    }

    function handleStockFilter(value: string | null) {
        setStockFilter(value)
        setPage(1)
        if (value) {
            searchParams.set('stock', value)
            setSortField('stock_quantity')
            setSortDir('asc')
        } else {
            searchParams.delete('stock')
        }
        setSearchParams(searchParams, { replace: true })
    }
    const [importing, setImporting] = useState(false)
    const importInputRef = useRef<HTMLInputElement>(null)
    const qc = useQueryClient()

    const { data, isLoading } = useQuery({
        queryKey: ['admin', 'products', page, categoryFilter],
        queryFn: () => productService.list({ page, size: 50, is_active: undefined, ...(categoryFilter ? { category_id: categoryFilter } : {}) }),
    })

    const { data: categories } = useQuery({
        queryKey: ['categories'],
        queryFn: productService.listCategories,
        staleTime: 5 * 60_000,
    })

    const deleteMutation = useMutation({
        mutationFn: (id: string) => productService.delete(id),
        onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['admin', 'products'] }); toast.success('Product deactivated') },
        onError: () => toast.error('Failed to delete'),
    })

    const toggleMutation = useMutation({
        mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
            productService.update(id, { is_active }),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: ['admin', 'products'] })
            await qc.invalidateQueries({ queryKey: ['admin', 'low-stock'] })
            await qc.invalidateQueries({ queryKey: ['admin', 'kpis'] })
        },
    })

    const productFlagsMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: object }) => productService.update(id, data),
        onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['admin', 'products'] }) },
    })

    const handleExport = async () => {
        try {
            const blob = await productService.exportProductsCsv()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url; a.download = 'products.csv'; a.click()
            URL.revokeObjectURL(url)
        } catch {
            toast.error('Export failed')
        }
    }

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setImporting(true)
        try {
            const result = await productService.importProductsCsv(file)
            await qc.invalidateQueries({ queryKey: ['admin', 'products'] })
            toast.success(`Import done: ${result.created} created, ${result.updated} updated, ${result.errors} errors`)
            if (result.error_details.length > 0) {
                console.warn('Import errors:', result.error_details)
            }
        } catch (err: any) {
            toast.error(err.response?.data?.detail || 'Import failed')
        } finally {
            setImporting(false)
            if (importInputRef.current) importInputRef.current.value = ''
        }
    }

    const filtered = (() => {
        let list = data?.items.filter(p => {
            const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
            const matchesStock = !stockFilter || p.stock_status === stockFilter
            return matchesSearch && matchesStock
        }) || []
        if (sortField) {
            list = [...list].sort((a, b) => {
                let va: string | number = a[sortField] as string | number
                let vb: string | number = b[sortField] as string | number
                if (typeof va === 'string') va = va.toLowerCase()
                if (typeof vb === 'string') vb = vb.toLowerCase()
                if (va < vb) return sortDir === 'asc' ? -1 : 1
                if (va > vb) return sortDir === 'asc' ? 1 : -1
                return 0
            })
        }
        return list
    })()

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Products</h1>
                <div className="flex gap-2">
                    <button onClick={handleExport} className="btn-secondary text-sm">⬇ Export CSV</button>
                    <button onClick={() => importInputRef.current?.click()} disabled={importing} className="btn-secondary text-sm">
                        {importing ? 'Importing...' : '⬆ Import CSV'}
                    </button>
                    <input ref={importInputRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
                    <Link to="/admin/products/add" className="btn-primary text-sm">+ Add Product</Link>
                </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
                <input
                    type="search"
                    placeholder="Search by name or SKU..."
                    className="input max-w-sm"
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1) }}
                />
                {/* Stock status filter pills */}
                <div className="flex items-center gap-1.5">
                    {([null, 'in_stock', 'low_stock', 'out_of_stock'] as const).map(s => {
                        const labels: Record<string, string> = { in_stock: 'In Stock', low_stock: 'Low Stock', out_of_stock: 'Out of Stock' }
                        const active = stockFilter === s
                        const colors: Record<string, string> = {
                            in_stock: active ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-emerald-200 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400 hover:border-emerald-400',
                            low_stock: active ? 'bg-amber-500 border-amber-500 text-white' : 'border-amber-200 text-amber-700 dark:border-amber-800 dark:text-amber-400 hover:border-amber-400',
                            out_of_stock: active ? 'bg-red-500 border-red-500 text-white' : 'border-red-200 text-red-700 dark:border-red-800 dark:text-red-400 hover:border-red-400',
                        }
                        return (
                            <button
                                key={String(s)}
                                onClick={() => handleStockFilter(s)}
                                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${s === null
                                    ? active
                                        ? 'bg-primary-600 border-primary-600 text-white'
                                        : 'bg-white dark:bg-surface-800 border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-300 hover:border-primary-400'
                                    : colors[s]
                                    } ${s === null ? '' : 'bg-white dark:bg-surface-800'}`}
                            >
                                {s === null ? 'All Stock' : labels[s]}
                            </button>
                        )
                    })}
                </div>
                <span className="text-sm text-surface-500 dark:text-surface-400 ml-auto">
                    {filtered.length}{stockFilter || search ? ` of ${data?.total || 0}` : ''} product{filtered.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Category filter pills */}
            {categories && categories.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                    <button
                        onClick={() => { setCategoryFilter(null); setPage(1) }}
                        className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${categoryFilter === null
                            ? 'bg-primary-600 border-primary-600 text-white'
                            : 'bg-white dark:bg-surface-800 border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-300 hover:border-primary-400 dark:hover:border-primary-600'
                            }`}
                    >
                        All Categories
                    </button>
                    {categories.map((cat: Category) => (
                        <button
                            key={cat.category_id}
                            onClick={() => { setCategoryFilter(cat.category_id); setPage(1) }}
                            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${categoryFilter === cat.category_id
                                ? 'bg-primary-600 border-primary-600 text-white'
                                : 'bg-white dark:bg-surface-800 border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-300 hover:border-primary-400 dark:hover:border-primary-600'
                                }`}
                        >
                            {cat.name}
                        </button>
                    ))}
                </div>
            )}

            {isLoading ? <LoadingSpinner /> : (
                <div className="bg-white dark:bg-surface-800 rounded-2xl border border-surface-200 dark:border-surface-700 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-surface-50 dark:bg-surface-800 border-b border-surface-200 dark:border-surface-700">
                            <tr>
                                <th className="text-left px-4 py-3 font-semibold text-surface-700 dark:text-surface-300">
                                    <button className="group flex items-center gap-0.5 hover:text-primary-600 dark:hover:text-primary-400 transition-colors" onClick={() => handleSort('name')}>
                                        Product <SortIcon field="name" sortField={sortField} sortDir={sortDir} />
                                    </button>
                                </th>
                                <th className="text-left px-4 py-3 font-semibold text-surface-700 dark:text-surface-300">
                                    <button className="group flex items-center gap-0.5 hover:text-primary-600 dark:hover:text-primary-400 transition-colors" onClick={() => handleSort('sku')}>
                                        SKU <SortIcon field="sku" sortField={sortField} sortDir={sortDir} />
                                    </button>
                                </th>
                                <th className="text-left px-4 py-3 font-semibold text-surface-700 dark:text-surface-300">
                                    <button className="group flex items-center gap-0.5 hover:text-primary-600 dark:hover:text-primary-400 transition-colors" onClick={() => handleSort('selling_price')}>
                                        Price <SortIcon field="selling_price" sortField={sortField} sortDir={sortDir} />
                                    </button>
                                </th>
                                <th className="text-left px-4 py-3 font-semibold text-surface-700 dark:text-surface-300">
                                    <button className="group flex items-center gap-0.5 hover:text-primary-600 dark:hover:text-primary-400 transition-colors" onClick={() => handleSort('stock_quantity')}>
                                        Stock <SortIcon field="stock_quantity" sortField={sortField} sortDir={sortDir} />
                                    </button>
                                </th>
                                <th className="text-left px-4 py-3 font-semibold text-surface-700 dark:text-surface-300">Active</th>
                                <th className="text-left px-4 py-3 font-semibold text-surface-700 dark:text-surface-300">Featured</th>
                                <th className="text-left px-4 py-3 font-semibold text-surface-700 dark:text-surface-300">Promoted</th>
                                <th className="text-left px-4 py-3 font-semibold text-surface-700 dark:text-surface-300">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-100 dark:divide-surface-800">
                            {filtered.map((p: Product) => (
                                <tr key={p.product_id} className="hover:bg-surface-50 dark:hover:bg-surface-800/50">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-surface-100 dark:bg-surface-800 rounded-lg flex items-center justify-center shrink-0">
                                                {p.images[0] ? <img src={p.images[0].url} alt={p.name} className="w-full h-full object-cover rounded-lg" /> : '📦'}
                                            </div>
                                            <div>
                                                <span className="font-medium text-surface-900 dark:text-white line-clamp-1 block">{p.name}</span>
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {p.is_featured && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Featured</span>}
                                                    {p.is_promoted && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{p.promotion_badge || 'Promoted'}</span>}
                                                    {p.is_promoted && p.promotion_priority > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400">Priority {p.promotion_priority}</span>}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 font-mono text-surface-600 dark:text-surface-400">{p.sku}</td>
                                    <td className="px-4 py-3">
                                        <div>
                                            <span className="font-medium">₹{Number(p.selling_price).toLocaleString('en-IN')}</span>
                                            {p.mrp > p.selling_price && (
                                                <span className="text-xs text-surface-400 line-through ml-1">₹{Number(p.mrp).toLocaleString('en-IN')}</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-col gap-1">
                                            <span className={`badge ${STATUS_BADGE[p.stock_status]}`}>
                                                {p.stock_status.replace('_', ' ')}
                                            </span>
                                            <span className={`text-xs font-semibold tabular-nums ${p.stock_quantity === 0
                                                ? 'text-red-600 dark:text-red-400'
                                                : p.stock_quantity <= 5
                                                    ? 'text-red-500 dark:text-red-400'
                                                    : p.stock_quantity <= 10
                                                        ? 'text-amber-600 dark:text-amber-400'
                                                        : 'text-surface-500 dark:text-surface-400'
                                                }`}>
                                                {p.stock_quantity} units
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <button
                                            onClick={() => toggleMutation.mutate({ id: p.product_id, is_active: !p.is_active })}
                                            className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${p.is_active ? 'bg-primary-600' : 'bg-gray-300'}`}
                                        >
                                            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform mt-0.5 ${p.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                        </button>
                                    </td>
                                    <td className="px-4 py-3">
                                        <button
                                            onClick={() => productFlagsMutation.mutate({ id: p.product_id, data: { is_featured: !p.is_featured } })}
                                            className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${p.is_featured ? 'bg-primary-600' : 'bg-gray-300'}`}
                                        >
                                            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform mt-0.5 ${p.is_featured ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                        </button>
                                    </td>
                                    <td className="px-4 py-3">
                                        <button
                                            onClick={() => productFlagsMutation.mutate({ id: p.product_id, data: { is_promoted: !p.is_promoted } })}
                                            className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${p.is_promoted ? 'bg-orange-500' : 'bg-gray-300'}`}
                                        >
                                            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform mt-0.5 ${p.is_promoted ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                        </button>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-2">
                                            <Link to={`/products/${p.product_id}`} className="text-primary-600 dark:text-primary-400 hover:text-primary-600 transition-colors text-xs">View</Link>
                                            <Link to={`/admin/products/${p.product_id}/edit`} className="text-green-600 hover:text-primary-600 transition-colors text-xs">Edit</Link>
                                            <button
                                                onClick={() => deleteMutation.mutate(p.product_id)}
                                                className="text-red-500 hover:text-primary-600 transition-colors text-xs"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="flex items-center justify-center gap-2">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary text-sm disabled:opacity-40">← Prev</button>
                <span className="text-sm text-surface-600 dark:text-surface-400">Page {page}</span>
                <button disabled={!data || page * 50 >= data.total} onClick={() => setPage(p => p + 1)} className="btn-secondary text-sm disabled:opacity-40">Next →</button>
            </div>
        </div>
    )
}
