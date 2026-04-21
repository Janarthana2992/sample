import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { orderService } from '../../services/orders'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import type { Order } from '../../types'

type Tab = 'return_requested' | 'cancelled'

const TAB_LABELS: Record<Tab, string> = {
    return_requested: 'Return Requests',
    cancelled: 'Cancellations',
}

function fmt(d: string) {
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function OrderRow({ order, onAction }: { order: Order; onAction: (orderId: string, approved: boolean, note?: string) => void }) {
    const [expanded, setExpanded] = useState(false)
    const [note, setNote] = useState('')

    const isReturn = order.status === 'return_requested'

    return (
        <div className="border border-surface-200 dark:border-surface-700 rounded-2xl overflow-hidden bg-white dark:bg-surface-800">
            {/* Header row */}
            <button
                onClick={() => setExpanded(v => !v)}
                className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors"
            >
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-mono text-xs font-bold text-surface-600 dark:text-surface-400">
                            #{order.order_id.slice(0, 8).toUpperCase()}
                        </span>
                        {isReturn ? (
                            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                                Return Requested
                            </span>
                        ) : (
                            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                Cancelled
                            </span>
                        )}
                        <span className="text-xs text-surface-500 dark:text-surface-400">{fmt(order.created_at)}</span>
                    </div>
                    <div className="mt-1 text-xs text-surface-600 dark:text-surface-400 truncate">
                        {order.items.map(i => i.product_name || i.product_id).join(', ')}
                    </div>
                    {isReturn && order.return_reason && (
                        <p className="mt-1 text-xs text-orange-700 dark:text-orange-400 font-medium">
                            Reason: {order.return_reason}
                        </p>
                    )}
                    {!isReturn && order.cancel_reason && (
                        <p className="mt-1 text-xs text-red-700 dark:text-red-400 font-medium">
                            Reason: {order.cancel_reason}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <span className="font-bold text-surface-900 dark:text-white text-sm">
                        ₹{Number(order.total_price).toLocaleString('en-IN')}
                    </span>
                    <svg
                        className={`w-4 h-4 text-surface-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </button>

            {/* Expanded detail */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="border-t border-surface-200 dark:border-surface-700 px-5 py-4 space-y-4">
                            {/* Order items */}
                            <div>
                                <p className="text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide mb-2">Items</p>
                                <div className="space-y-1">
                                    {order.items.map(item => (
                                        <div key={item.order_item_id} className="flex items-center justify-between text-sm">
                                            <span className="text-surface-700 dark:text-surface-300">{item.product_name} × {item.quantity}</span>
                                            <span className="text-surface-500">₹{Number(item.unit_price).toLocaleString('en-IN')}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Shipping address */}
                            {order.shipping_address && (
                                <div>
                                    <p className="text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide mb-1">Delivery Address</p>
                                    <p className="text-sm text-surface-700 dark:text-surface-300">
                                        {order.shipping_address.full_name} · {order.shipping_address.phone}
                                    </p>
                                    <p className="text-sm text-surface-500 dark:text-surface-400">
                                        {order.shipping_address.address_line1}, {order.shipping_address.city}, {order.shipping_address.state} — {order.shipping_address.pincode}
                                    </p>
                                </div>
                            )}

                            {/* Admin note + approve/reject (only for return requests) */}
                            {isReturn && (
                                <div className="space-y-3 pt-2 border-t border-surface-100 dark:border-surface-700">
                                    <p className="text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide">Admin Action</p>
                                    <textarea
                                        value={note}
                                        onChange={e => setNote(e.target.value)}
                                        placeholder="Add a note (optional)…"
                                        rows={2}
                                        className="w-full text-sm rounded-xl border border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-700 px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    />
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => onAction(order.order_id, false, note || undefined)}
                                            className="flex-1 py-2 rounded-xl border-2 border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 text-sm font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                        >
                                            Reject Return
                                        </button>
                                        <button
                                            onClick={() => onAction(order.order_id, true, note || undefined)}
                                            className="flex-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors"
                                        >
                                            ✓ Approve Return
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

export default function AdminReturnRequests() {
    const [tab, setTab] = useState<Tab>('return_requested')
    const [page, setPage] = useState(1)
    const qc = useQueryClient()

    const { data, isLoading } = useQuery({
        queryKey: ['admin', 'requests', tab, page],
        queryFn: () => orderService.listOrders({ status: tab, page, size: 20 }),
        refetchInterval: 30_000,
    })

    const approveMutation = useMutation({
        mutationFn: ({ orderId, approved, note }: { orderId: string; approved: boolean; note?: string }) =>
            orderService.approveReturn(orderId, approved, note),
        onSuccess: (_, vars) => {
            toast.success(vars.approved ? 'Return approved' : 'Return rejected')
            qc.invalidateQueries({ queryKey: ['admin', 'requests'] })
            qc.invalidateQueries({ queryKey: ['admin', 'kpis'] })
        },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Action failed'),
    })

    const orders: Order[] = data?.items ?? []

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Returns & Cancellations</h1>
                <span className="text-sm text-surface-500 dark:text-surface-400">{data?.total ?? 0} total</span>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-surface-100 dark:bg-surface-800 rounded-xl p-1 w-fit">
                {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
                    <button
                        key={t}
                        onClick={() => { setTab(t); setPage(1) }}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t ? 'bg-white dark:bg-surface-700 text-primary-600 shadow-sm' : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'}`}
                    >
                        {TAB_LABELS[t]}
                        {tab !== t && data?.total ? null : null}
                    </button>
                ))}
            </div>

            {isLoading ? <LoadingSpinner /> : orders.length === 0 ? (
                <div className="card text-center py-16">
                    <svg className="w-12 h-12 text-surface-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-surface-500 dark:text-surface-400 font-medium">
                        No {TAB_LABELS[tab].toLowerCase()} right now
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {orders.map(order => (
                        <OrderRow
                            key={order.order_id}
                            order={order}
                            onAction={(orderId, approved, note) =>
                                approveMutation.mutate({ orderId, approved, note })
                            }
                        />
                    ))}
                </div>
            )}

            {/* Pagination */}
            {data && data.total > 20 && (
                <div className="flex items-center justify-center gap-3">
                    <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary text-sm disabled:opacity-40">← Prev</button>
                    <span className="text-sm text-surface-600 dark:text-surface-400">Page {page} of {Math.ceil(data.total / 20)}</span>
                    <button disabled={page * 20 >= data.total} onClick={() => setPage(p => p + 1)} className="btn-secondary text-sm disabled:opacity-40">Next →</button>
                </div>
            )}
        </div>
    )
}
