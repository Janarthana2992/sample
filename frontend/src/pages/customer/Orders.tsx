import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { orderService } from '../../services/orders'
import { aiClient } from '../../services/api'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import { AnimatedPage, FadeInView } from '../../components/common/AnimatedPage'
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
    pending: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
    confirmed: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
    dispatched: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800',
    delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
    cancelled: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
    return_requested: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800',
    returned: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-800',
}

const STATUS_ICON_COLORS: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
    confirmed: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
    dispatched: 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400',
    delivered: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400',
    cancelled: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
    return_requested: 'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400',
    returned: 'bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-400',
}

const STATUS_ICONS: Record<string, string> = {
    pending: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
    confirmed: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    dispatched: 'M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0',
    delivered: 'M5 13l4 4L19 7',
    cancelled: 'M6 18L18 6M6 6l12 12',
    return_requested: 'M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6',
    returned: 'M9 11l3 3L22 4M16 21H3a2 2 0 01-2-2V5a2 2 0 012-2h11',
}

const ALL_STATUSES = ['all', 'pending', 'confirmed', 'dispatched', 'delivered', 'return_requested', 'returned', 'cancelled']
const TIME_FILTERS = [
    { value: 'all', label: 'All Time' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
    { value: '90d', label: 'Last 3 Months' },
    { value: '365d', label: 'Last Year' },
]

function daysAgo(days: number): Date {
    const d = new Date()
    d.setDate(d.getDate() - days)
    d.setHours(0, 0, 0, 0)
    return d
}

function formatRelativeDate(dateStr: string): string {
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const CANCEL_REASONS = [
    'Ordered by mistake',
    'Found a better price elsewhere',
    'Changed my mind',
    'Delivery time too long',
    'Duplicate order',
    'Other',
]

const RETURN_REASONS = [
    'Item damaged or defective',
    'Wrong item received',
    'Item not as described',
    'Missing parts or accessories',
    'Changed my mind',
    'Other',
]

function OrderActions({ orderId, status }: { orderId: string; status: string }) {
    const qc = useQueryClient()
    const [mode, setMode] = useState<'cancel' | 'return' | null>(null)
    const [reason, setReason] = useState('')
    const [custom, setCustom] = useState('')

    const finalReason = reason === 'Other' ? custom.trim() : reason

    const cancelMutation = useMutation({
        mutationFn: (r: string) => orderService.cancelOrder(orderId, r),
        onSuccess: () => {
            toast.success('Order cancelled successfully')
            qc.invalidateQueries({ queryKey: ['orders'] })
            setMode(null); setReason(''); setCustom('')
        },
        onError: (err: any) => {
            const detail = err.response?.data?.detail
            toast.error(Array.isArray(detail) ? detail[0]?.msg : detail || 'Could not cancel order')
        },
    })

    const returnMutation = useMutation({
        mutationFn: (r: string) => orderService.returnOrder(orderId, r),
        onSuccess: () => {
            toast.success('Return request submitted — pending admin review')
            qc.invalidateQueries({ queryKey: ['orders'] })
            setMode(null); setReason(''); setCustom('')
        },
        onError: (err: any) => {
            const detail = err.response?.data?.detail
            toast.error(Array.isArray(detail) ? detail[0]?.msg : detail || 'Could not submit return request')
        },
    })

    if (mode) {
        const isCancelMode = mode === 'cancel'
        const reasons = isCancelMode ? CANCEL_REASONS : RETURN_REASONS
        const isSubmitting = isCancelMode ? cancelMutation.isPending : returnMutation.isPending

        return (
            <div
                onClick={e => e.preventDefault()}
                className="mx-4 mb-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 space-y-2"
            >
                {/* Warning message */}
                <div className={`flex items-start gap-2 p-2.5 rounded-lg text-xs ${isCancelMode
                    ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
                    : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400'
                    }`}>
                    <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isCancelMode ? 'M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z' : 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'} /></svg>
                    <span>
                        {isCancelMode
                            ? 'This action cannot be undone. Your order will be permanently cancelled.'
                            : 'Your return request will be reviewed by our team. You will be notified once approved.'}
                    </span>
                </div>
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    {isCancelMode ? 'Why do you want to cancel?' : 'Why do you want to return?'}
                </p>
                <div className="flex flex-wrap gap-1.5">
                    {reasons.map(r => (
                        <button
                            key={r}
                            type="button"
                            onClick={() => setReason(r)}
                            className={`text-[11px] px-2.5 py-1 rounded-full border font-medium transition-colors
                                ${reason === r
                                    ? isCancelMode ? 'bg-red-500 text-white border-red-500' : 'bg-amber-500 text-white border-amber-500'
                                    : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-400'
                                }`}
                        >
                            {r}
                        </button>
                    ))}
                </div>
                {reason === 'Other' && (
                    <textarea
                        value={custom}
                        onChange={e => setCustom(e.target.value)}
                        placeholder="Please describe your reason…"
                        rows={2}
                        className="w-full text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2.5 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                )}
                <div className="flex justify-end gap-2 pt-1">
                    <button
                        type="button"
                        onClick={() => { setMode(null); setReason(''); setCustom('') }}
                        className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-2.5 py-1 rounded-lg"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={!finalReason || isSubmitting}
                        onClick={() => isCancelMode ? cancelMutation.mutate(finalReason) : returnMutation.mutate(finalReason)}
                        className={`text-xs text-white px-3 py-1 rounded-lg font-medium disabled:opacity-50 transition-colors
                            ${isCancelMode ? 'bg-red-500 hover:bg-red-600' : 'bg-amber-500 hover:bg-amber-600'}`}
                    >
                        {isSubmitting ? 'Submitting…' : isCancelMode ? 'Confirm Cancel' : 'Submit Return'}
                    </button>
                </div>
            </div>
        )
    }

    if (status === 'pending' || status === 'confirmed') {
        return (
            <div className="px-4 sm:px-5 pb-3 flex justify-end">
                <button
                    onClick={e => { e.preventDefault(); setMode('cancel') }}
                    className="text-xs text-red-600 dark:text-red-400 hover:underline font-medium"
                >
                    Cancel Order
                </button>
            </div>
        )
    }

    if (status === 'delivered') {
        return (
            <div className="px-4 sm:px-5 pb-3 flex justify-end">
                <button
                    onClick={e => { e.preventDefault(); setMode('return') }}
                    className="text-xs text-amber-600 dark:text-amber-400 hover:underline font-medium"
                >
                    Request Return
                </button>
            </div>
        )
    }

    if (status === 'return_requested') {
        return (
            <div className="px-4 sm:px-5 pb-3 flex justify-end">
                <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Return Requested</span>
            </div>
        )
    }

    return null
}

export default function Orders() {
    const { user } = useAuthStore()
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')
    const [timeFilter, setTimeFilter] = useState('all')

    const { data, isLoading } = useQuery({
        queryKey: ['orders'],
        queryFn: () => orderService.listOrders({ size: 100 }),
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

    // Client-side filtering
    const filteredOrders = useMemo(() => {
        if (!data?.items) return []
        let items = data.items

        // Status filter
        if (statusFilter !== 'all') {
            items = items.filter(o => o.status === statusFilter)
        }

        // Time filter
        if (timeFilter !== 'all') {
            const days = parseInt(timeFilter)
            const cutoff = daysAgo(days)
            items = items.filter(o => new Date(o.created_at) >= cutoff)
        }

        // Search filter (order ID, product names, tracking number)
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim()
            items = items.filter(o =>
                o.order_id.toLowerCase().includes(q) ||
                o.items.some(item => item.product_name?.toLowerCase().includes(q)) ||
                o.tracking_number?.toLowerCase().includes(q) ||
                o.payment_method?.toLowerCase().includes(q)
            )
        }

        return items
    }, [data, statusFilter, timeFilter, searchQuery])

    // Status counts for filter pills
    const statusCounts = useMemo(() => {
        if (!data?.items) return {} as Record<string, number>
        const counts: Record<string, number> = { all: data.items.length }
        for (const o of data.items) {
            counts[o.status] = (counts[o.status] || 0) + 1
        }
        return counts
    }, [data])

    if (isLoading) return <LoadingSpinner />

    return (
        <AnimatedPage>
            <div className="space-y-6">
                {/* Header */}
                <div>
                    <h1 className="text-2xl font-bold text-surface-900 dark:text-white">My Orders</h1>
                    <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">Track and manage your purchases</p>
                </div>

                {/* Recommendations at top */}
                {recommendations && recommendations.length > 0 && (
                    <FadeInView>
                        <section className="bg-gradient-to-r from-primary-50 via-blue-50 to-purple-50 dark:from-primary-900/20 dark:via-blue-900/20 dark:to-purple-900/20 rounded-2xl p-5 border border-primary-100 dark:border-primary-800/40">
                            <div className="flex items-center gap-2 mb-1">
                                <svg className="w-5 h-5 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                                <h2 className="text-base font-bold text-surface-900 dark:text-white">Recommended For You</h2>
                            </div>
                            <p className="text-xs text-surface-500 dark:text-surface-400 mb-4">Based on your order history</p>
                            <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
                                {recommendations.map(rec => (
                                    <Link
                                        key={rec.product_id}
                                        to={`/products/${rec.product_id}`}
                                        className="shrink-0 w-36 bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 overflow-hidden group"
                                    >
                                        <div className="w-full aspect-square bg-surface-100 dark:bg-surface-700 flex items-center justify-center overflow-hidden">
                                            {rec.image_url
                                                ? <img src={rec.image_url} alt={rec.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                                                : <svg className="w-8 h-8 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                                            }
                                        </div>
                                        <div className="p-2.5">
                                            <p className="text-xs font-medium text-surface-800 dark:text-surface-200 line-clamp-2 leading-snug mb-1">{rec.name || 'View Product'}</p>
                                            {rec.selling_price && (
                                                <div className="flex items-baseline gap-1">
                                                    <span className="text-sm font-bold text-surface-900 dark:text-white">₹{Number(rec.selling_price).toLocaleString('en-IN')}</span>
                                                    {rec.mrp && rec.mrp > rec.selling_price && (
                                                        <span className="text-[10px] text-surface-400 line-through">₹{Number(rec.mrp).toLocaleString('en-IN')}</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </section>
                    </FadeInView>
                )}

                {!data || data.items.length === 0 ? (
                    <div className="text-center py-20">
                        <div className="mx-auto w-20 h-20 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center mb-4">
                            <svg className="w-10 h-10 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                        </div>
                        <p className="text-lg font-semibold text-surface-700 dark:text-surface-300">No orders yet</p>
                        <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">Your order history will appear here</p>
                        <Link to="/products" className="btn-primary mt-6 inline-block">Start Shopping</Link>
                    </div>
                ) : (
                    <>
                        {/* Search & Filters */}
                        <div className="space-y-3">
                            {/* Search bar */}
                            <div className="relative">
                                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                <input
                                    type="text"
                                    placeholder="Search by order ID, product name, or tracking number..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="input pl-10 w-full"
                                />
                                {searchQuery && (
                                    <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                )}
                            </div>

                            {/* Status filter pills + time filter */}
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="flex gap-1.5 flex-wrap flex-1">
                                    {ALL_STATUSES.map(s => (
                                        <button
                                            key={s}
                                            onClick={() => setStatusFilter(s)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 border ${statusFilter === s
                                                ? s === 'all'
                                                    ? 'bg-surface-900 text-white border-surface-900 dark:bg-white dark:text-surface-900 dark:border-white'
                                                    : (STATUS_COLORS[s] || 'bg-surface-100 text-surface-700 border-surface-200')
                                                : 'bg-white dark:bg-surface-800 text-surface-600 dark:text-surface-400 border-surface-200 dark:border-surface-700 hover:border-surface-400 dark:hover:border-surface-500'
                                                }`}
                                        >
                                            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                                            {(statusCounts[s] || 0) > 0 && (
                                                <span className="ml-1 opacity-70">({statusCounts[s]})</span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                                <select
                                    value={timeFilter}
                                    onChange={e => setTimeFilter(e.target.value)}
                                    className="input py-1.5 px-3 text-xs font-medium w-auto min-w-[130px]"
                                >
                                    {TIME_FILTERS.map(t => (
                                        <option key={t.value} value={t.value}>{t.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Results summary */}
                        <div className="flex items-center justify-between">
                            <p className="text-xs text-surface-500 dark:text-surface-400">
                                {filteredOrders.length === data.items.length
                                    ? `${data.items.length} order${data.items.length !== 1 ? 's' : ''}`
                                    : `${filteredOrders.length} of ${data.items.length} orders`
                                }
                            </p>
                            {(statusFilter !== 'all' || timeFilter !== 'all' || searchQuery) && (
                                <button
                                    onClick={() => { setStatusFilter('all'); setTimeFilter('all'); setSearchQuery('') }}
                                    className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium"
                                >
                                    Clear all filters
                                </button>
                            )}
                        </div>

                        {/* Order list */}
                        {filteredOrders.length === 0 ? (
                            <div className="text-center py-12">
                                <svg className="mx-auto w-12 h-12 text-surface-300 dark:text-surface-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                <p className="text-sm font-medium text-surface-600 dark:text-surface-400">No orders match your filters</p>
                                <p className="text-xs text-surface-400 dark:text-surface-500 mt-1">Try adjusting your search or filters</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <AnimatePresence mode="popLayout">
                                    {filteredOrders.map((order, i) => (
                                        <motion.div
                                            key={order.order_id}
                                            layout
                                            initial={{ opacity: 0, y: 12 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            transition={{ duration: 0.25, delay: i * 0.03 }}
                                        >
                                            <Link to={`/orders/${order.order_id}`} className="block bg-white dark:bg-surface-800 rounded-2xl border border-surface-200 dark:border-surface-700 hover:shadow-lg hover:border-primary-200 dark:hover:border-primary-800 transition-all duration-200 overflow-hidden group">
                                                <div className="p-4 sm:p-5">
                                                    {/* Top row: order ID, date, status */}
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${STATUS_ICON_COLORS[order.status] || 'bg-surface-100 text-surface-500'}`}>
                                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={STATUS_ICONS[order.status] || 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4'} /></svg>
                                                            </div>
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <p className="text-sm font-bold text-surface-900 dark:text-white font-mono">#{order.order_id.slice(0, 8).toUpperCase()}</p>
                                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${STATUS_COLORS[order.status] || 'bg-surface-100 text-surface-700 border-surface-200'}`}>
                                                                        {order.status}
                                                                    </span>
                                                                </div>
                                                                <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
                                                                    Placed {formatRelativeDate(order.created_at)} · {new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <svg className="w-5 h-5 text-surface-300 group-hover:text-primary-500 transition-colors shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                                    </div>

                                                    {/* Product items preview */}
                                                    <div className="mt-3 ml-13">
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {order.items.slice(0, 3).map((item, idx) => (
                                                                <span key={idx} className="inline-flex items-center text-xs bg-surface-50 dark:bg-surface-700/50 text-surface-600 dark:text-surface-300 px-2 py-1 rounded-lg">
                                                                    {item.product_name || 'Product'} × {item.quantity}
                                                                </span>
                                                            ))}
                                                            {order.items.length > 3 && (
                                                                <span className="inline-flex items-center text-xs text-surface-400 dark:text-surface-500 px-2 py-1">
                                                                    +{order.items.length - 3} more
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Bottom row: price, payment, tracking */}
                                                    <div className="mt-3 ml-13 flex items-center justify-between flex-wrap gap-2">
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-lg font-bold text-surface-900 dark:text-white">₹{Number(order.total_price).toLocaleString('en-IN')}</span>
                                                            {order.payment_method && (
                                                                <span className="text-[10px] font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500 bg-surface-100 dark:bg-surface-700/50 px-2 py-0.5 rounded">
                                                                    {order.payment_method}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {order.tracking_number && (
                                                                <span className="text-xs text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-2.5 py-1 rounded-full font-medium flex items-center gap-1">
                                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>
                                                                    {order.tracking_number}
                                                                </span>
                                                            )}
                                                            {order.estimated_delivery && (
                                                                <span className="text-xs text-surface-500 dark:text-surface-400">
                                                                    Est. {new Date(order.estimated_delivery).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Progress bar for active orders */}
                                                {order.status !== 'cancelled' && order.status !== 'delivered' && (
                                                    <div className="h-1 bg-surface-100 dark:bg-surface-700">
                                                        <div
                                                            className="h-full bg-gradient-to-r from-primary-500 to-primary-400 transition-all duration-500"
                                                            style={{ width: `${(['pending', 'confirmed', 'dispatched', 'delivered'].indexOf(order.status) + 1) * 25}%` }}
                                                        />
                                                    </div>
                                                )}
                                            </Link>
                                            <OrderActions orderId={order.order_id} status={order.status} />
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        )}
                    </>
                )}
            </div>
        </AnimatedPage>
    )
}
