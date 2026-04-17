import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { motion } from 'framer-motion'
import { orderService } from '../../services/orders'
import { useAuthStore } from '../../store/authStore'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import { AnimatedPage } from '../../components/common/AnimatedPage'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { useState, useCallback } from 'react'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow })

const STATUS_STEPS = ['pending', 'confirmed', 'dispatched', 'delivered']

export default function OrderDetail() {
    const { orderId } = useParams<{ orderId: string }>()
    const { user } = useAuthStore()
    const qc = useQueryClient()

    const { data: order, isLoading } = useQuery({
        queryKey: ['order', orderId],
        queryFn: () => orderService.getOrder(orderId!),
        enabled: !!orderId,
    })

    const { data: paymentConfig } = useQuery({
        queryKey: ['payment-config'],
        queryFn: orderService.getPaymentConfig,
    })

    const [confirming, setConfirming] = useState<'cancel' | 'return' | null>(null)
    const [reason, setReason] = useState('')
    const [customReason, setCustomReason] = useState('')

    const CANCEL_REASONS = ['Ordered by mistake', 'Found a better price elsewhere', 'Changed my mind', 'Delivery time too long', 'Duplicate order', 'Other']
    const RETURN_REASONS = ['Item damaged or defective', 'Wrong item received', 'Item not as described', 'Missing parts or accessories', 'Changed my mind', 'Other']
    const finalReason = reason === 'Other' ? customReason.trim() : reason

    const cancelMutation = useMutation({
        mutationFn: () => orderService.cancelOrder(orderId!, finalReason),
        onSuccess: () => {
            toast.success('Order cancelled successfully')
            qc.invalidateQueries({ queryKey: ['order', orderId] })
            qc.invalidateQueries({ queryKey: ['orders'] })
            setConfirming(null); setReason(''); setCustomReason('')
        },
        onError: (err: any) => { toast.error(err.response?.data?.detail || 'Could not cancel order') },
    })

    const returnMutation = useMutation({
        mutationFn: () => orderService.returnOrder(orderId!, finalReason),
        onSuccess: () => {
            toast.success('Return request submitted')
            qc.invalidateQueries({ queryKey: ['order', orderId] })
            setConfirming(null); setReason(''); setCustomReason('')
        },
        onError: (err: any) => { toast.error(err.response?.data?.detail || 'Could not submit return request') },
    })

    const handleRetryPayment = () => {
        if (!order || !order.razorpay_order_id || !paymentConfig?.razorpay_key_id || !window.Razorpay) return
        const options = {
            key: paymentConfig.razorpay_key_id,
            amount: Math.round(Number(order.total_price) * 100),
            currency: 'INR',
            name: 'ShopHere',
            description: `Order #${order.order_id.slice(0, 8).toUpperCase()}`,
            order_id: order.razorpay_order_id,
            prefill: { name: user?.full_name || '', email: user?.email || '' },
            handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
                try {
                    await orderService.verifyPayment(order.order_id, {
                        razorpay_order_id: response.razorpay_order_id,
                        razorpay_payment_id: response.razorpay_payment_id,
                        razorpay_signature: response.razorpay_signature,
                    })
                    toast.success('Payment successful!')
                    qc.invalidateQueries({ queryKey: ['order', orderId] })
                } catch {
                    toast.error('Payment verification failed.')
                }
            },
            theme: { color: '#2563eb' },
        }
        new window.Razorpay(options).open()
    }

    const handleDownloadPDF = () => {
        if (!order) return
        const win = window.open('', '_blank')
        if (!win) return

        const fmt = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
        const money = (n: number) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })

        const itemRows = order.items.map((item: any) => `
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#1f2937;">${item.product_name || item.product_id.slice(0, 8)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:13px;color:#374151;">${item.quantity}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:13px;color:#374151;">${money(item.unit_price)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:13px;font-weight:600;color:#111827;">${money(item.quantity * Number(item.unit_price))}</td>
          </tr>`).join('')

        const discountRow = Number(order.deal_discount) > 0 ? `
          <tr>
            <td colspan="3" style="padding:8px 12px;text-align:right;font-size:13px;color:#16a34a;">Discount</td>
            <td style="padding:8px 12px;text-align:right;font-size:13px;color:#16a34a;font-weight:600;">–${money(order.deal_discount)}</td>
          </tr>` : ''

        const addr = order.shipping_address
        const addrBlock = addr ? `
          <div style="flex:1;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;">
            <p style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;letter-spacing:.05em;margin:0 0 8px;">Shipping Address</p>
            <p style="margin:0 0 3px;font-weight:600;font-size:13px;color:#111827;">${addr.full_name}</p>
            <p style="margin:0 0 3px;font-size:13px;color:#374151;">${addr.phone}</p>
            <p style="margin:0 0 3px;font-size:13px;color:#374151;">${addr.address_line1}${addr.address_line2 ? ', ' + addr.address_line2 : ''}</p>
            <p style="margin:0;font-size:13px;color:#374151;">${addr.city}, ${addr.state} – ${addr.pincode}</p>
          </div>` : ''

        const statusColor: Record<string, string> = {
            pending: '#d97706', confirmed: '#2563eb', dispatched: '#7c3aed', delivered: '#16a34a', cancelled: '#dc2626', return_requested: '#ea580c', returned: '#0d9488'
        }

        win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Invoice – Order #${order.order_id.slice(0, 8).toUpperCase()}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#111827;padding:40px;max-width:780px;margin:0 auto;}
    @media print{body{padding:20px;}}
  </style>
