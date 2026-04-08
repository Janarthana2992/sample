import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { productService } from '../../services/products'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import type { Category, ProductVariant } from '../../types'

export default function EditProduct() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const qc = useQueryClient()

    const { data: product, isLoading: productLoading } = useQuery({
        queryKey: ['product', id],
        queryFn: () => productService.get(id!),
        enabled: !!id,
    })

    const { data: categories } = useQuery<Category[]>({
        queryKey: ['categories'],
        queryFn: productService.listCategories,
    })

    const [form, setForm] = useState({
        name: '', description: '', mrp: '', selling_price: '',
        stock_quantity: '0', stock_status: 'in_stock',
        category_ids: [] as string[], tags: '', is_active: true,
        is_featured: false, is_promoted: false, promotion_priority: '0', promotion_badge: '',
    })
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [initialized, setInitialized] = useState(false)
    const [tab, setTab] = useState<'details' | 'variants'>('details')

    // Variant form state
    const [variantForm, setVariantForm] = useState({ sku: '', color: '', size: '', stock_quantity: '0', price_adjustment: '0' })
    const [editingVariant, setEditingVariant] = useState<ProductVariant | null>(null)

    const { data: variants = [], isLoading: variantsLoading } = useQuery<ProductVariant[]>({
        queryKey: ['variants', id],
        queryFn: () => productService.listVariants(id!),
        enabled: !!id,
    })

    const createVariantMutation = useMutation({
        mutationFn: (data: object) => productService.createVariant(id!, data),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: ['variants', id] })
            toast.success('Variant added')
            setVariantForm({ sku: '', color: '', size: '', stock_quantity: '0', price_adjustment: '0' })
        },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to add variant'),
    })

    const updateVariantMutation = useMutation({
        mutationFn: ({ variantId, data }: { variantId: string; data: object }) =>
            productService.updateVariant(id!, variantId, data),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: ['variants', id] })
            toast.success('Variant updated')
            setEditingVariant(null)
        },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update variant'),
    })

    const deleteVariantMutation = useMutation({
        mutationFn: (variantId: string) => productService.deleteVariant(id!, variantId),
        onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['variants', id] }); toast.success('Variant deleted') },
    })

    const handleAddVariant = () => {
        if (!variantForm.sku) return toast.error('SKU required')
        createVariantMutation.mutate({
            sku: variantForm.sku,
            color: variantForm.color || undefined,
            size: variantForm.size || undefined,
            stock_quantity: parseInt(variantForm.stock_quantity) || 0,
            price_adjustment: parseFloat(variantForm.price_adjustment) || 0,
        })
    }
    useEffect(() => {
        if (product && !initialized) {
            setForm({
                name: product.name,
                description: product.description,
                mrp: String(product.mrp),
                selling_price: String(product.selling_price),
                stock_quantity: String(product.stock_quantity),
                stock_status: product.stock_status,
                category_ids: [], // categories not returned in product detail; keep empty to not overwrite
                tags: (product.tags ?? []).join(', '),
                is_active: product.is_active,
                is_featured: product.is_featured,
                is_promoted: product.is_promoted,
                promotion_priority: String(product.promotion_priority ?? 0),
                promotion_badge: product.promotion_badge ?? '',
            })
            setInitialized(true)
        }
    }, [product, initialized])

    const updateMutation = useMutation({
        mutationFn: (data: object) => productService.update(id!, data),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: ['admin', 'products'] })
            await qc.invalidateQueries({ queryKey: ['product', id] })
            toast.success('Product updated!')
            navigate('/admin/products')
        },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update product'),
    })

    const validate = () => {
        const e: Record<string, string> = {}
        if (!form.name || form.name.length < 3) e.name = 'Name must be ≥ 3 chars'
        if (!form.description || form.description.length < 20) e.description = 'Description must be ≥ 20 chars'
        if (!form.mrp || parseFloat(form.mrp) <= 0) e.mrp = 'MRP must be > 0'
        if (!form.selling_price || parseFloat(form.selling_price) <= 0) e.selling_price = 'Selling price must be > 0'
        if (parseFloat(form.selling_price) > parseFloat(form.mrp)) e.selling_price = 'Selling price must be ≤ MRP'
        setErrors(e)
        return Object.keys(e).length === 0
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!validate()) return

        const payload: Record<string, unknown> = {
            name: form.name,
            description: form.description,
            mrp: parseFloat(form.mrp),
            selling_price: parseFloat(form.selling_price),
            stock_quantity: parseInt(form.stock_quantity),
            stock_status: form.stock_status,
            tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
            is_active: form.is_active,
            is_featured: form.is_featured,
            is_promoted: form.is_promoted,
            promotion_priority: parseInt(form.promotion_priority) || 0,
            promotion_badge: form.promotion_badge.trim() || null,
        }
        if (form.category_ids.length > 0) {
            payload.category_ids = form.category_ids
        }
        updateMutation.mutate(payload)
    }

    const toggleCategory = (id: string) => {
        setForm(f => ({
            ...f,
            category_ids: f.category_ids.includes(id) ? f.category_ids.filter(c => c !== id) : [...f.category_ids, id]
        }))
    }

    if (productLoading) return <LoadingSpinner />
    if (!product) return <div className="text-center py-16 text-gray-500">Product not found</div>

    return (
        <div className="max-w-3xl space-y-6">
            <div className="flex items-center gap-3">
                <button onClick={() => navigate('/admin/products')} className="text-gray-500 hover:text-gray-700">←</button>
                <h1 className="text-2xl font-bold text-gray-900">Edit Product</h1>
                <span className="text-sm text-gray-400 font-mono">{product.sku}</span>
            </div>

            {/* Tab bar */}
            <div className="flex gap-1 border-b border-gray-200">
                {(['details', 'variants'] as const).map(t => (
                    <button key={t} onClick={() => setTab(t)}
                        className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
                        {t}
                        {t === 'variants' && variants.length > 0 && <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 rounded-full px-1.5">{variants.length}</span>}
                    </button>
                ))}
            </div>

            {tab === 'details' && (
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Basic Info */}
                    <div className="card space-y-4">
                        <h2 className="font-semibold text-gray-900">Basic Info</h2>

                        <div>
                            <label className="label">Product Name *</label>
                            <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                        </div>

                        <div>
                            <label className="label">Description * (min 20 chars)</label>
                            <textarea
                                className="input min-h-[120px] resize-y"
                                value={form.description}
                                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            />
                            {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description}</p>}
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="label">MRP (₹) *</label>
                                <input type="number" step="0.01" className="input" value={form.mrp} onChange={e => setForm(f => ({ ...f, mrp: e.target.value }))} />
                                {errors.mrp && <p className="text-red-500 text-xs mt-1">{errors.mrp}</p>}
                            </div>
                            <div>
                                <label className="label">Selling Price (₹) *</label>
                                <input type="number" step="0.01" className="input" value={form.selling_price} onChange={e => setForm(f => ({ ...f, selling_price: e.target.value }))} />
                                {errors.selling_price && <p className="text-red-500 text-xs mt-1">{errors.selling_price}</p>}
                            </div>
                            <div>
                                <label className="label">Stock Quantity</label>
                                <input type="number" min={0} className="input" value={form.stock_quantity} onChange={e => setForm(f => ({ ...f, stock_quantity: e.target.value }))} />
                            </div>
                        </div>

                        <div>
                            <label className="label">Stock Status</label>
                            <select className="input" value={form.stock_status} onChange={e => setForm(f => ({ ...f, stock_status: e.target.value }))}>
                                <option value="in_stock">In Stock</option>
                                <option value="low_stock">Low Stock</option>
                                <option value="out_of_stock">Out of Stock</option>
                            </select>
                        </div>
                    </div>

                    {/* Categories */}
                    <div className="card space-y-3">
                        <h2 className="font-semibold text-gray-900">Update Categories <span className="text-xs text-gray-400 font-normal">(select to reassign; leave blank to keep existing)</span></h2>
                        <div className="flex flex-wrap gap-2">
                            {categories?.map(cat => (
                                <button
                                    key={cat.category_id}
                                    type="button"
                                    onClick={() => toggleCategory(cat.category_id)}
                                    className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${form.category_ids.includes(cat.category_id)
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                                        }`}
                                >
                                    {cat.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Tags */}
                    <div className="card space-y-3">
                        <h2 className="font-semibold text-gray-900">Tags</h2>
                        <input
                            className="input"
                            placeholder="electronics, gaming, accessories (comma-separated)"
                            value={form.tags}
                            onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                        />
                    </div>

                    <div className="card space-y-4">
                        <h2 className="font-semibold text-gray-900">Promotion</h2>
                        <div className="grid grid-cols-2 gap-4">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <button
                                    type="button"
                                    onClick={() => setForm(f => ({ ...f, is_featured: !f.is_featured }))}
                                    className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${form.is_featured ? 'bg-blue-600' : 'bg-gray-300'}`}
                                >
                                    <span className={`inline-block h-5 w-5 rounded-full bg-white shadow mt-0.5 transition-transform ${form.is_featured ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                </button>
                                <span className="text-sm font-medium text-gray-700">Admin featured product</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer">
                                <button
                                    type="button"
                                    onClick={() => setForm(f => ({ ...f, is_promoted: !f.is_promoted }))}
                                    className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${form.is_promoted ? 'bg-orange-500' : 'bg-gray-300'}`}
                                >
                                    <span className={`inline-block h-5 w-5 rounded-full bg-white shadow mt-0.5 transition-transform ${form.is_promoted ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                </button>
                                <span className="text-sm font-medium text-gray-700">Promote this product</span>
                            </label>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="label">Promotion Priority</label>
                                <input type="number" min={0} className="input" value={form.promotion_priority} onChange={e => setForm(f => ({ ...f, promotion_priority: e.target.value }))} />
                            </div>
                            <div>
                                <label className="label">Promo Badge</label>
                                <input className="input" maxLength={60} placeholder="Trending, Editor's Pick, Hot Deal..." value={form.promotion_badge} onChange={e => setForm(f => ({ ...f, promotion_badge: e.target.value }))} />
                            </div>
                        </div>
                    </div>

                    {/* Current Images (read-only display) */}
                    {product.images.length > 0 && (
                        <div className="card space-y-3">
                            <h2 className="font-semibold text-gray-900">Current Images</h2>
                            <div className="flex gap-2 flex-wrap">
                                {product.images.map(img => (
                                    <img key={img.image_id} src={img.url} alt="" className="w-20 h-20 rounded-lg object-cover border border-gray-200" />
                                ))}
                            </div>
                            <p className="text-xs text-gray-400">Image management (add/remove) coming soon.</p>
                        </div>
                    )}

                    {/* Active toggle */}
                    <div className="card">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <button
                                type="button"
                                onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                                className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${form.is_active ? 'bg-blue-600' : 'bg-gray-300'}`}
                            >
                                <span className={`inline-block h-5 w-5 rounded-full bg-white shadow mt-0.5 transition-transform ${form.is_active ? 'translate-x-5' : 'translate-x-0.5'}`} />
                            </button>
                            <span className="text-sm font-medium text-gray-700">Active (visible to customers)</span>
                        </label>
                    </div>

                    <div className="flex gap-3">
                        <button type="button" onClick={() => navigate('/admin/products')} className="btn-secondary">Cancel</button>
                        <button type="submit" disabled={updateMutation.isPending} className="btn-primary flex-1">
                            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            )}

            {tab === 'variants' && (
                <div className="space-y-4">
                    {/* Add variant form */}
                    <div className="card space-y-4">
                        <h2 className="font-semibold text-gray-900">{editingVariant ? 'Edit Variant' : 'Add Variant'}</h2>
                        <div className="grid grid-cols-2 gap-4">
                            {!editingVariant && (
                                <div>
                                    <label className="label">SKU *</label>
                                    <input className="input font-mono uppercase" value={variantForm.sku} onChange={e => setVariantForm(f => ({ ...f, sku: e.target.value }))} placeholder="e.g. TSHIRT-RED-L" />
                                </div>
                            )}
                            <div>
                                <label className="label">Color</label>
                                <input className="input" value={editingVariant ? (editingVariant.color || '') : variantForm.color} onChange={e => editingVariant ? setEditingVariant(v => v ? { ...v, color: e.target.value } : v) : setVariantForm(f => ({ ...f, color: e.target.value }))} placeholder="e.g. Red" />
                            </div>
                            <div>
                                <label className="label">Size</label>
                                <input className="input" value={editingVariant ? (editingVariant.size || '') : variantForm.size} onChange={e => editingVariant ? setEditingVariant(v => v ? { ...v, size: e.target.value } : v) : setVariantForm(f => ({ ...f, size: e.target.value }))} placeholder="e.g. L" />
                            </div>
                            <div>
                                <label className="label">Stock Quantity</label>
                                <input type="number" min={0} className="input" value={editingVariant ? editingVariant.stock_quantity : variantForm.stock_quantity} onChange={e => editingVariant ? setEditingVariant(v => v ? { ...v, stock_quantity: parseInt(e.target.value) } : v) : setVariantForm(f => ({ ...f, stock_quantity: e.target.value }))} />
                            </div>
                            <div>
                                <label className="label">Price Adjustment (₹)</label>
                                <input type="number" step="0.01" className="input" value={editingVariant ? editingVariant.price_adjustment : variantForm.price_adjustment} onChange={e => editingVariant ? setEditingVariant(v => v ? { ...v, price_adjustment: parseFloat(e.target.value) } : v) : setVariantForm(f => ({ ...f, price_adjustment: e.target.value }))} placeholder="+/- from base price" />
                            </div>
                        </div>
                        <div className="flex gap-3">
                            {editingVariant ? (
                                <>
                                    <button type="button" onClick={() => setEditingVariant(null)} className="btn-secondary">Cancel</button>
                                    <button type="button" onClick={() => updateVariantMutation.mutate({ variantId: editingVariant.variant_id, data: { color: editingVariant.color, size: editingVariant.size, stock_quantity: editingVariant.stock_quantity, price_adjustment: editingVariant.price_adjustment } })}
                                        disabled={updateVariantMutation.isPending} className="btn-primary">
                                        {updateVariantMutation.isPending ? 'Saving...' : 'Save Variant'}
                                    </button>
                                </>
                            ) : (
                                <button type="button" onClick={handleAddVariant} disabled={createVariantMutation.isPending} className="btn-primary">
                                    {createVariantMutation.isPending ? 'Adding...' : '+ Add Variant'}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Variants list */}
                    {variantsLoading ? <LoadingSpinner /> : variants.length === 0 ? (
                        <p className="text-gray-400 text-sm py-4 text-center">No variants yet. Add colour/size variants above.</p>
                    ) : (
                        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="text-left px-4 py-3 font-semibold text-gray-700">SKU</th>
                                        <th className="text-left px-4 py-3 font-semibold text-gray-700">Color</th>
                                        <th className="text-left px-4 py-3 font-semibold text-gray-700">Size</th>
                                        <th className="text-left px-4 py-3 font-semibold text-gray-700">Stock</th>
                                        <th className="text-left px-4 py-3 font-semibold text-gray-700">Adj. (₹)</th>
                                        <th className="text-left px-4 py-3 font-semibold text-gray-700">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {variants.map(v => (
                                        <tr key={v.variant_id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 font-mono text-xs">{v.sku}</td>
                                            <td className="px-4 py-3 text-gray-700">{v.color || '—'}</td>
                                            <td className="px-4 py-3 text-gray-700">{v.size || '—'}</td>
                                            <td className="px-4 py-3">{v.stock_quantity} <span className="text-xs text-gray-400">({v.stock_status.replace('_', ' ')})</span></td>
                                            <td className="px-4 py-3">{Number(v.price_adjustment) >= 0 ? '+' : ''}{Number(v.price_adjustment).toLocaleString('en-IN')}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex gap-2">
                                                    <button onClick={() => setEditingVariant(v)} className="text-blue-600 hover:underline text-xs">Edit</button>
                                                    <button onClick={() => { if (confirm(`Delete variant ${v.sku}?`)) deleteVariantMutation.mutate(v.variant_id) }} className="text-red-500 hover:underline text-xs">Delete</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}