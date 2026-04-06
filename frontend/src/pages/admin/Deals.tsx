import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import toast from 'react-hot-toast'
import { productService } from '../../services/products'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import type { Category, Deal, Product } from '../../types'

function normalizeOptionalNumber(value: unknown) {
    if (value === '' || value === null || value === undefined) return undefined
    return value
}

// ── shared form component ────────────────────────────────────
function DealForm({
    defaultValues,
    categories,
    products,
    onSubmit,
    onCancel,
    isSubmitting,
    submitLabel,
}: {
    defaultValues?: Record<string, any>
    categories: Category[]
    products: Product[]
    onSubmit: (data: any) => void
    onCancel: () => void
    isSubmitting: boolean
    submitLabel: string
}) {
    const { register, handleSubmit, control, reset, setValue } = useForm({ defaultValues })
    const appliesTo = useWatch({ control, name: 'applies_to' })

    // multi-select category_ids
    const [selCats, setSelCats] = useState<string[]>(defaultValues?.category_ids ?? [])
    // multi-select product_ids with search
    const [selProds, setSelProds] = useState<string[]>(defaultValues?.product_ids ?? [])
    const [prodSearch, setProdSearch] = useState('')

    useEffect(() => { reset(defaultValues) }, [])

    const filteredProds = products.filter(p =>
        !prodSearch || p.name.toLowerCase().includes(prodSearch.toLowerCase()) || p.sku.toLowerCase().includes(prodSearch.toLowerCase())
    )
    // Cap display at 100 when no search is active; show all matches when searching
    const displayProds = prodSearch ? filteredProds : filteredProds.slice(0, 100)

    const submit = (data: any) => {
        const payload: any = { ...data }
        payload.discount_value = normalizeOptionalNumber(payload.discount_value)
        payload.min_cart_value = normalizeOptionalNumber(payload.min_cart_value)
        payload.max_uses = normalizeOptionalNumber(payload.max_uses)

        if (data.applies_to === 'specific_category' && selCats.length === 0) {
            toast.error('Select at least one category')
            return
        }
        if (data.applies_to === 'specific_skus' && selProds.length === 0) {
            toast.error('Select at least one product')
            return
        }

        if (data.applies_to === 'specific_category') payload.category_ids = selCats
        else if (data.applies_to === 'specific_skus') payload.product_ids = selProds
        onSubmit(payload)
    }

    return (
        <form onSubmit={handleSubmit(submit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="label">Deal Name</label>
                    <input className="input" {...register('name', { required: true })} />
                </div>
                <div>
                    <label className="label">Deal Type</label>
                    <select className="input" {...register('deal_type', { required: true })}>
                        <option value="percentage_discount">Percentage Discount</option>
                        <option value="fixed_amount_off">Fixed Amount Off</option>
                        <option value="buy_x_get_y">Buy X Get Y</option>
                        <option value="free_shipping">Free Shipping</option>
                    </select>
                </div>
                <div>
                    <label className="label">Applies To</label>
                    <select className="input" {...register('applies_to', { required: true })}>
                        <option value="all_products">All Products</option>
                        <option value="specific_category">Specific Category</option>
                        <option value="specific_skus">Specific SKUs</option>
                    </select>
                </div>
                <div>
                    <label className="label">Discount Value</label>
                    <input type="number" step="0.01" className="input" {...register('discount_value')} />
                </div>
                <div>
                    <label className="label">Start Date & Time</label>
                    <input type="datetime-local" className="input" {...register('start_datetime', { required: true })} />
                </div>
                <div>
                    <label className="label">End Date & Time</label>
                    <input type="datetime-local" className="input" {...register('end_datetime', { required: true })} />
                </div>
                <div>
                    <label className="label">Min Cart Value (₹)</label>
                    <input type="number" step="0.01" className="input" {...register('min_cart_value')} />
                </div>
                <div>
                    <label className="label">Max Uses (optional)</label>
                    <input type="number" className="input" {...register('max_uses')} />
                </div>
            </div>

            {/* Specific category picker */}
            {appliesTo === 'specific_category' && (
                <div>
                    <label className="label">Select Categories *</label>
                    <div className="flex flex-wrap gap-2 p-3 border border-gray-300 rounded-lg min-h-[48px]">
                        {categories.map(cat => (
                            <button
                                key={cat.category_id}
                                type="button"
                                onClick={() => setSelCats(prev =>
                                    prev.includes(cat.category_id)
                                        ? prev.filter(id => id !== cat.category_id)
                                        : [...prev, cat.category_id]
                                )}
                                className={`px-3 py-1 rounded-lg text-sm border transition-colors ${selCats.includes(cat.category_id)
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                                    }`}
                            >
                                {cat.name}
                            </button>
                        ))}
                    </div>
                    {selCats.length === 0 && <p className="text-xs text-red-500 mt-1">Select at least one category</p>}
                </div>
            )}

            {/* Specific SKU / product picker */}
            {appliesTo === 'specific_skus' && (
                <div>
                    <label className="label">Select Products *</label>
                    <input
                        type="search"
                        className="input mb-2"
                        placeholder="Search by name or SKU..."
                        value={prodSearch}
                        onChange={e => setProdSearch(e.target.value)}
                    />
                    <div className="border border-gray-300 rounded-lg max-h-48 overflow-y-auto divide-y divide-gray-100">
                        {displayProds.map(p => (
                            <label key={p.product_id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={selProds.includes(p.product_id)}
                                    onChange={() => setSelProds(prev =>
                                        prev.includes(p.product_id)
                                            ? prev.filter(id => id !== p.product_id)
                                            : [...prev, p.product_id]
                                    )}
                                    className="rounded"
                                />
                                <span className="text-sm font-mono text-gray-500 shrink-0">{p.sku}</span>
                                <span className="text-sm text-gray-900 truncate">{p.name}</span>
                            </label>
                        ))}
                        {displayProds.length === 0 && <p className="text-sm text-gray-400 p-3">No products found</p>}
                    </div>
                    {selProds.length === 0 && <p className="text-xs text-red-500 mt-1">Select at least one product</p>}
                    {selProds.length > 0 && <p className="text-xs text-gray-500 mt-1">{selProds.length} product(s) selected</p>}
                </div>
            )}

            <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" {...register('is_active')} defaultChecked />
                    <span className="text-sm">Active</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" {...register('staff_visible')} />
                    <span className="text-sm">Visible to Staff</span>
                </label>
            </div>
            <div className="flex gap-3">
                <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="btn-primary flex-1">
                    {isSubmitting ? 'Saving...' : submitLabel}
                </button>
            </div>
        </form>
    )
}

export default function AdminDeals() {
    const [showCreate, setShowCreate] = useState(false)
    const [editDeal, setEditDeal] = useState<Deal | null>(null)
    const qc = useQueryClient()

    const { data: deals, isLoading } = useQuery({
        queryKey: ['admin', 'deals'],
        queryFn: () => productService.listDeals(),
    })

    const { data: categories = [] } = useQuery<Category[]>({
        queryKey: ['categories'],
        queryFn: productService.listCategories,
    })

    const { data: productsData } = useQuery({
        queryKey: ['admin', 'products-all'],
        queryFn: async () => {
            // Fetch all products across pages (API max is 100 per page)
            const first = await productService.list({ size: 100, page: 1, is_active: undefined })
            const total: Product[] = [...(first.items as Product[])]
            const pages = Math.ceil(first.total / 100)
            for (let p = 2; p <= pages; p++) {
                const r = await productService.list({ size: 100, page: p, is_active: undefined })
                total.push(...(r.items as Product[]))
            }
            return total
        },
    })
    const products: Product[] = (productsData as any) ?? []

    const createMutation = useMutation({
        mutationFn: (data: object) => productService.createDeal(data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'deals'] }); setShowCreate(false); toast.success('Deal created!') },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to create deal'),
    })

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: object }) => productService.updateDeal(id, data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'deals'] }); setEditDeal(null); toast.success('Deal updated') },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update deal'),
    })

    const toggleMutation = useMutation({
        mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
            productService.updateDeal(id, { is_active }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'deals'] }),
    })

    const deleteMutation = useMutation({
        mutationFn: (id: string) => productService.deleteDeal(id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'deals'] }); toast.success('Deal deleted') },
    })

    const toDatetimeLocal = (iso: string) => {
        const d = new Date(iso)
        const pad = (n: number) => String(n).padStart(2, '0')
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    }

    if (isLoading) return <LoadingSpinner />

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900">Deals & Offers</h1>
                <button onClick={() => { setShowCreate(v => !v); setEditDeal(null) }} className="btn-primary text-sm">
                    {showCreate ? '✕ Cancel' : '+ Create Deal'}
                </button>
            </div>

            {showCreate && (
                <div className="card space-y-4">
                    <h2 className="font-semibold text-gray-900">New Deal</h2>
                    <DealForm
                        categories={categories as Category[]}
                        products={products}
                        onSubmit={data => createMutation.mutate(data)}
                        onCancel={() => setShowCreate(false)}
                        isSubmitting={createMutation.isPending}
                        submitLabel="Create Deal"
                    />
                </div>
            )}

            {/* Edit modal */}
            {editDeal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setEditDeal(null)}>
                    <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-4" onClick={e => e.stopPropagation()}>
                        <h2 className="font-semibold text-gray-900 text-lg">Edit Deal</h2>
                        <DealForm
                            key={editDeal.deal_id}
                            defaultValues={{
                                name: editDeal.name,
                                deal_type: editDeal.deal_type,
                                applies_to: editDeal.applies_to,
                                discount_value: editDeal.discount_value ?? '',
                                min_cart_value: editDeal.min_cart_value ?? '',
                                start_datetime: toDatetimeLocal(editDeal.start_datetime),
                                end_datetime: toDatetimeLocal(editDeal.end_datetime),
                                max_uses: editDeal.max_uses ?? '',
                                is_active: editDeal.is_active,
                                staff_visible: editDeal.staff_visible,
                                category_ids: editDeal.category_ids ?? [],
                                product_ids: editDeal.product_ids ?? [],
                            }}
                            categories={categories as Category[]}
                            products={products}
                            onSubmit={data => updateMutation.mutate({ id: editDeal.deal_id, data })}
                            onCancel={() => setEditDeal(null)}
                            isSubmitting={updateMutation.isPending}
                            submitLabel="Save Changes"
                        />
                    </div>
                </div>
            )}

            <div className="space-y-3">
                {deals?.map((deal: Deal) => (
                    <div key={deal.deal_id} className="card">
                        <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-gray-900">{deal.name}</h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    {deal.deal_type.replace(/_/g, ' ')} · {deal.applies_to.replace(/_/g, ' ')}
                                    {deal.applies_to === 'specific_category' && deal.category_ids?.length
                                        ? ` (${deal.category_ids.length} categor${deal.category_ids.length === 1 ? 'y' : 'ies'})`
                                        : ''}
                                    {deal.applies_to === 'specific_skus' && deal.product_ids?.length
                                        ? ` (${deal.product_ids.length} product${deal.product_ids.length === 1 ? '' : 's'})`
                                        : ''}
                                </p>
                                {deal.discount_value && (
                                    <p className="text-sm text-gray-700 mt-1">
                                        Discount: {deal.deal_type === 'percentage_discount' ? `${deal.discount_value}%` : `₹${deal.discount_value}`}
                                    </p>
                                )}
                                <p className="text-xs text-gray-400 mt-1">
                                    {new Date(deal.start_datetime).toLocaleDateString('en-IN')} → {new Date(deal.end_datetime).toLocaleDateString('en-IN')}
                                    · {deal.current_uses}{deal.max_uses ? `/${deal.max_uses}` : ''} uses
                                </p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0 ml-3">
                                <button
                                    onClick={() => { setEditDeal(deal); setShowCreate(false) }}
                                    className="text-sm text-blue-600 hover:underline"
                                >
                                    Edit
                                </button>
                                <button
                                    onClick={() => toggleMutation.mutate({ id: deal.deal_id, is_active: !deal.is_active })}
                                    className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${deal.is_active ? 'bg-blue-600' : 'bg-gray-300'}`}
                                >
                                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow mt-0.5 transition-transform ${deal.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                </button>
                                <button
                                    onClick={() => { if (confirm(`Delete "${deal.name}"?`)) deleteMutation.mutate(deal.deal_id) }}
                                    className="text-red-500 hover:text-red-700 text-sm"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                        {deal.staff_visible && (
                            <span className="badge bg-purple-100 text-purple-700 mt-2 inline-block">Staff visible</span>
                        )}
                    </div>
                ))}
                {deals?.length === 0 && <p className="text-gray-400 text-sm py-8 text-center">No deals yet.</p>}
            </div>
        </div>
    )
}
