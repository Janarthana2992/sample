import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { orderService } from '../../services/orders'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import type { Order } from '../../types'

// ── Pipeline columns ──────────────────────────────────────────────────────────
const COLUMNS: { key: string; label: string; color: string; bg: string; border: string; dot: string }[] = [
    { key: 'pending', label: 'Pending', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800', dot: 'bg-amber-400' },
    { key: 'confirmed', label: 'Confirmed', color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-800', dot: 'bg-blue-400' },
    { key: 'dispatched', label: 'Dispatched', color: 'text-purple-700 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/20', border: 'border-purple-200 dark:border-purple-800', dot: 'bg-purple-400' },
    { key: 'delivered', label: 'Delivered', color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800', dot: 'bg-emerald-400' },
    { key: 'return_requested', label: 'Return Req.', color: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-200 dark:border-orange-800', dot: 'bg-orange-400' },
    { key: 'returned', label: 'Returned', color: 'text-teal-700 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-900/20', border: 'border-teal-200 dark:border-teal-800', dot: 'bg-teal-400' },
    { key: 'cancelled', label: 'Cancelled', color: 'text-red-700 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-800', dot: 'bg-red-400' },
]

// Allowed drag→drop transitions
const ALLOWED: Record<string, string[]> = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['dispatched', 'cancelled'],
    dispatched: ['delivered'],
    delivered: ['return_requested'],
    return_requested: ['returned', 'delivered'],
    returned: [],
    cancelled: [],
}

function canDrop(from: string, to: string) {
    return from !== to && (ALLOWED[from] ?? []).includes(to)
}

// ── Order card ────────────────────────────────────────────────────────────────
function OrderCard({ order, onDragStart }: {
    order: Order
    onDragStart: (e: React.DragEvent, orderId: string, fromStatus: string) => void
}) {
    return (
        <div
            draggable
            onDragStart={e => onDragStart(e, order.order_id, order.status)}
            className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-3 shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing select-none transition-shadow group"
        >
            <div className="flex items-center justify-between mb-2">
                <Link
                    to={`/admin/orders/${order.order_id}`}
                    onClick={e => e.stopPropagation()}
                    className="font-mono text-xs font-bold text-surface-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400"
                >
                    #{order.order_id.slice(0, 8).toUpperCase()}
                </Link>
                <span className="text-[10px] text-surface-400 dark:text-surface-500">
                    {new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </span>
            </div>
            <div className="space-y-0.5 mb-2">
                {order.items.slice(0, 2).map((item: any) => (
                    <p key={item.order_item_id} className="text-[11px] text-surface-600 dark:text-surface-400 truncate">
                        {item.product_name || 'Product'} <span className="text-surface-400">×{item.quantity}</span>
                    </p>
                ))}
                {order.items.length > 2 && <p className="text-[10px] text-surface-400">+{order.items.length - 2} more</p>}
            </div>
            <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-surface-900 dark:text-white">
                    ₹{Number(order.total_price).toLocaleString('en-IN')}
                </span>
                {order.payment_method && (
                    <span className="text-[10px] uppercase tracking-wide text-surface-400 bg-surface-100 dark:bg-surface-700 px-1.5 py-0.5 rounded">
                        {order.payment_method}
                    </span>
                )}
            </div>
            {order.tracking_number && (
                <p className="mt-1.5 text-[10px] text-purple-600 dark:text-purple-400 truncate">🚚 {order.tracking_number}</p>
            )}
            <p className="mt-1.5 text-[10px] text-surface-400 opacity-0 group-hover:opacity-100 transition-opacity">Drag to change stage</p>
        </div>
    )
}

// ── Column ────────────────────────────────────────────────────────────────────
function KanbanColumn({ col, orders, draggingFrom, onDragStart, onDrop }: {
    col: typeof COLUMNS[0]
    orders: Order[]
    draggingFrom: string | null
    onDragStart: (e: React.DragEvent, orderId: string, fromStatus: string) => void
    onDrop: (toStatus: string) => void
}) {
    const [over, setOver] = useState(false)
    const droppable = draggingFrom !== null && canDrop(draggingFrom, col.key)

    return (
        <div className="flex flex-col w-[220px] flex-shrink-0">
            {/* Header */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-t-xl border-t border-x ${col.border} ${col.bg}`}>
                <span className={`w-2 h-2 rounded-full ${col.dot} flex-shrink-0`} />
                <span className={`text-xs font-bold uppercase tracking-wide ${col.color}`}>{col.label}</span>
                <span className={`ml-auto text-xs font-semibold ${col.color} opacity-60`}>{orders.length}</span>
            </div>
            {/* Drop zone */}
            <div
                onDragOver={e => { if (droppable) { e.preventDefault(); setOver(true) } }}
                onDragLeave={() => setOver(false)}
                onDrop={e => { e.preventDefault(); setOver(false); if (droppable) onDrop(col.key) }}
                className={`flex-1 min-h-[140px] rounded-b-xl border p-2 space-y-2 transition-all duration-150
                    ${over && droppable
                        ? `${col.bg} ring-2 ring-inset ${col.border} shadow-inner`
                        : droppable
                            ? `${col.bg} border-dashed ${col.border} opacity-80`
                            : `bg-surface-50 dark:bg-surface-900/40 border-surface-200 dark:border-surface-700`
                    }`}
            >
                {over && droppable && (
                    <div className={`flex items-center justify-center h-12 rounded-lg border-2 border-dashed ${col.border} ${col.color} text-xs font-semibold`}>
                        ↓ Move to {col.label}
                    </div>
                )}
                {droppable && !over && orders.length === 0 && (
                    <p className={`text-center text-[10px] font-medium ${col.color} opacity-40 pt-4`}>Drop here</p>
                )}
                {orders.map(order => (
                    <OrderCard key={order.order_id} order={order} onDragStart={onDragStart} />
                ))}
            </div>
        </div>
    )
}

export default function AdminOrders() {
    const [searchId, setSearchId] = useState('')
    const [draggingFrom, setDraggingFrom] = useState<string | null>(null)
    const draggingOrderId = useRef<string | null>(null)
    const draggingFromStatus = useRef<string | null>(null)
    const qc = useQueryClient()

    const { data, isLoading } = useQuery({
        queryKey: ['admin', 'orders', 'kanban'],
        queryFn: () => orderService.listOrders({ size: 200 }),
        refetchInterval: 30_000,
    })

    const allOrders: Order[] = data?.items ?? []
    const filteredOrders = searchId.trim()
        ? allOrders.filter(o =>
            o.order_id.toLowerCase().includes(searchId.toLowerCase()) ||
            o.items.some((i: any) => i.product_name?.toLowerCase().includes(searchId.toLowerCase()))
        )
        : allOrders

    // Group by status
    const byStatus: Record<string, Order[]> = {}
    for (const col of COLUMNS) byStatus[col.key] = []
    for (const order of filteredOrders) {
        if (byStatus[order.status]) byStatus[order.status].push(order)
    }

    const statusMutation = useMutation({
        mutationFn: ({ orderId, newStatus, tracking }: { orderId: string; newStatus: string; tracking?: string }) =>
            orderService.updateStatus(orderId, { status: newStatus, ...(tracking ? { tracking_number: tracking } : {}) }),
        onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['admin', 'orders'] }); toast.success('Order moved') },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update status'),
    })

    const handleDragStart = (e: React.DragEvent, orderId: string, fromStatus: string) => {
        draggingOrderId.current = orderId
        draggingFromStatus.current = fromStatus
        setDraggingFrom(fromStatus)
        e.dataTransfer.effectAllowed = 'move'
    }

    const handleDragEnd = () => {
        draggingOrderId.current = null
        draggingFromStatus.current = null
        setDraggingFrom(null)
    }

    const handleDrop = (toStatus: string) => {
        const orderId = draggingOrderId.current
        const fromStatus = draggingFromStatus.current
        if (!orderId || !fromStatus || !canDrop(fromStatus, toStatus)) return
        let tracking: string | undefined
        if (toStatus === 'dispatched') tracking = prompt('Enter tracking number (optional):') ?? undefined
        statusMutation.mutate({ orderId, newStatus: toStatus, tracking })
    }

    if (isLoading) return <LoadingSpinner />

    return (
        <div className="space-y-4 h-full" onDragEnd={handleDragEnd}>
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Orders Pipeline</h1>
                    <p className="text-sm text-surface-500 dark:text-surface-400 mt-0.5">Drag cards between stages to update status</p>
                </div>
                <div className="flex items-center gap-3">
                    <input
                        type="search"
                        className="input w-56"
                        placeholder="Search order ID or product…"
                        value={searchId}
                        onChange={e => setSearchId(e.target.value)}
                    />
                    <span className="text-sm text-surface-500 dark:text-surface-400 whitespace-nowrap">{allOrders.length} total</span>
                </div>
            </div>

            <p className="text-xs text-surface-500 dark:text-surface-400 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
                </svg>
                Drag a card to a highlighted column · Flow: Pending → Confirmed → Dispatched → Delivered
            </p>

            <div className="overflow-x-auto pb-4">
                <div className="flex gap-3 min-w-max">
                    {COLUMNS.map(col => (
                        <KanbanColumn
                            key={col.key}
                            col={col}
                            orders={byStatus[col.key] ?? []}
                            draggingFrom={draggingFrom}
                            onDragStart={handleDragStart}
                            onDrop={handleDrop}
                        />
                    ))}
                </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-2 border-t border-surface-100 dark:border-surface-800">
                {COLUMNS.map(col => (
                    <div key={col.key} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${col.bg} ${col.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${col.dot}`} />
                        {col.label}: {(byStatus[col.key] ?? []).length}
                    </div>
                ))}
            </div>
        </div>
    )
}
