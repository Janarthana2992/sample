import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { orderService } from '../../services/orders'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import type { Order } from '../../types'

const STATUS_COLORS: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    confirmed: 'bg-blue-100 text-blue-700',
    dispatched: 'bg-purple-100 text-purple-700',
    delivered: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
}

const NEXT_STATUS: Record<string, string> = {
    pending: 'confirmed',
    confirmed: 'dispatched',
    dispatched: 'delivered',
}

export default function AdminOrders() {
    const [page, setPage] = useState(1)
    const [status, setStatus] = useState('')
    const [searchId, setSearchId] = useState('')
    const qc = useQueryClient()

    const { data, isLoading } = useQuery({
        queryKey: ['admin', 'orders', page, status],
        queryFn: () => orderService.listOrders({ page, size: 20, ...(status ? { status } : {}) }),
    })

    // Client-side filter by order ID prefix
    const allOrders: Order[] = data?.items ?? []
    const filteredOrders = searchId.trim()
        ? allOrders.filter(o => o.order_id.toLowerCase().includes(searchId.toLowerCase().trim()))
        : allOrders

    const statusMutation = useMutation({
        mutationFn: ({ orderId, newStatus, tracking }: { orderId: string; newStatus: string; tracking?: string }) =>
            orderService.updateStatus(orderId, { status: newStatus, ...(tracking ? { tracking_number: tracking } : {}) }),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'orders'] }); toast.success('Order status updated') },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update status'),
    })

    const handleAdvance = (order: Order) => {
        const next = NEXT_STATUS[order.status]
        if (!next) return
        if (next === 'dispatched') {
            const tracking = prompt('Enter tracking number (optional):') || undefined
            statusMutation.mutate({ orderId: order.order_id, newStatus: next, tracking })
        } else {
            statusMutation.mutate({ orderId: order.order_id, newStatus: next })
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
                <div className="flex gap-2 flex-wrap">
                    <input
                        type="text"
                        className="input w-52"
                        placeholder="Search by order ID…"
                        value={searchId}
                        onChange={e => { setSearchId(e.target.value); setPage(1) }}
                    />
                    <select
                        className="input w-auto"
                        value={status}
                        onChange={e => { setStatus(e.target.value); setPage(1) }}
                    >
                        <option value="">All Statuses</option>
                        {['pending', 'confirmed', 'dispatched', 'delivered', 'cancelled'].map(s => (
                            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                        ))}
                    </select>
                </div>
            </div>

            {isLoading ? <LoadingSpinner /> : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="text-left px-4 py-3 font-semibold text-gray-700">Order ID</th>
                                <th className="text-left px-4 py-3 font-semibold text-gray-700">Date</th>
                                <th className="text-left px-4 py-3 font-semibold text-gray-700">Products</th>
                                <th className="text-left px-4 py-3 font-semibold text-gray-700">Total</th>
                                <th className="text-left px-4 py-3 font-semibold text-gray-700">Status</th>
                                <th className="text-left px-4 py-3 font-semibold text-gray-700">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredOrders.map((order: Order) => (
                                <tr key={order.order_id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-mono text-xs text-gray-600">#{order.order_id.slice(0, 8).toUpperCase()}</td>
                                    <td className="px-4 py-3 text-gray-600">{new Date(order.created_at).toLocaleDateString('en-IN')}</td>
                                    <td className="px-4 py-3 max-w-xs">
                                        <div className="space-y-0.5">
                                            {order.items.map((item: any) => (
                                                <p key={item.order_item_id} className="text-xs text-gray-700 truncate">
                                                    {item.product_name || item.product_id.slice(0, 8)} <span className="text-gray-400">×{item.quantity}</span>
                                                </p>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 font-semibold">₹{Number(order.total_price).toLocaleString('en-IN')}</td>
                                    <td className="px-4 py-3">
                                        <span className={`badge ${STATUS_COLORS[order.status]}`}>
                                            {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-2">
                                            {NEXT_STATUS[order.status] && (
                                                <button
                                                    onClick={() => handleAdvance(order)}
                                                    disabled={statusMutation.isPending}
                                                    className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 transition-colors"
                                                >
                                                    → {NEXT_STATUS[order.status]}
                                                </button>
                                            )}
                                            {order.status === 'pending' && (
                                                <button
                                                    onClick={() => statusMutation.mutate({ orderId: order.order_id, newStatus: 'cancelled' })}
                                                    disabled={statusMutation.isPending}
                                                    className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200"
                                                >
                                                    Cancel
                                                </button>
                                            )}
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
                <span className="text-sm text-gray-600">Page {page} · {data?.total || 0} total</span>
                <button disabled={!data || page * 20 >= data.total} onClick={() => setPage(p => p + 1)} className="btn-secondary text-sm disabled:opacity-40">Next →</button>
            </div>
        </div>
    )
}
