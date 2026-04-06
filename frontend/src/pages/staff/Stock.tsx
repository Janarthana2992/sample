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
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['staff', 'stock'] })
            setEditingId(null)
            reset()
            toast.success('Stock updated')
        },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Update failed'),
    })

    if (isLoading) return <LoadingSpinner />

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-gray-900">Stock Management</h1>

            <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                        <tr>
                            {['Product', 'SKU', 'Current Stock', 'Status', 'Actions'].map(h => (
                                <th key={h} className="px-4 py-3 text-left font-semibold text-gray-600">{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {data?.items?.map((product: any) => (
                            <tr key={product.product_id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 font-medium text-gray-900">{product.name}</td>
                                <td className="px-4 py-3 font-mono text-xs text-gray-500">{product.sku}</td>
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
                                        <span className={`badge text-xs ${product.stock_status === 'in_stock' ? 'bg-green-100 text-green-700' :
                                                product.stock_status === 'low_stock' ? 'bg-orange-100 text-orange-700' :
                                                    'bg-red-100 text-red-700'
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
                                                className="text-sm text-green-600 hover:underline"
                                            >
                                                Save
                                            </button>
                                            <button onClick={() => { setEditingId(null); reset() }} className="text-sm text-gray-500 hover:underline">
                                                Cancel
                                            </button>
                                        </div>
                                    ) : (
                                        <button onClick={() => setEditingId(product.product_id)} className="text-sm text-blue-600 hover:underline">
                                            Edit
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {!data?.items?.length && (
                            <tr><td colSpan={5} className="text-center py-10 text-gray-400">No products found</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
