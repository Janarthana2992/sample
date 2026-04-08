import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { orderService } from '../../services/orders'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'

export default function StaffOrders() {
    const [page, setPage] = useState(1)
    const [selectedOrder, setSelectedOrder] = useState<any>(null)
    const { register, handleSubmit, reset } = useForm()
    const qc = useQueryClient()

    const { data, isLoading } = useQuery({
        queryKey: ['staff', 'orders', page],
        queryFn: () => orderService.listOrders({ status: 'confirmed', page, limit: 20 }),
    })

    const dispatchMutation = useMutation({
        mutationFn: ({ orderId, tracking_number }: { orderId: string; tracking_number: string }) =>
            orderService.updateStatus(orderId, { status: 'dispatched', tracking_number }),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: ['staff', 'orders'] })
            setSelectedOrder(null)
            reset()
            toast.success('Order marked as dispatched')
        },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to dispatch'),
    })

    if (isLoading) return <LoadingSpinner />

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-gray-900">Confirmed Orders</h1>

            {selectedOrder && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setSelectedOrder(null)}>
                    <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
                        <h2 className="font-semibold text-lg">Dispatch Order #{selectedOrder.order_id.slice(0, 8)}</h2>
                        <form onSubmit={handleSubmit(d => dispatchMutation.mutate({ orderId: selectedOrder.order_id, tracking_number: d.tracking_number }))} className="space-y-4">
                            <div>
                                <label className="label">Tracking Number</label>
                                <input className="input" placeholder="Enter courier tracking ID" {...register('tracking_number', { required: true })} />
                            </div>
                            <div className="flex gap-3">
                                <button type="submit" disabled={dispatchMutation.isPending} className="btn-primary flex-1">
                                    {dispatchMutation.isPending ? 'Dispatching...' : 'Mark Dispatched'}
                                </button>
                                <button type="button" onClick={() => setSelectedOrder(null)} className="btn-secondary flex-1">Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                        <tr>
                            {['Order ID', 'Customer', 'Amount', 'Items', 'Date', 'Actions'].map(h => (
                                <th key={h} className="px-4 py-3 text-left font-semibold text-gray-600">{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {data?.items?.map((order: any) => (
                            <tr key={order.order_id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 font-mono text-xs">{order.order_id.slice(0, 8)}</td>
                                <td className="px-4 py-3">{order.user_id}</td>
                                <td className="px-4 py-3 font-semibold">₹{Number(order.total_amount).toLocaleString('en-IN')}</td>
                                <td className="px-4 py-3">{order.order_items?.length ?? '—'} items</td>
                                <td className="px-4 py-3 text-gray-500">{new Date(order.created_at).toLocaleDateString('en-IN')}</td>
                                <td className="px-4 py-3">
                                    <button
                                        onClick={() => setSelectedOrder(order)}
                                        className="text-sm text-blue-600 hover:underline"
                                    >
                                        Dispatch
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {!data?.items?.length && (
                            <tr><td colSpan={6} className="text-center py-10 text-gray-400">No confirmed orders</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="flex items-center justify-between">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn-secondary text-sm disabled:opacity-50">← Prev</button>
                <span className="text-sm text-gray-500">Page {page} of {data ? Math.ceil(data.total / 20) : 1}</span>
                <button disabled={page >= (data ? Math.ceil(data.total / 20) : 1)} onClick={() => setPage(p => p + 1)} className="btn-secondary text-sm disabled:opacity-50">Next →</button>
            </div>
        </div>
    )
}
