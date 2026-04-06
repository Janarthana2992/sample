import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
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

export default function Orders() {
    const { data, isLoading } = useQuery({
        queryKey: ['orders'],
        queryFn: () => orderService.listOrders({ size: 20 }),
    })

    if (isLoading) return <LoadingSpinner />

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-gray-900">My Orders</h1>
            {!data || data.items.length === 0 ? (
                <div className="text-center py-16 text-gray-500">
                    <p className="text-5xl mb-4">📦</p>
                    <p className="text-lg font-medium">No orders yet</p>
                    <Link to="/products" className="btn-primary mt-4 inline-block">Start Shopping</Link>
                </div>
            ) : (
                <div className="space-y-4">
                    {data.items.map(order => (
                        <div key={order.order_id} className="card hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs text-gray-500 font-mono">#{order.order_id.slice(0, 8).toUpperCase()}</p>
                                    <p className="text-sm text-gray-500">{new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                                </div>
                                <span className={`badge ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-700'}`}>
                                    {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                                </span>
                            </div>
                            <div className="mt-3 flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-600">{order.items.length} item(s)</p>
                                    <p className="text-base font-bold text-gray-900 mt-1">₹{Number(order.total_price).toLocaleString('en-IN')}</p>
                                </div>
                                <div className="flex gap-2">
                                    {order.tracking_number && (
                                        <span className="text-xs text-purple-700 bg-purple-100 px-2 py-1 rounded">
                                            Track: {order.tracking_number}
                                        </span>
                                    )}
                                    <Link to={`/orders/${order.order_id}`} className="btn-secondary text-xs py-1.5 px-3">
                                        View Details
                                    </Link>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
