import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { orderService } from '../../services/orders'
import { productService } from '../../services/products'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import { useState } from 'react'
import { motion } from 'framer-motion'

function KPICard({ label, value, sub, icon, color, alert }: { label: string; value: string | number; sub?: string; icon: string; color: string; alert?: boolean }) {
    return (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={`card ${alert ? 'ring-2 ring-red-300 dark:ring-red-700' : ''}`}>
            <div className="flex items-center gap-3 mb-2">
                <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center`}>
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={icon} /></svg>
                </div>
            </div>
            <p className="text-2xl font-extrabold text-surface-900 dark:text-white mt-1">{value}</p>
            <p className="text-sm text-surface-500 dark:text-surface-400">{label}</p>
            {sub && <p className="text-xs text-surface-400 mt-1">{sub}</p>}
        </motion.div>
    )
}

const STATUS_COLORS: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    confirmed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    dispatched: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    delivered: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    return_requested: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
}

export default function AdminDashboard() {
    const { data: kpis, isLoading: kpisLoading } = useQuery({
        queryKey: ['admin', 'kpis'],
        queryFn: orderService.getDashboardKPIs,
        refetchInterval: 30_000,
    })

    const [period, setPeriod] = useState<'today' | '7d' | '30d'>('7d')
    const { data: topProducts } = useQuery({
        queryKey: ['admin', 'top-products', period],
        queryFn: () => orderService.getTopProducts(period),
    })

    const { data: recentOrders } = useQuery({
        queryKey: ['admin', 'recent-orders'],
        queryFn: () => orderService.listOrders({ size: 8, page: 1 }),
        refetchInterval: 60_000,
    })

    const { data: returnOrders } = useQuery({
        queryKey: ['admin', 'return-orders'],
        queryFn: () => orderService.listOrders({ status: 'return_requested', size: 5 }),
    })

    const { data: lowStockData } = useQuery({
        queryKey: ['admin', 'low-stock'],
        queryFn: () => productService.getLowStock(),
        refetchInterval: 120_000,
    })

    if (kpisLoading) return <LoadingSpinner />

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Dashboard</h1>

            {/* Primary KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                <KPICard label="Orders Today" value={kpis?.orders_today ?? '—'} icon="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" color="bg-gradient-to-br from-primary-500 to-primary-600" />
                <KPICard label="Orders Month" value={kpis?.orders_month ?? '—'} icon="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" color="bg-gradient-to-br from-blue-500 to-blue-600" />
                <KPICard label="Dispatched" value={kpis?.dispatched ?? '—'} icon="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" color="bg-gradient-to-br from-purple-500 to-purple-600" />
                <KPICard label="Pending" value={kpis?.pending ?? '—'} icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" color="bg-gradient-to-br from-amber-500 to-amber-600" />
                <KPICard label="Revenue Today" value={kpis?.revenue_today ? `₹${Number(kpis.revenue_today).toLocaleString('en-IN')}` : '₹0'} icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" color="bg-gradient-to-br from-emerald-500 to-emerald-600" />
                <KPICard label="Revenue Month" value={kpis?.revenue_month ? `₹${Number(kpis.revenue_month).toLocaleString('en-IN')}` : '₹0'} icon="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" color="bg-gradient-to-br from-teal-500 to-teal-600" />
            </div>

            {/* Secondary KPIs: Cancelled + Returns */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KPICard label="Cancelled" value={kpis?.cancelled ?? '—'} icon="M6 18L18 6M6 6l12 12" color="bg-gradient-to-br from-red-500 to-red-600" alert={(kpis?.cancelled ?? 0) > 5} />
                <KPICard label="Return Requests" value={kpis?.return_requests ?? '—'} icon="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" color="bg-gradient-to-br from-orange-500 to-orange-600" alert={(kpis?.return_requests ?? 0) > 0} />
                <KPICard label="Confirmed" value={kpis?.confirmed ?? '—'} icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" color="bg-gradient-to-br from-blue-400 to-blue-500" />
                <KPICard label="Delivered" value={kpis?.delivered ?? '—'} icon="M5 13l4 4L19 7" color="bg-gradient-to-br from-emerald-400 to-emerald-500" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Recent Orders */}
                <div className="xl:col-span-2 card">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold text-surface-900 dark:text-white">Recent Orders</h2>
                        <Link to="/admin/orders" className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium">View all →</Link>
                    </div>
                    {recentOrders?.items && recentOrders.items.length > 0 ? (
                        <div className="space-y-2">
                            {recentOrders.items.map((order: any) => (
                                <Link key={order.order_id} to={`/admin/orders/${order.order_id}`} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors group">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-surface-800 dark:text-surface-200 truncate">
                                            #{order.order_id.slice(-8).toUpperCase()}
                                        </p>
                                        <p className="text-xs text-surface-500 dark:text-surface-400 truncate">
                                            {order.items?.length ?? 0} item{(order.items?.length ?? 0) !== 1 ? 's' : ''} · {new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                        </p>
                                    </div>
                                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status] ?? 'bg-surface-100 text-surface-600'}`}>
                                        {order.status.replace('_', ' ')}
                                    </span>
                                    <span className="text-sm font-bold text-surface-900 dark:text-white whitespace-nowrap">
                                        ₹{Number(order.total_price).toLocaleString('en-IN')}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <p className="text-surface-400 text-sm">No recent orders</p>
                    )}
                </div>

                {/* Right column: Low Stock + Return Requests */}
                <div className="space-y-6">
                    {/* Low Stock Alert */}
                    <div className="card">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-base font-bold text-surface-900 dark:text-white flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                                Low Stock
                            </h2>
                            <Link to="/admin/products?stock=low_stock" className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium">View all →</Link>
                        </div>
                        {lowStockData && lowStockData.length > 0 ? (
                            <div className="space-y-2">
                                {lowStockData.slice(0, 5).map((p: any) => (
                                    <Link key={p.product_id} to={`/admin/products/${p.product_id}/edit`} className="flex items-center gap-2 text-sm hover:bg-surface-50 dark:hover:bg-surface-800 rounded-lg p-1.5 transition-colors">
                                        {p.images?.[0]?.url ? (
                                            <img src={p.images[0].url} alt={p.name} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                                        ) : (
                                            <div className="w-8 h-8 rounded-lg bg-surface-100 dark:bg-surface-700 flex-shrink-0" />
                                        )}
                                        <span className="flex-1 truncate text-surface-700 dark:text-surface-300 text-xs font-medium">{p.name}</span>
                                        <span className={`text-[11px] font-bold whitespace-nowrap ${p.stock_quantity === 0
                                                ? 'text-red-600 dark:text-red-400'
                                                : p.stock_quantity <= 5
                                                    ? 'text-red-500 dark:text-red-400'
                                                    : 'text-amber-600 dark:text-amber-400'
                                            }`}>
                                            {p.stock_quantity === 0 ? 'Out of stock' : `${p.stock_quantity} left`}
                                        </span>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <p className="text-surface-400 text-xs">All products well stocked</p>
                        )}
                    </div>

                    {/* Return Requests */}
                    <div className="card">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-base font-bold text-surface-900 dark:text-white flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                                Return Requests
                            </h2>
                            <Link to="/admin/orders?status=return_requested" className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium">View all →</Link>
                        </div>
                        {returnOrders?.items && returnOrders.items.length > 0 ? (
                            <div className="space-y-2">
                                {returnOrders.items.map((order: any) => (
                                    <Link key={order.order_id} to={`/admin/orders/${order.order_id}`} className="flex items-center gap-2 text-sm hover:bg-surface-50 dark:hover:bg-surface-800 rounded-lg p-1.5 transition-colors">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-medium text-surface-800 dark:text-surface-200 truncate">#{order.order_id.slice(-8).toUpperCase()}</p>
                                            <p className="text-[11px] text-surface-400">{new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                                        </div>
                                        <span className="text-sm font-bold text-surface-900 dark:text-white">₹{Number(order.total_price).toLocaleString('en-IN')}</span>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <p className="text-surface-400 text-xs">No pending return requests</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Top Products */}
            <div className="card">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-surface-900 dark:text-white">Top Selling Products</h2>
                    <div className="flex gap-1 bg-surface-100 dark:bg-surface-800 rounded-xl p-1">
                        {(['today', '7d', '30d'] as const).map(p => (
                            <button
                                key={p}
                                onClick={() => setPeriod(p)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${period === p ? 'bg-white dark:bg-surface-700 text-primary-600 shadow-sm' : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'}`}
                            >
                                {p === 'today' ? 'Today' : p === '7d' ? '7 Days' : '30 Days'}
                            </button>
                        ))}
                    </div>
                </div>
                {topProducts && topProducts.length > 0 ? (
                    <div className="space-y-3">
                        {topProducts.slice(0, 5).map((p: any, i: number) => (
                            <div key={p.product_id} className="flex items-center gap-3 text-sm">
                                <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white ${i === 0 ? 'bg-gradient-to-br from-amber-400 to-amber-500' : i === 1 ? 'bg-gradient-to-br from-surface-300 to-surface-400' : i === 2 ? 'bg-gradient-to-br from-amber-600 to-amber-700' : 'bg-surface-200 dark:bg-surface-700 text-surface-600 dark:text-surface-400'}`}>{i + 1}</span>
                                <span className="flex-1 text-surface-800 dark:text-surface-200 text-sm truncate font-medium">{p.product_name}</span>
                                <span className="text-surface-500 dark:text-surface-400 text-xs">{p.units_sold} units</span>
                                <span className="font-bold text-surface-900 dark:text-white">₹{Number(p.revenue).toLocaleString('en-IN')}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-surface-400 text-sm">No data for this period</p>
                )}
            </div>

        </div>
    )
}