</head>
<body>
  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:2px solid #2563eb;margin-bottom:28px;">
    <div>
      <p style="font-size:24px;font-weight:800;color:#2563eb;margin:0;">🛒 ShopHere</p>
      <p style="font-size:12px;color:#6b7280;margin-top:4px;">Order Invoice</p>
    </div>
    <div style="text-align:right;">
      <p style="font-size:18px;font-weight:700;color:#111827;margin:0;">Order #${order.order_id.slice(0, 8).toUpperCase()}</p>
      <p style="font-size:12px;color:#6b7280;margin-top:4px;">Placed: ${fmt(order.created_at)}</p>
      <span style="display:inline-block;margin-top:6px;padding:3px 10px;border-radius:9999px;font-size:11px;font-weight:700;text-transform:capitalize;background:${statusColor[order.status] ?? '#6b7280'}20;color:${statusColor[order.status] ?? '#6b7280'};border:1px solid ${statusColor[order.status] ?? '#6b7280'}40;">${order.status}</span>
    </div>
  </div>

  <!-- Order info row -->
  <div style="display:flex;gap:16px;margin-bottom:28px;">
    <div style="flex:1;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;">
      <p style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;letter-spacing:.05em;margin:0 0 8px;">Payment</p>
      <p style="font-size:13px;font-weight:600;color:#111827;text-transform:capitalize;margin:0 0 4px;">${order.payment_method || '—'}</p>
      <span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;background:${order.payment_status === 'paid' ? '#dcfce7' : '#fef3c7'};color:${order.payment_status === 'paid' ? '#16a34a' : '#d97706'};">${order.payment_status}</span>
    </div>
    ${order.estimated_delivery ? `
    <div style="flex:1;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 16px;">
      <p style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;letter-spacing:.05em;margin:0 0 8px;">Estimated Delivery</p>
      <p style="font-size:15px;font-weight:700;color:#2563eb;margin:0;">${fmt(order.estimated_delivery)}</p>
      ${order.tracking_number ? `<p style="font-size:12px;color:#7c3aed;margin-top:6px;">Tracking: <strong>${order.tracking_number}</strong></p>` : ''}
    </div>` : ''}
    ${addrBlock}
  </div>

  <!-- Items table -->
  <p style="font-size:13px;font-weight:700;text-transform:uppercase;color:#6b7280;letter-spacing:.05em;margin-bottom:10px;">Items Ordered</p>
  <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
    <thead>
      <tr style="background:#f3f4f6;">
        <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.04em;">Product</th>
        <th style="padding:10px 12px;text-align:center;font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.04em;width:60px;">Qty</th>
        <th style="padding:10px 12px;text-align:right;font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.04em;width:110px;">Unit Price</th>
        <th style="padding:10px 12px;text-align:right;font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.04em;width:110px;">Subtotal</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
    <tfoot>
      ${discountRow}
      <tr style="background:#f9fafb;">
        <td colspan="3" style="padding:12px 12px;text-align:right;font-size:15px;font-weight:700;color:#111827;border-top:2px solid #d1d5db;">Total</td>
        <td style="padding:12px 12px;text-align:right;font-size:15px;font-weight:700;color:#2563eb;border-top:2px solid #d1d5db;">${money(order.total_price)}</td>
      </tr>
    </tfoot>
  </table>

  <!-- Footer -->
  <p style="margin-top:32px;text-align:center;font-size:11px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:16px;">
    Thank you for shopping with ShopHere! For queries, contact support@shophere.com
  </p>
