import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { productService } from '../../services/products'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'

export default function StaffStock() {
    const [editingId, setEditingId] = useState<string | null>(null)
    const { register, handleSubmit, reset } = useForm()
    const qc = useQueryClient()

    const { data, isLoading } = useQuery({
        queryKey: ['staff', 'stock'],
        queryFn: () => productService.getProducts({ page: 1, limit: 100 }),
    })

    const updateMutation = useMutation({
        mutationFn: ({ id, ...payload }: { id: string; stock_quantity: number; stock_status: string }) =>
            productService.updateStock(id, payload),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: ['staff', 'stock'] })
            setEditingId(null)
            reset()
            toast.success('Stock updated')
        },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Update failed'),
    })

    if (isLoading) return <LoadingSpinner />

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Stock Management</h1>

            <div className="overflow-x-auto rounded-2xl border border-surface-200 dark:border-surface-700">
                <table className="min-w-full text-sm">
                    <thead className="bg-surface-50 dark:bg-surface-800">
                        <tr>
                            {['Product', 'SKU', 'Current Stock', 'Status', 'Actions'].map(h => (
                                <th key={h} className="px-4 py-3 text-left font-semibold text-surface-600 dark:text-surface-400">{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100 dark:divide-surface-800">
                        {data?.items?.map((product: any) => (
                            <tr key={product.product_id} className="hover:bg-surface-50 dark:hover:bg-surface-800/50">
                                <td className="px-4 py-3 font-medium text-surface-900 dark:text-white">{product.name}</td>
                                <td className="px-4 py-3 font-mono text-xs text-surface-500 dark:text-surface-400">{product.sku}</td>
                                <td className="px-4 py-3">
                                    {editingId === product.product_id ? (
                                        <input
                                            type="number"
                                            min="0"
                                            defaultValue={product.stock_quantity}
                                            className="input w-24 py-1 text-sm"
                                            {...register('stock_quantity', { valueAsNumber: true })}
                                        />
                                    ) : (
                                        <span className={`font-semibold ${product.stock_quantity <= 5 ? 'text-red-600' : product.stock_quantity <= 20 ? 'text-orange-500' : 'text-green-600'}`}>
                                            {product.stock_quantity}
                                        </span>
                                    )}
                                </td>
                                <td className="px-4 py-3">
                                    {editingId === product.product_id ? (
                                        <select className="input py-1 text-sm" {...register('stock_status')}>
                                            <option value="in_stock">In Stock</option>
                                            <option value="low_stock">Low Stock</option>
                                            <option value="out_of_stock">Out of Stock</option>
                                        </select>
                                    ) : (
                                        <span className={`badge text-xs ${product.stock_status === 'in_stock' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                            product.stock_status === 'low_stock' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                                                'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                            }`}>
                                            {product.stock_status.replace('_', ' ')}
                                        </span>
                                    )}
                                </td>
                                <td className="px-4 py-3">
                                    {editingId === product.product_id ? (
                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleSubmit(d => updateMutation.mutate({ id: product.product_id, ...d as any }))}
                                                disabled={updateMutation.isPending}
                                                className="text-sm text-green-600 hover:text-primary-600 transition-colors"
                                            >
                                                Save
                                            </button>
                                            <button onClick={() => { setEditingId(null); reset() }} className="text-sm text-surface-500 dark:text-surface-400 hover:text-primary-600 transition-colors">
                                                Cancel
                                            </button>
                                        </div>
                                    ) : (
                                        <button onClick={() => setEditingId(product.product_id)} className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-600 transition-colors">
                                            Edit
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {!data?.items?.length && (
                            <tr><td colSpan={5} className="text-center py-10 text-surface-400">No products found</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
