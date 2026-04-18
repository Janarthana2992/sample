import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { orderService } from '../../services/orders'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import type { Order } from '../../types'

// ── Types ────────────────────────────────────────────────────
type ColSort = 'date_desc' | 'date_asc' | 'price_desc' | 'price_asc'

const STATUSES = [
    { key: 'pending',          label: 'Pending',          color: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800' },
    { key: 'confirmed',        label: 'Confirmed',        color: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' },
    { key: 'dispatched',       label: 'Dispatched',       color: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800' },
    { key: 'delivered',        label: 'Delivered',        color: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' },
    { key: 'cancelled',        label: 'Cancelled',        color: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' },
    { key: 'return_requested', label: 'Return Requested', color: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800' },
    { key: 'returned',         label: 'Returned',         color: 'bg-surface-50 dark:bg-surface-800 border-surface-200 dark:border-surface-700' },
]

const STATUS_BADGE: Record<string, string> = {
    pending:          'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
    confirmed:        'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    dispatched:       'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
    delivered:        'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    cancelled:        'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    return_requested: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
    returned:         'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300',
}

const NEXT_STATUSES: Record<string, string[]> = {
    pending:          ['confirmed', 'cancelled'],
    confirmed:        ['dispatched', 'cancelled'],
    dispatched:       ['delivered'],
    delivered:        [],
    cancelled:        [],
    return_requested: ['returned', 'delivered'],
    returned:         [],
}

const CARDS_PER_PAGE = 20

function sortOrders(orders: Order[], sort: ColSort): Order[] {
    return [...orders].sort((a, b) => {
        if (sort === 'date_desc') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        if (sort === 'date_asc')  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        if (sort === 'price_desc') return Number(b.total_price) - Number(a.total_price)
        if (sort === 'price_asc')  return Number(a.total_price) - Number(b.total_price)
        return 0
    })
}

// ── Kanban Column ─────────────────────────────────────────────
function KanbanColumn({
    status,
    label,
    colorClass,
    orders,
    totalInStatus,
    searchActive,
    onUpdateStatus,
    isPending,
}: {
    status: string
    label: string
    colorClass: string
    orders: Order[]
    totalInStatus: number
    searchActive: boolean
    onUpdateStatus: (orderId: string, newStatus: string) => void
    isPending: boolean
}) {
    const [colSort, setColSort] = useState<ColSort>('date_desc')
    const [showAll, setShowAll] = useState(false)

    const sorted = sortOrders(orders, colSort)
    const displayed = showAll ? sorted : sorted.slice(0, CARDS_PER_PAGE)
    const hasMore = sorted.length > CARDS_PER_PAGE
    const isEmpty = orders.length === 0

    return (
        <div
            className={`flex flex-col rounded-2xl border ${colorClass} transition-opacity ${searchActive && isEmpty ? 'opacity-40' : 'opacity-100'}`}
            style={{ minWidth: 280, width: 300, flexShrink: 0 }}
        >
            <div className="p-3 border-b border-inherit">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-sm text-surface-900 dark:text-white">{label}</h3>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-surface-600 dark:text-surface-300">
                        {searchActive ? `${orders.length}/${totalInStatus}` : totalInStatus}
                    </span>
                </div>
                <select
                    value={colSort}
                    onChange={e => setColSort(e.target.value as ColSort)}
                    className="w-full text-xs rounded-lg border border-surface-200 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-600 dark:text-surface-300 px-2 py-1"
                >
                    <option value="date_desc">Newest first</option>
                    <option value="date_asc">Oldest first</option>
                    <option value="price_desc">Price: high → low</option>
                    <option value="price_asc">Price: low → high</option>
                </select>
            </div>
            <div className="flex flex-col gap-2 p-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 320px)' }}>
                {displayed.map(order => (
                    <OrderCard
                        key={order.order_id}
                        order={order}
                        highlight={searchActive}
                        onUpdateStatus={onUpdateStatus}
                        isPending={isPending}
                    />
                ))}
                {isEmpty && searchActive && <p className="text-xs text-center text-surface-400 py-6">No matches</p>}
                {isEmpty && !searchActive && <p className="text-xs text-center text-surface-400 py-6">No orders</p>}
                {hasMore && !showAll && (
                    <button onClick={() => setShowAll(true)} className="text-xs text-primary-600 dark:text-primary-400 hover:underline py-1 text-center">
                        Show {sorted.length - CARDS_PER_PAGE} more
                    </button>
                )}
                {showAll && hasMore && (
                    <button onClick={() => setShowAll(false)} className="text-xs text-surface-500 hover:underline py-1 text-center">
                        Show less
                    </button>
                )}
            </div>
        </div>
    )
}

// ── Order Card ────────────────────────────────────────────────
function OrderCard({
    order,
    highlight,
    onUpdateStatus,
    isPending,
}: {
    order: Order
    highlight: boolean
    onUpdateStatus: (orderId: string, newStatus: string) => void
    isPending: boolean
}) {
    const nextStatuses = NEXT_STATUSES[order.status] ?? []
    const shortId = order.order_id.slice(0, 8).toUpperCase()

    return (
        <div className={`bg-white dark:bg-surface-900 rounded-xl p-3 shadow-sm border transition-all ${highlight ? 'border-blue-400 dark:border-blue-500 ring-1 ring-blue-300 dark:ring-blue-600' : 'border-surface-100 dark:border-surface-700'}`}>
            <div className="flex items-start justify-between gap-2 mb-2">
                <Link to={`/admin/orders/${order.order_id}`} className="text-xs font-mono font-semibold text-primary-600 dark:text-primary-400 hover:underline">
                    #{shortId}
                </Link>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_BADGE[order.status] ?? 'bg-surface-100 text-surface-600'}`}>
                    {order.status.replace(/_/g, ' ')}
                </span>
            </div>
            {order.items?.slice(0, 2).map(item => (
                <p key={item.order_item_id} className="text-xs text-surface-600 dark:text-surface-400 truncate">
                    {item.quantity}× {item.product_name ?? item.product_id.slice(0, 8)}
                </p>
            ))}
            {(order.items?.length ?? 0) > 2 && (
                <p className="text-xs text-surface-400">+{order.items.length - 2} more items</p>
            )}
            <div className="flex items-center justify-between mt-2">
                <span className="text-xs font-semibold text-surface-900 dark:text-white">
                    ₹{Number(order.total_price).toLocaleString('en-IN')}
                </span>
                <span className="text-[10px] text-surface-400">
                    {new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </span>
            </div>
            {nextStatuses.length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                    {nextStatuses.map(ns => (
                        <button
                            key={ns}
                            disabled={isPending}
                            onClick={() => onUpdateStatus(order.order_id, ns)}
                            className="text-[10px] px-2 py-0.5 rounded-full border border-surface-300 dark:border-surface-600 text-surface-600 dark:text-surface-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:border-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors disabled:opacity-50"
                        >
                            → {ns.replace(/_/g, ' ')}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

// ── Main Page ─────────────────────────────────────────────────
export default function AdminOrders() {
    const qc = useQueryClient()
    const [search, setSearch] = useState('')
    const searchRef = useRef<HTMLInputElement>(null)

    const { data, isLoading } = useQuery({
        queryKey: ['admin', 'orders'],
        queryFn: () => orderService.listOrders({ size: 500, page: 1 }),
    })

    const updateStatusMutation = useMutation({
        mutationFn: ({ orderId, status }: { orderId: string; status: string }) =>
            orderService.updateStatus(orderId, { status }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['admin', 'orders'] })
            toast.success('Order status updated')
        },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Update failed'),
    })

    if (isLoading) return <LoadingSpinner />

    const allOrders: Order[] = data?.items ?? []
    const searchQ = search.trim().toLowerCase()
    const searchActive = searchQ.length > 0

    const matchOrder = (order: Order) => {
        if (!searchActive) return true
        if (order.order_id.toLowerCase().includes(searchQ)) return true
        if (order.order_id.slice(0, 8).toLowerCase().includes(searchQ)) return true
        return order.items?.some(item => item.product_name?.toLowerCase().includes(searchQ))
    }

    const matchedOrders = allOrders.filter(matchOrder)
    const noResults = searchActive && matchedOrders.length === 0

    const totalsByStatus: Record<string, number> = {}
    for (const o of allOrders) {
        totalsByStatus[o.status] = (totalsByStatus[o.status] ?? 0) + 1
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Orders Pipeline</h1>
                <div className="relative w-72">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 12a7.5 7.5 0 0012.15 4.65z" />
                    </svg>
                    <input
                        ref={searchRef}
                        type="search"
                        className="input pl-9 text-sm"
                        placeholder="Search by order ID or product…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {noResults && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
                    No orders match <strong>"{search}"</strong> — try a partial order ID or product name.
                </div>
            )}

            <div className="flex gap-4 overflow-x-auto pb-4">
                {STATUSES.map(({ key, label, color }) => {
                    const colOrders = matchedOrders.filter(o => o.status === key)
                    return (
                        <KanbanColumn
                            key={key}
                            status={key}
                            label={label}
                            colorClass={color}
                            orders={colOrders}
                            totalInStatus={totalsByStatus[key] ?? 0}
                            searchActive={searchActive}
                            onUpdateStatus={(orderId, status) => updateStatusMutation.mutate({ orderId, status })}
                            isPending={updateStatusMutation.isPending}
                        />
                    )
                })}
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
                {STATUSES.map(({ key, label }) => {
                    const total = totalsByStatus[key] ?? 0
                    const shown = matchedOrders.filter(o => o.status === key).length
                    if (total === 0) return null
                    return (
                        <span key={key} className="text-xs px-3 py-1 rounded-full bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400">
                            {label}: {total}{searchActive && shown !== total ? ` (${shown} shown)` : ''}
                        </span>
                    )
                })}
                <span className="text-xs px-3 py-1 rounded-full bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400 font-semibold">
                    Total: {allOrders.length}
                </span>
            </div>
        </div>
    )
}

