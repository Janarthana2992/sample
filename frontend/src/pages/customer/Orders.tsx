import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { orderService } from '../../services/orders'
import { aiClient } from '../../services/api'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import { useAuthStore } from '../../store/authStore'
import type { Order } from '../../types'

type RecItem = {
    product_id: string
    score: number
    name?: string
    mrp?: number
    selling_price?: number
    image_url?: string
    stock_status?: string
}

const STATUS_COLORS: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    confirmed: 'bg-blue-100 text-blue-700',
    dispatched: 'bg-purple-100 text-purple-700',
    delivered: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
}

export default function Orders() {
    const { user } = useAuthStore()

    const { data, isLoading } = useQuery({
        queryKey: ['orders'],
        queryFn: () => orderService.listOrders({ size: 20 }),
    })

    const hasOrders = data && data.items.length > 0

    const { data: recommendations } = useQuery({
        queryKey: ['order-recommendations', user?.user_id],
        queryFn: async () => {
            const r = await aiClient.get(`/recommend/user/${user!.user_id}`, { params: { top_n: 8 } })
            return r.data.items as RecItem[]
        },
        enabled: !!user && !!hasOrders,
        staleTime: 5 * 60_000,
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

            {/* Order-based recommendations */}
            {recommendations && recommendations.length > 0 && (
                <section className="mt-8">
                    <h2 className="text-xl font-bold text-gray-900 mb-1">Recommended Based on Your Orders</h2>
                    <p className="text-sm text-gray-500 mb-4">Products similar to what you've purchased</p>
                    <div className="flex gap-4 overflow-x-auto pb-2">
                        {recommendations.map(rec => (
                            <Link
                                key={rec.product_id}
                                to={`/products/${rec.product_id}`}
                                className="shrink-0 w-44 bg-white rounded-xl border border-gray-200 hover:shadow-md transition-shadow overflow-hidden"
                            >
                                <div className="w-full aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                                    {rec.image_url
                                        ? <img src={rec.image_url} alt={rec.name} className="w-full h-full object-cover" />
                                        : <span className="text-4xl">📦</span>
                                    }
                                </div>
                                <div className="p-2">
                                    <p className="text-xs font-semibold text-gray-800 line-clamp-2 leading-snug mb-1">{rec.name || 'View Product'}</p>
                                    {rec.selling_price && (
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-sm font-bold text-gray-900">₹{Number(rec.selling_price).toLocaleString('en-IN')}</span>
                                            {rec.mrp && rec.mrp > rec.selling_price && (
                                                <span className="text-xs text-gray-400 line-through">₹{Number(rec.mrp).toLocaleString('en-IN')}</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>
            )}
        </div>
    )
}