</body>
</html>`)
        win.document.close()
        win.focus()
        // Use afterprint event so the window closes only after the user dismisses the print dialog
        win.addEventListener('afterprint', () => win.close())
        win.print()
    }

    if (isLoading) return <LoadingSpinner />
    if (!order) return (
        <div className="text-center py-20">
            <svg className="mx-auto h-16 w-16 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            <p className="mt-4 text-lg font-semibold text-surface-700 dark:text-surface-300">Order not found</p>
            <Link to="/orders" className="mt-4 inline-block btn-primary">View Orders</Link>
        </div>
    )

    const statusIndex = STATUS_STEPS.indexOf(order.status)
    const isCancelled = order.status === 'cancelled'
    const isReturned = order.status === 'returned'
    const isTerminal = isCancelled || isReturned
    const fmt = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

    return (
        <AnimatedPage>
            <div className="space-y-6 max-w-3xl">
                {/* Page header */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                        <Link to="/orders" className="w-9 h-9 rounded-xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center text-surface-500 hover:text-surface-900 dark:hover:text-white hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold text-surface-900 dark:text-white">
                                Order <span className="font-mono text-primary-600 dark:text-primary-400">#{order.order_id.slice(0, 8).toUpperCase()}</span>
                            </h1>
                            <p className="text-sm text-surface-500 dark:text-surface-400 mt-0.5">Placed on {fmt(order.created_at)}</p>
                        </div>
                    </div>
                    <button onClick={handleDownloadPDF} className="btn-secondary text-sm flex items-center gap-2 shrink-0">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        Download Invoice
                    </button>
                    {/* Customer Cancel */}
                    {(order.status === 'pending' || order.status === 'confirmed') && (
                        confirming === 'cancel' ? (
                            <div className="shrink-0 space-y-2 min-w-[260px]">
                                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Why are you cancelling?</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {CANCEL_REASONS.map(r => (
                                        <button key={r} type="button" onClick={() => setReason(r)}
                                            className={`text-[11px] px-2.5 py-1 rounded-full border font-medium transition-colors ${reason === r ? 'bg-red-500 text-white border-red-500' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400'}`}>
                                            {r}
                                        </button>
                                    ))}
                                </div>
                                {reason === 'Other' && (
                                    <textarea value={customReason} onChange={e => setCustomReason(e.target.value)}
                                        placeholder="Describe your reason…" rows={2}
                                        className="w-full text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2.5 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-red-400" />
                                )}
                                <div className="flex gap-2">
                                    <button onClick={() => { setConfirming(null); setReason(''); setCustomReason('') }} className="btn-ghost text-xs shrink-0">Back</button>
                                    <button onClick={() => cancelMutation.mutate()} disabled={!finalReason || cancelMutation.isPending}
                                        className="btn-ghost text-xs text-white bg-red-500 hover:bg-red-600 border-red-500 shrink-0 disabled:opacity-50">
                                        {cancelMutation.isPending ? 'Cancelling…' : 'Confirm Cancel'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button onClick={() => setConfirming('cancel')}
                                className="btn-ghost text-sm text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 shrink-0">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                Cancel Order
                            </button>
                        )
                    )}
                    {/* Return Request */}
                    {order.status === 'delivered' && (
                        confirming === 'return' ? (
                            <div className="shrink-0 space-y-2 min-w-[260px]">
                                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Why are you returning?</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {RETURN_REASONS.map(r => (
                                        <button key={r} type="button" onClick={() => setReason(r)}
                                            className={`text-[11px] px-2.5 py-1 rounded-full border font-medium transition-colors ${reason === r ? 'bg-amber-500 text-white border-amber-500' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400'}`}>
                                            {r}
                                        </button>
                                    ))}
                                </div>
                                {reason === 'Other' && (
                                    <textarea value={customReason} onChange={e => setCustomReason(e.target.value)}
                                        placeholder="Describe your reason…" rows={2}
                                        className="w-full text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2.5 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400" />
                                )}
                                <div className="flex gap-2">
                                    <button onClick={() => { setConfirming(null); setReason(''); setCustomReason('') }} className="btn-ghost text-xs shrink-0">Back</button>
                                    <button onClick={() => returnMutation.mutate()} disabled={!finalReason || returnMutation.isPending}
                                        className="btn-ghost text-xs text-white bg-amber-500 hover:bg-amber-600 border-amber-500 shrink-0 disabled:opacity-50">
                                        {returnMutation.isPending ? 'Submitting…' : 'Submit Return'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button onClick={() => setConfirming('return')}
                                className="btn-ghost text-sm text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-900/20 flex items-center gap-2 shrink-0">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                                Request Return
                            </button>
                        )
                    )}
                    {order.status === 'return_requested' && (
                        <span className="text-sm text-orange-600 dark:text-orange-400 font-medium bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                            Return Requested — Pending Review
                        </span>
                    )}
                    {order.status === 'returned' && (
                        <span className="text-sm text-teal-600 dark:text-teal-400 font-medium bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 11l3 3L22 4" /></svg>
                            Return Approved — Refund in 5-7 business days
                        </span>
                    )}
                </div>

                {/* Status tracker */}
                {!isTerminal ? (
                    <div className="card">
                        <h2 className="font-semibold text-surface-900 dark:text-white mb-5">Order Status</h2>
                        <div className="relative flex items-start">
                            {/* Background line */}
                            <div className="absolute top-4 left-4 right-4 h-0.5 bg-surface-200 dark:bg-surface-700 z-0" />
                            <motion.div
                                className="absolute top-4 left-4 h-0.5 bg-gradient-to-r from-primary-500 to-primary-600 z-0"
                                initial={{ width: '0%' }}
                                animate={{ width: statusIndex > 0 ? `${(statusIndex / (STATUS_STEPS.length - 1)) * (100 - 8 / STATUS_STEPS.length)}%` : '0%' }}
                                transition={{ duration: 0.8, ease: 'easeOut' }}
                            />
                            {STATUS_STEPS.map((step, i) => {
                                const done = i < statusIndex
                                const active = i === statusIndex
                                return (
                                    <div key={step} className="flex-1 flex flex-col items-center relative z-10">
                                        <motion.div
                                            initial={{ scale: 0.5 }}
                                            animate={{ scale: 1 }}
                                            transition={{ duration: 0.3, delay: i * 0.1 }}
                                            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all
                                        ${done ? 'bg-primary-600 border-primary-600 text-white'
                                                    : active ? 'bg-white dark:bg-surface-900 border-primary-600 text-primary-600 shadow-glow'
                                                        : 'bg-white dark:bg-surface-800 border-surface-300 dark:border-surface-600 text-surface-400'}`}>
                                            {done ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg> : i + 1}
                                        </motion.div>
                                        <span className={`text-xs mt-2 capitalize font-medium ${done || active ? 'text-primary-600 dark:text-primary-400' : 'text-surface-400'}`}>
                                            {step}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>

                        <div className="mt-4 space-y-1.5">
                            {order.tracking_number && (
                                <p className="text-sm text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-3 py-2 rounded-xl flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                                    Tracking: <span className="font-mono font-semibold">{order.tracking_number}</span>
                                </p>
                            )}
                            {order.estimated_delivery && (
                                <p className="text-sm text-primary-700 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 px-3 py-2 rounded-xl flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" /></svg>
                                    Estimated delivery: <strong>{fmt(order.estimated_delivery)}</strong>
                                </p>
                            )}
                        </div>
                    </div>
                ) : isCancelled ? (
                    <div className="card border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
                        <p className="text-red-700 dark:text-red-400 font-semibold flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            This order was cancelled.
                        </p>
                    </div>
                ) : (
                    <div className="card border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/20">
                        <p className="text-teal-700 dark:text-teal-400 font-semibold flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 11l3 3L22 4" /></svg>
                            Return approved — your refund will be processed within 5-7 business days.
                        </p>
                    </div>
                )}

                {/* Items */}
                <div className="card">
                    <h2 className="font-semibold text-surface-900 dark:text-white mb-4">Items Ordered</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-surface-50 dark:bg-surface-800 border-y border-surface-200 dark:border-surface-700">
                                    <th className="text-left px-4 py-2.5 text-surface-600 dark:text-surface-400 font-semibold">Product</th>
                                    <th className="text-center px-4 py-2.5 text-surface-600 dark:text-surface-400 font-semibold w-16">Qty</th>
                                    <th className="text-right px-4 py-2.5 text-surface-600 dark:text-surface-400 font-semibold w-28">Unit Price</th>
                                    <th className="text-right px-4 py-2.5 text-surface-600 dark:text-surface-400 font-semibold w-28">Subtotal</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-surface-100 dark:divide-surface-800">
                                {order.items.map((item: any) => (
                                    <tr key={item.order_item_id} className="hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors">
                                        <td className="px-4 py-3 text-surface-800 dark:text-surface-200 font-medium">
                                            {item.product_name || <span className="font-mono text-xs text-surface-400">{item.product_id.slice(0, 8)}</span>}
                                        </td>
                                        <td className="px-4 py-3 text-center text-surface-600 dark:text-surface-400">{item.quantity}</td>
                                        <td className="px-4 py-3 text-right text-surface-600 dark:text-surface-400">₹{Number(item.unit_price).toLocaleString('en-IN')}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-surface-900 dark:text-white">₹{(item.quantity * Number(item.unit_price)).toLocaleString('en-IN')}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                {Number(order.deal_discount) > 0 && (
                                    <tr className="border-t border-surface-200 dark:border-surface-700">
                                        <td colSpan={3} className="px-4 py-2 text-right text-emerald-700 dark:text-emerald-400 text-sm font-medium">Deal Discount</td>
                                        <td className="px-4 py-2 text-right text-emerald-700 dark:text-emerald-400 font-semibold">–₹{Number(order.deal_discount).toLocaleString('en-IN')}</td>
                                    </tr>
                                )}
                                <tr className="border-t-2 border-surface-300 dark:border-surface-600 bg-surface-50 dark:bg-surface-800">
                                    <td colSpan={3} className="px-4 py-3 text-right font-bold text-surface-900 dark:text-white">Grand Total</td>
                                    <td className="px-4 py-3 text-right font-bold text-primary-600 dark:text-primary-400 text-base">₹{Number(order.total_price).toLocaleString('en-IN')}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                {/* Payment & Shipping */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="card">
                        <h2 className="font-semibold text-surface-900 dark:text-white mb-3">Payment</h2>
                        <p className="text-sm text-surface-700 dark:text-surface-300 capitalize font-medium">{order.payment_method || '—'}</p>
                        <span className={`mt-1.5 inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-semibold ${order.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : order.payment_status === 'failed' ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                            {order.payment_status}
                        </span>
                        {order.payment_method !== 'cod' && order.payment_status !== 'paid' && order.razorpay_order_id && paymentConfig?.razorpay_key_id && (
                            <button
                                onClick={handleRetryPayment}
                                className="mt-3 btn-primary text-xs py-1.5 px-3 w-full"
                            >
                                {order.payment_status === 'failed' ? 'Retry Payment' : 'Complete Payment'}
                            </button>
                        )}
                    </div>

                    {order.shipping_address && (
                        <div className="card">
                            <h2 className="font-semibold text-surface-900 dark:text-white mb-3">Shipping Address</h2>
                            <div className="text-sm text-surface-600 dark:text-surface-400 space-y-1">
                                <p className="font-semibold text-surface-900 dark:text-white">{order.shipping_address.full_name}</p>
                                <p className="text-surface-500">{order.shipping_address.phone}</p>
                                <p>{order.shipping_address.address_line1}</p>
                                {order.shipping_address.address_line2 && <p>{order.shipping_address.address_line2}</p>}
                                <p>{order.shipping_address.city}, {order.shipping_address.state} – {order.shipping_address.pincode}</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Delivery Map */}
                {order.shipping_address && <DeliveryMap address={order.shipping_address} />}
            </div>
        </AnimatedPage>
    )
}

function DeliveryMap({ address }: { address: { address_line1: string; city: string; state: string; pincode: string; latitude?: number; longitude?: number } }) {
    const [position, setPosition] = useState<[number, number] | null>(
        address.latitude && address.longitude ? [address.latitude, address.longitude] : null
    )

    const geocode = useCallback(async () => {
        if (position) return
        const addressStr = `${address.address_line1}, ${address.city}, ${address.state} ${address.pincode}, India`
        try {
            const res = await fetch(
                `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addressStr)}&format=json&limit=1&accept-language=en`,
                { headers: { 'User-Agent': 'ECommerceApp/1.0' } }
            )
            const data = await res.json()
            if (data.length > 0) {
                setPosition([parseFloat(data[0].lat), parseFloat(data[0].lon)])
            }
        } catch { /* ignore geocoding errors */ }
    }, [address, position])

    // Geocode on mount
    useState(() => { geocode() })

    if (!position) return null

    return (
        <div className="card">
            <h2 className="font-semibold text-surface-900 dark:text-white mb-3 flex items-center gap-2">
                <svg className="w-5 h-5 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                Delivery Location
            </h2>
            <div style={{ height: '250px', borderRadius: '0.5rem', overflow: 'hidden' }}>
                <MapContainer center={position} zoom={14} style={{ width: '100%', height: '100%' }}>
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <Marker position={position} />
                </MapContainer>
            </div>
        </div>
    )
}
