import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { productService } from '../../services/products'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import type { Category } from '../../types'

export default function AdminCategories() {
    const [name, setName] = useState('')
    const qc = useQueryClient()

    const { data: categories = [], isLoading } = useQuery<Category[]>({
        queryKey: ['categories'],
        queryFn: productService.listCategories,
    })

    const autoSlug = (value: string) =>
        value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

    const createMutation = useMutation({
        mutationFn: () => productService.createCategory({ name: name.trim(), slug: autoSlug(name.trim()) }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['categories'] })
            toast.success('Category created')
            setName('')
        },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to create category'),
    })

    const deleteMutation = useMutation({
        mutationFn: (id: string) => productService.deleteCategory(id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); toast.success('Category deleted') },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to delete category'),
    })

    return (
        <div className="space-y-6 max-w-2xl">
            <h1 className="text-2xl font-bold text-gray-900">Categories</h1>

            {/* Create form */}
            <div className="card space-y-4">
                <h2 className="font-semibold text-gray-900">Add New Category</h2>
                <div>
                    <label className="label">Category Name *</label>
                    <input
                        className="input"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="e.g. Electronics"
                    />
                </div>
                <button
                    onClick={() => createMutation.mutate()}
                    disabled={!name.trim() || createMutation.isPending}
                    className="btn-primary"
                >
                    {createMutation.isPending ? 'Creating...' : '+ Add Category'}
                </button>
            </div>

            {/* List */}
            <div className="card">
                <h2 className="font-semibold text-gray-900 mb-4">Existing Categories</h2>
                {isLoading ? <LoadingSpinner /> : (
                    <div className="space-y-2">
                        {(categories as Category[]).length === 0 && (
                            <p className="text-sm text-gray-400">No categories yet.</p>
                        )}
                        {(categories as Category[]).map(cat => (
                            <div key={cat.category_id} className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0">
                                <div>
                                    <p className="text-sm font-medium text-gray-900">{cat.name}</p>
                                </div>
                                <button
                                    onClick={() => {
                                        if (confirm(`Delete category "${cat.name}"?`))
                                            deleteMutation.mutate(cat.category_id)
                                    }}
                                    className="text-xs text-red-500 hover:underline shrink-0"
                                >
                                    Delete
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
