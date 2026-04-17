import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { productService } from '../../services/products'

export default function AddProduct() {
    const navigate = useNavigate()
    const [images, setImages] = useState<FileList | null>(null)
    const [imagePreview, setImagePreview] = useState<string[]>([])

    const { data: categories } = useQuery({
        queryKey: ['categories'],
        queryFn: productService.listCategories,
    })

    const [form, setForm] = useState({
        sku: '', name: '', description: '', mrp: '', selling_price: '',
        stock_quantity: '0', category_ids: [] as string[], tags: '', is_active: true,
        is_featured: false, is_promoted: false, promotion_priority: '0', promotion_badge: '',
        weight_kg: '', length_cm: '', width_cm: '', height_cm: '',
    })
    const [errors, setErrors] = useState<Record<string, string>>({})

    const createMutation = useMutation({
        mutationFn: (fd: FormData) => productService.create(fd),
        onSuccess: () => { toast.success('Product created!'); navigate('/admin/products') },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to create product'),
    })

    const validate = () => {
        const e: Record<string, string> = {}
        if (!form.sku) e.sku = 'SKU required'
        if (!form.name || form.name.length < 3) e.name = 'Name must be ≥ 3 chars'
        if (!form.description || form.description.length < 20) e.description = 'Description must be ≥ 20 chars'
        if (!form.mrp || parseFloat(form.mrp) <= 0) e.mrp = 'MRP must be > 0'
        if (!form.selling_price || parseFloat(form.selling_price) <= 0) e.selling_price = 'Selling price must be > 0'
        if (parseFloat(form.selling_price) > parseFloat(form.mrp)) e.selling_price = 'Selling price must be ≤ MRP'
        if (form.category_ids.length === 0) e.category_ids = 'Select at least one category'
        setErrors(e)
        return Object.keys(e).length === 0
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!validate()) return

        const fd = new FormData()
        fd.append('sku', form.sku.toUpperCase())
        fd.append('name', form.name)
        fd.append('description', form.description)
        fd.append('mrp', form.mrp)
        fd.append('selling_price', form.selling_price)
        fd.append('stock_quantity', form.stock_quantity)
        fd.append('category_ids', form.category_ids.join(','))
        if (form.tags) fd.append('tags', form.tags)
        fd.append('is_active', String(form.is_active))
        fd.append('is_featured', String(form.is_featured))
        fd.append('is_promoted', String(form.is_promoted))
        fd.append('promotion_priority', form.promotion_priority || '0')
        if (form.promotion_badge.trim()) fd.append('promotion_badge', form.promotion_badge.trim())
        if (images) {
            Array.from(images).forEach(img => fd.append('images', img))
        }
        createMutation.mutate(fd)
    }

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files) return
        setImages(files)
        const previews: string[] = []
        Array.from(files).forEach(f => {
            const reader = new FileReader()
            reader.onload = ev => { previews.push(ev.target?.result as string); if (previews.length === files.length) setImagePreview([...previews]) }
            reader.readAsDataURL(f)
        })
    }

    const toggleCategory = (id: string) => {
        setForm(f => ({
            ...f,
            category_ids: f.category_ids.includes(id) ? f.category_ids.filter(c => c !== id) : [...f.category_ids, id]
        }))
    }

    return (
        <div className="max-w-3xl space-y-6">
            <div className="flex items-center gap-3">
                <button onClick={() => navigate('/admin/products')} className="text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-white"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" /></svg></button>
                <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Add Product</h1>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="card space-y-4">
                    <h2 className="font-semibold text-surface-900 dark:text-white">Basic Info</h2>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label">SKU *</label>
                            <input className="input font-mono uppercase" value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} />
                            {errors.sku && <p className="text-red-500 text-xs mt-1">{errors.sku}</p>}
                        </div>
                        <div>
                            <label className="label">Product Name *</label>
                            <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                        </div>
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
                </div>

                {/* Categories */}
                <div className="card space-y-3">
                    <h2 className="font-semibold text-surface-900 dark:text-white">Categories *</h2>
                    {errors.category_ids && <p className="text-red-500 text-xs">{errors.category_ids}</p>}
                    <div className="flex flex-wrap gap-2">
                        {categories?.map(cat => (
                            <button
                                key={cat.category_id}
                                type="button"
                                onClick={() => toggleCategory(cat.category_id)}
                                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${form.category_ids.includes(cat.category_id)
                                    ? 'bg-primary-600 text-white border-primary-600'
                                    : 'bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-300 border-surface-300 dark:border-surface-600 hover:border-blue-400'
                                    }`}
                            >
                                {cat.name}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Tags */}
                <div className="card space-y-3">
                    <h2 className="font-semibold text-surface-900 dark:text-white">Tags (optional)</h2>
                    <input
                        className="input"
                        placeholder="electronics, gaming, accessories (comma-separated)"
                        value={form.tags}
                        onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                    />
                </div>

                <div className="card space-y-4">
                    <h2 className="font-semibold text-surface-900 dark:text-white">Promotion</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <button
                                type="button"
                                onClick={() => setForm(f => ({ ...f, is_featured: !f.is_featured }))}
                                className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${form.is_featured ? 'bg-primary-600' : 'bg-gray-300'}`}
                            >
                                <span className={`inline-block h-5 w-5 rounded-full bg-white shadow mt-0.5 transition-transform ${form.is_featured ? 'translate-x-5' : 'translate-x-0.5'}`} />
                            </button>
                            <span className="text-sm font-medium text-surface-700 dark:text-surface-300">Admin featured product</span>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <button
                                type="button"
                                onClick={() => setForm(f => ({ ...f, is_promoted: !f.is_promoted }))}
                                className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${form.is_promoted ? 'bg-orange-500' : 'bg-gray-300'}`}
                            >
                                <span className={`inline-block h-5 w-5 rounded-full bg-white shadow mt-0.5 transition-transform ${form.is_promoted ? 'translate-x-5' : 'translate-x-0.5'}`} />
                            </button>
                            <span className="text-sm font-medium text-surface-700 dark:text-surface-300">Promote this product</span>
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

                {/* Images */}
                <div className="card space-y-3">
                    <h2 className="font-semibold text-surface-900 dark:text-white">Product Images (max 8, 5MB each)</h2>
                    <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        onChange={handleImageChange}
                        className="block w-full text-sm text-surface-500 dark:text-surface-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                    {imagePreview.length > 0 && (
                        <div className="flex gap-2 flex-wrap">
                            {imagePreview.map((src, i) => (
                                <img key={i} src={src} alt="" className="w-20 h-20 rounded-lg object-cover border border-surface-200 dark:border-surface-700" />
                            ))}
                        </div>
                    )}
                </div>

                {/* Active toggle */}
                <div className="card">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <button
                            type="button"
                            onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                            className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${form.is_active ? 'bg-primary-600' : 'bg-gray-300'}`}
                        >
                            <span className={`inline-block h-5 w-5 rounded-full bg-white shadow mt-0.5 transition-transform ${form.is_active ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                        <span className="text-sm font-medium text-surface-700 dark:text-surface-300">Active (visible to customers)</span>
                    </label>
                </div>

                <div className="flex gap-3">
                    <button type="button" onClick={() => navigate('/admin/products')} className="btn-secondary">Cancel</button>
                    <button type="submit" disabled={createMutation.isPending} className="btn-primary flex-1">
                        {createMutation.isPending ? 'Creating...' : 'Create Product'}
                    </button>
                </div>
            </form>
        </div>
    )
}
