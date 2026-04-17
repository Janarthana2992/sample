import { useQuery } from '@tanstack/react-query'
import { orderService } from '../../services/orders'
import { productService } from '../../services/products'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'

export default function StaffDashboard() {
    const { data: kpis, isLoading: kLoading } = useQuery({
        queryKey: ['staff', 'kpis'],
        queryFn: () => orderService.getAdminKpis(),
        refetchInterval: 60_000,
    })

    const { data: recentOrders, isLoading: oLoading } = useQuery({
        queryKey: ['staff', 'recent-orders'],
        queryFn: () => orderService.listOrders({ limit: 20 }),
    })

    const { data: lowStock, isLoading: sLoading } = useQuery({
        queryKey: ['staff', 'low-stock'],
        queryFn: () => productService.getLowStock(),
    })

    if (kLoading || oLoading || sLoading) return <LoadingSpinner />

    const cards = [
        { label: 'Pending Orders', value: kpis?.pending_orders ?? 0, color: 'text-yellow-600' },
        { label: 'Dispatched Today', value: kpis?.dispatched_today ?? 0, color: 'text-blue-600' },
        { label: 'Unresolved Reviews', value: kpis?.unresolved_reviews ?? 0, color: 'text-red-600' },
        { label: 'Low-Stock Items', value: lowStock?.length ?? 0, color: 'text-orange-600' },
    ]

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Staff Dashboard</h1>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {cards.map(c => (
                    <div key={c.label} className="card text-center">
                        <p className={`text-3xl font-bold ${c.color}`}>{c.value}</p>
                        <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">{c.label}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Recent Activity */}
                <div className="card">
                    <h2 className="font-semibold text-surface-900 dark:text-white mb-3">Recent Orders</h2>
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                        {recentOrders?.items?.map((order: any) => (
                            <div key={order.order_id} className="flex items-center justify-between py-2 border-b border-surface-100 dark:border-surface-800 last:border-0">
                                <div>
                                    <p className="text-sm font-medium text-surface-800 dark:text-surface-200">#{order.order_id.slice(0, 8)}</p>
                                    <p className="text-xs text-surface-500 dark:text-surface-400">
                                        {new Date(order.created_at).toLocaleString('en-IN')}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <span className={`badge text-xs ${order.status === 'pending' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                                            order.status === 'confirmed' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                                order.status === 'dispatched' ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
                                                    'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                        }`}>{order.status}</span>
                                    <p className="text-xs text-surface-700 dark:text-surface-300 mt-1">₹{Number(order.total_amount).toLocaleString('en-IN')}</p>
                                </div>
                            </div>
                        ))}
                        {!recentOrders?.items?.length && (
                            <p className="text-sm text-surface-400 text-center py-6">No recent orders</p>
                        )}
                    </div>
                </div>

                {/* Low Stock */}
                <div className="card">
                    <h2 className="font-semibold text-surface-900 dark:text-white mb-3">Low-Stock Items</h2>
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                        {lowStock?.map((product: any) => (
                            <div key={product.product_id} className="flex items-center justify-between py-2 border-b border-surface-100 dark:border-surface-800 last:border-0">
                                <div>
                                    <p className="text-sm font-medium text-surface-800 dark:text-surface-200">{product.name}</p>
                                    <p className="text-xs text-surface-500 dark:text-surface-400">SKU: {product.sku}</p>
                                </div>
                                <span className={`text-sm font-semibold ${product.stock_quantity <= 5 ? 'text-red-600' : 'text-orange-500'}`}>
                                    {product.stock_quantity} left
                                </span>
                            </div>
                        ))}
                        {!lowStock?.length && (
                            <p className="text-sm text-surface-400 text-center py-6">All items are well-stocked</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
