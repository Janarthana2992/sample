import { useState, useEffect, useMemo } from 'react'
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
    existingDeals,
    editingDealId,
    onSubmit,
    onCancel,
    isSubmitting,
    submitLabel,
}: {
    defaultValues?: Record<string, any>
    categories: Category[]
    products: Product[]
    existingDeals: Deal[]
    editingDealId?: string
    onSubmit: (data: any) => void
    onCancel: () => void
    isSubmitting: boolean
    submitLabel: string
}) {
    const { register, handleSubmit, control, reset, setValue } = useForm({
        defaultValues: defaultValues ?? { deal_type: 'percentage', applies_to: 'all_products', is_active: true, staff_visible: false },
    })
    const dealType = useWatch({ control, name: 'deal_type' })
    const appliesTo = useWatch({ control, name: 'applies_to' })
    const startDt = useWatch({ control, name: 'start_datetime' })
    const endDt = useWatch({ control, name: 'end_datetime' })

    // multi-select category_ids
    const [selCats, setSelCats] = useState<string[]>(defaultValues?.category_ids ?? [])
    // multi-select product_ids with search
    const [selProds, setSelProds] = useState<string[]>(defaultValues?.product_ids ?? [])
    const [prodSearch, setProdSearch] = useState('')
    const [pendingPayload, setPendingPayload] = useState<any>(null)

    useEffect(() => { reset(defaultValues) }, [])
    // Clear discount_value when switching to a type that has no value
    useEffect(() => {
        if (dealType === 'bogo' || dealType === 'free_shipping') setValue('discount_value', '')
    }, [dealType, setValue])

    const filteredProds = products.filter(p =>
        !prodSearch || p.name.toLowerCase().includes(prodSearch.toLowerCase()) || p.sku.toLowerCase().includes(prodSearch.toLowerCase())
    )
    // Cap display at 100 when no search is active; show all matches when searching
    const displayProds = prodSearch ? filteredProds : filteredProds.slice(0, 100)

    // ── Overlap detection ──────────────────────────────────────
    const overlaps = useMemo(() => {
        if (!startDt || !endDt) return []
        const newStart = new Date(startDt).getTime()
        const newEnd = new Date(endDt).getTime()
        if (isNaN(newStart) || isNaN(newEnd) || newEnd <= newStart) return []

        const conflicts: { dealName: string; reason: string }[] = []

        // Build a set of category IDs that the selected products belong to
        const selProdCategoryIds = new Set<string>()
        if (appliesTo === 'specific_skus' && selProds.length > 0) {
            for (const prodId of selProds) {
                const p = products.find(x => x.product_id === prodId)
                p?.category_ids?.forEach(cid => selProdCategoryIds.add(cid))
            }
        }

        for (const deal of existingDeals) {
            // Skip the deal being edited
            if (deal.deal_id === editingDealId) continue

            // Check time overlap
            const dStart = new Date(deal.start_datetime).getTime()
            const dEnd = new Date(deal.end_datetime).getTime()
            const timeOverlaps = newStart < dEnd && newEnd > dStart
            if (!timeOverlaps) continue

            const dCats = new Set(deal.category_ids ?? [])
            const dProds = new Set(deal.product_ids ?? [])

            // all_products existing deal conflicts with anything
            if (deal.applies_to === 'all_products' && appliesTo !== undefined) {
                conflicts.push({ dealName: deal.name, reason: 'covers all products' })
                continue
            }

            // New deal is all_products — conflicts with everything
            if (appliesTo === 'all_products' && deal.applies_to !== undefined) {
                conflicts.push({ dealName: deal.name, reason: `also applies to ${deal.applies_to === 'specific_category' ? 'overlapping categories' : 'overlapping products'}` })
                continue
            }

            // category ↔ category overlap
            if (appliesTo === 'specific_category' && deal.applies_to === 'specific_category') {
                const shared = selCats.filter(c => dCats.has(c))
                if (shared.length > 0) {
                    const sharedNames = shared.map(c => categories.find(x => x.category_id === c)?.name ?? c)
                    conflicts.push({ dealName: deal.name, reason: `shares categories: ${sharedNames.join(', ')}` })
                }
            }

            // product ↔ product overlap
            if (appliesTo === 'specific_skus' && deal.applies_to === 'specific_skus') {
                const shared = selProds.filter(p => dProds.has(p))
                if (shared.length > 0) {
                    const sharedNames = shared.map(pid => products.find(x => x.product_id === pid)?.name ?? pid)
                    conflicts.push({ dealName: deal.name, reason: `shares products: ${sharedNames.slice(0, 3).join(', ')}${shared.length > 3 ? ` +${shared.length - 3} more` : ''}` })
                }
            }

            // product ↔ category: existing category deal covers a category that new specific products belong to
            if (appliesTo === 'specific_skus' && deal.applies_to === 'specific_category' && selProdCategoryIds.size > 0) {
                const sharedCats = [...selProdCategoryIds].filter(c => dCats.has(c))
                if (sharedCats.length > 0) {
                    const sharedNames = sharedCats.map(c => categories.find(x => x.category_id === c)?.name ?? c)
                    conflicts.push({ dealName: deal.name, reason: `already covers the categories these products belong to: ${sharedNames.join(', ')}` })
                }
            }

            // category ↔ product: existing product deal, new deal covers category that those products belong to
            if (appliesTo === 'specific_category' && deal.applies_to === 'specific_skus' && dProds.size > 0) {
                const affectedProds = products.filter(p =>
                    dProds.has(p.product_id) && p.category_ids?.some(c => selCats.includes(c))
                )
                if (affectedProds.length > 0) {
                    const names = affectedProds.slice(0, 3).map(p => p.name)
                    conflicts.push({ dealName: deal.name, reason: `has specific products in your selected categories: ${names.join(', ')}${affectedProds.length > 3 ? ` +${affectedProds.length - 3} more` : ''}` })
                }
            }
        }
        return conflicts
    }, [appliesTo, selCats, selProds, startDt, endDt, existingDeals, editingDealId, products, categories])
    // ──────────────────────────────────────────────────────────

    const submit = (data: any) => {
        const payload: any = { ...data }
        payload.discount_value = (data.deal_type === 'bogo' || data.deal_type === 'free_shipping')
            ? undefined
            : normalizeOptionalNumber(payload.discount_value)
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

        if (overlaps.length > 0) {
            setPendingPayload(payload)
            return
        }
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
                        <option value="percentage">Percentage Discount</option>
                        <option value="flat">Fixed Amount Off</option>
                        <option value="bogo">Buy X Get Y</option>
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
                {(dealType === 'bogo' || dealType === 'free_shipping') ? (
                    <div className="flex items-center rounded-xl bg-surface-100 dark:bg-surface-800 p-3 text-sm text-surface-500 dark:text-surface-400">
                        {dealType === 'bogo'
                            ? '🛍️ BOGO — 50% off cart applied automatically'
                            : '🚚 Free Shipping — no discount value needed'}
                    </div>
                ) : (
                    <div>
                        <label className="label">
                            {dealType === 'percentage' ? 'Discount (%)' : 'Discount Amount (₹)'}
                        </label>
                        <div className="relative">
                            {dealType !== 'percentage' && (
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 text-sm pointer-events-none">₹</span>
                            )}
                            <input
                                type="number"
                                step="0.01"
                                min={0}
                                max={dealType === 'percentage' ? 100 : undefined}
                                className={`input${dealType !== 'percentage' ? ' pl-7' : ''}`}
                                placeholder={dealType === 'percentage' ? 'e.g. 10' : 'e.g. 200'}
                                {...register('discount_value')}
                            />
                            {dealType === 'percentage' && (
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 text-sm pointer-events-none">%</span>
                            )}
                        </div>
                    </div>
                )}
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
                    <div className="flex flex-wrap gap-2 p-3 border border-surface-300 dark:border-surface-600 rounded-lg min-h-[48px]">
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
                                    ? 'bg-primary-600 text-white border-primary-600'
                                    : 'bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-300 border-surface-300 dark:border-surface-600 hover:border-blue-400'
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
                    <div className="border border-surface-300 dark:border-surface-600 rounded-lg max-h-48 overflow-y-auto divide-y divide-surface-100 dark:divide-surface-800">
                        {displayProds.map(p => (
                            <label key={p.product_id} className="flex items-center gap-3 px-3 py-2 hover:bg-surface-50 dark:hover:bg-surface-800/50 cursor-pointer">
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
                                <span className="text-sm font-mono text-surface-500 dark:text-surface-400 shrink-0">{p.sku}</span>
                                <span className="text-sm text-surface-900 dark:text-white truncate">{p.name}</span>
                            </label>
                        ))}
                        {displayProds.length === 0 && <p className="text-sm text-surface-400 p-3">No products found</p>}
                    </div>
                    {selProds.length === 0 && <p className="text-xs text-red-500 mt-1">Select at least one product</p>}
                    {selProds.length > 0 && <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">{selProds.length} product(s) selected</p>}
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

            {overlaps.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-sm text-amber-800 dark:text-amber-300">
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                    <span>{overlaps.length} overlapping deal{overlaps.length > 1 ? 's' : ''} — you'll be asked to confirm before saving</span>
                </div>
            )}

            <div className="flex gap-3">
                <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="btn-primary flex-1">
                    {isSubmitting ? 'Saving...' : submitLabel}
                </button>
            </div>

            {/* Conflict confirmation modal */}
            {pendingPayload && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-surface-900 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
                        <div className="flex items-center gap-3">
                            <span className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                                <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                </svg>
                            </span>
                            <div>
                                <h3 className="font-semibold text-surface-900 dark:text-white">Overlapping deals detected</h3>
                                <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">{overlaps.length} deal{overlaps.length > 1 ? 's' : ''} overlap with this one</p>
                            </div>
                        </div>
                        <ul className="space-y-1">
                            {overlaps.map((c, i) => (
                                <li key={i} className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                                    <span className="shrink-0 mt-0.5 w-3.5 h-3.5 rounded-full bg-amber-200 dark:bg-amber-800 flex items-center justify-center text-[9px] font-bold">{i + 1}</span>
                                    <span><strong>{c.dealName}</strong> — {c.reason}</span>
                                </li>
                            ))}
                        </ul>
                        <p className="text-sm text-surface-600 dark:text-surface-400">Multiple active deals may stack at checkout. Save anyway?</p>
                        <div className="flex gap-3">
                            <button type="button" onClick={() => setPendingPayload(null)} className="btn-secondary flex-1">Cancel</button>
                            <button type="button" onClick={() => { onSubmit(pendingPayload); setPendingPayload(null) }} className="btn-primary flex-1">Save Anyway</button>
                        </div>
                    </div>
                </div>
            )}
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
        onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['admin', 'deals'] }); setShowCreate(false); toast.success('Deal created!') },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to create deal'),
    })

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: object }) => productService.updateDeal(id, data),
        onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['admin', 'deals'] }); setEditDeal(null); toast.success('Deal updated') },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update deal'),
    })

    const toggleMutation = useMutation({
        mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
            productService.updateDeal(id, { is_active }),
        onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['admin', 'deals'] }) },
    })

    const deleteMutation = useMutation({
        mutationFn: (id: string) => productService.deleteDeal(id),
        onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['admin', 'deals'] }); toast.success('Deal deleted') },
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
                <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Deals & Offers</h1>
                <button onClick={() => { setShowCreate(v => !v); setEditDeal(null) }} className="btn-primary text-sm">
                    {showCreate ? '✕ Cancel' : '+ Create Deal'}
                </button>
            </div>

            {showCreate && (
                <div className="card space-y-4">
                    <h2 className="font-semibold text-surface-900 dark:text-white">New Deal</h2>
                    <DealForm
                        categories={categories as Category[]}
                        products={products}
                        existingDeals={deals ?? []}
                        onSubmit={data => createMutation.mutate(data)}
                        onCancel={() => setShowCreate(false)}
                        isSubmitting={createMutation.isPending}
                        submitLabel="Create Deal"
                    />
                </div>
            )}

            {/* Edit modal */}
            {editDeal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setEditDeal(null)}>
                    <div className="bg-white dark:bg-surface-900 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-4" onClick={e => e.stopPropagation()}>
                        <h2 className="font-semibold text-surface-900 dark:text-white text-lg">Edit Deal</h2>
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
                            existingDeals={deals ?? []}
                            editingDealId={editDeal.deal_id}
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
                                <h3 className="font-semibold text-surface-900 dark:text-white">{deal.name}</h3>
                                <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
                                    {deal.deal_type.replace(/_/g, ' ')} · {deal.applies_to.replace(/_/g, ' ')}
                                    {deal.applies_to === 'specific_category' && deal.category_ids?.length
                                        ? ` (${deal.category_ids.length} categor${deal.category_ids.length === 1 ? 'y' : 'ies'})`
                                        : ''}
                                    {deal.applies_to === 'specific_skus' && deal.product_ids?.length
                                        ? ` (${deal.product_ids.length} product${deal.product_ids.length === 1 ? '' : 's'})`
                                        : ''}
                                </p>
                                {deal.discount_value && (
                                    <p className="text-sm text-surface-700 dark:text-surface-300 mt-1">
                                        Discount: {deal.deal_type === 'percentage' ? `${deal.discount_value}%` : deal.deal_type === 'free_shipping' ? 'Free shipping' : `₹${deal.discount_value}`}
                                    </p>
                                )}
                                <p className="text-xs text-surface-400 mt-1">
                                    {new Date(deal.start_datetime).toLocaleDateString('en-IN')} → {new Date(deal.end_datetime).toLocaleDateString('en-IN')}
                                    · {deal.current_uses}{deal.max_uses ? `/${deal.max_uses}` : ''} uses
                                </p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0 ml-3">
                                <button
                                    onClick={() => { setEditDeal(deal); setShowCreate(false) }}
                                    className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-600 transition-colors"
                                >
                                    Edit
                                </button>
                                <button
                                    onClick={() => toggleMutation.mutate({ id: deal.deal_id, is_active: !deal.is_active })}
                                    className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${deal.is_active ? 'bg-primary-600' : 'bg-gray-300'}`}
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
                            <span className="badge bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 mt-2 inline-block">Staff visible</span>
                        )}
                    </div>
                ))}
                {deals?.length === 0 && <p className="text-surface-400 text-sm py-8 text-center">No deals yet.</p>}
            </div>
        </div>
    )
}
