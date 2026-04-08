import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { productService } from '../../services/products'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import type { Product } from '../../types'

const STATUS_BADGE: Record<string, string> = {
    in_stock: 'bg-green-100 text-green-700',
    low_stock: 'bg-orange-100 text-orange-700',
    out_of_stock: 'bg-red-100 text-red-700',
}

export default function AdminProducts() {
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState('')
    const [importing, setImporting] = useState(false)
    const importInputRef = useRef<HTMLInputElement>(null)
    const qc = useQueryClient()

    const { data, isLoading } = useQuery({
        queryKey: ['admin', 'products', page],
        queryFn: () => productService.list({ page, size: 50, is_active: undefined }),
    })

    const deleteMutation = useMutation({
        mutationFn: (id: string) => productService.delete(id),
        onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['admin', 'products'] }); toast.success('Product deactivated') },
        onError: () => toast.error('Failed to delete'),
    })

    const toggleMutation = useMutation({
        mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
            productService.update(id, { is_active }),
        onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['admin', 'products'] }) },
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

    const filtered = data?.items.filter(p =>
        !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
    ) || []

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900">Products</h1>
                <div className="flex gap-2">
                    <button onClick={handleExport} className="btn-secondary text-sm">⬇ Export CSV</button>
                    <button onClick={() => importInputRef.current?.click()} disabled={importing} className="btn-secondary text-sm">
                        {importing ? 'Importing...' : '⬆ Import CSV'}
                    </button>
                    <input ref={importInputRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
                    <Link to="/admin/products/add" className="btn-primary text-sm">+ Add Product</Link>
                </div>
            </div>

            <div className="flex items-center gap-3">
                <input
                    type="search"
                    placeholder="Search by name or SKU..."
                    className="input max-w-sm"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                <span className="text-sm text-gray-500">{data?.total || 0} total</span>
            </div>

            {isLoading ? <LoadingSpinner /> : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="text-left px-4 py-3 font-semibold text-gray-700">Product</th>
                                <th className="text-left px-4 py-3 font-semibold text-gray-700">SKU</th>
                                <th className="text-left px-4 py-3 font-semibold text-gray-700">Price</th>
                                <th className="text-left px-4 py-3 font-semibold text-gray-700">Stock</th>
                                <th className="text-left px-4 py-3 font-semibold text-gray-700">Active</th>
                                <th className="text-left px-4 py-3 font-semibold text-gray-700">Featured</th>
                                <th className="text-left px-4 py-3 font-semibold text-gray-700">Promoted</th>
                                <th className="text-left px-4 py-3 font-semibold text-gray-700">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filtered.map((p: Product) => (
                                <tr key={p.product_id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
                                                {p.images[0] ? <img src={p.images[0].url} alt={p.name} className="w-full h-full object-cover rounded-lg" /> : '📦'}
                                            </div>
                                            <div>
                                                <span className="font-medium text-gray-900 line-clamp-1 block">{p.name}</span>
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {p.is_featured && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">Featured</span>}
                                                    {p.is_promoted && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">{p.promotion_badge || 'Promoted'}</span>}
                                                    {p.is_promoted && p.promotion_priority > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">Priority {p.promotion_priority}</span>}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 font-mono text-gray-600">{p.sku}</td>
                                    <td className="px-4 py-3">
                                        <div>
                                            <span className="font-medium">₹{Number(p.selling_price).toLocaleString('en-IN')}</span>
                                            {p.mrp > p.selling_price && (
                                                <span className="text-xs text-gray-400 line-through ml-1">₹{Number(p.mrp).toLocaleString('en-IN')}</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`badge ${STATUS_BADGE[p.stock_status]}`}>
                                            {p.stock_status.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <button
                                            onClick={() => toggleMutation.mutate({ id: p.product_id, is_active: !p.is_active })}
                                            className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${p.is_active ? 'bg-blue-600' : 'bg-gray-300'}`}
                                        >
                                            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform mt-0.5 ${p.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                        </button>
                                    </td>
                                    <td className="px-4 py-3">
                                        <button
                                            onClick={() => productFlagsMutation.mutate({ id: p.product_id, data: { is_featured: !p.is_featured } })}
                                            className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${p.is_featured ? 'bg-blue-600' : 'bg-gray-300'}`}
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
                                            <Link to={`/products/${p.product_id}`} className="text-blue-600 hover:underline text-xs">View</Link>
                                            <Link to={`/admin/products/${p.product_id}/edit`} className="text-green-600 hover:underline text-xs">Edit</Link>
                                            <button
                                                onClick={() => deleteMutation.mutate(p.product_id)}
                                                className="text-red-500 hover:underline text-xs"
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
                <span className="text-sm text-gray-600">Page {page}</span>
                <button disabled={!data || page * 50 >= data.total} onClick={() => setPage(p => p + 1)} className="btn-secondary text-sm disabled:opacity-40">Next →</button>
            </div>
        </div>
    )
}
