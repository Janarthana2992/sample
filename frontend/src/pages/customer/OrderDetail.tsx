import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { orderService } from '../../services/orders'
import { useAuthStore } from '../../store/authStore'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import { GoogleMap, useJsApiLoader, MarkerF } from '@react-google-maps/api'
import { useState, useCallback } from 'react'

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
            pending: '#d97706', confirmed: '#2563eb', dispatched: '#7c3aed', delivered: '#16a34a', cancelled: '#dc2626'
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
    if (!order) return <div className="text-center py-16 text-gray-500">Order not found</div>

    const statusIndex = STATUS_STEPS.indexOf(order.status)
    const isCancelled = order.status === 'cancelled'
    const fmt = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

    return (
        <div className="space-y-6 max-w-3xl">
            {/* Page header */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                    <Link to="/orders" className="text-gray-400 hover:text-gray-700 text-xl leading-none">←</Link>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">
                            Order <span className="font-mono text-blue-600">#{order.order_id.slice(0, 8).toUpperCase()}</span>
                        </h1>
                        <p className="text-sm text-gray-500 mt-0.5">Placed on {fmt(order.created_at)}</p>
                    </div>
                </div>
                <button onClick={handleDownloadPDF} className="btn-secondary text-sm flex items-center gap-2 shrink-0">
                    ⬇ Download Invoice
                </button>
            </div>

            {/* Status tracker */}
            {!isCancelled ? (
                <div className="card">
                    <h2 className="font-semibold text-gray-900 mb-5">Order Status</h2>
                    <div className="relative flex items-start">
                        {/* Background line */}
                        <div className="absolute top-4 left-4 right-4 h-0.5 bg-gray-200 z-0" />
                        <div
                            className="absolute top-4 left-4 h-0.5 bg-blue-600 z-0 transition-all"
                            style={{ width: statusIndex > 0 ? `${(statusIndex / (STATUS_STEPS.length - 1)) * (100 - 8 / STATUS_STEPS.length)}%` : '0%' }}
                        />
                        {STATUS_STEPS.map((step, i) => {
                            const done = i < statusIndex
                            const active = i === statusIndex
                            return (
                                <div key={step} className="flex-1 flex flex-col items-center relative z-10">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all
                                        ${done ? 'bg-blue-600 border-blue-600 text-white'
                                            : active ? 'bg-white border-blue-600 text-blue-600 shadow-md'
                                                : 'bg-white border-gray-300 text-gray-400'}`}>
                                        {done ? '✓' : i + 1}
                                    </div>
                                    <span className={`text-xs mt-2 capitalize font-medium ${done || active ? 'text-blue-600' : 'text-gray-400'}`}>
                                        {step}
                                    </span>
                                </div>
                            )
                        })}
                    </div>

                    <div className="mt-4 space-y-1.5">
                        {order.tracking_number && (
                            <p className="text-sm text-purple-700 bg-purple-50 px-3 py-1.5 rounded-lg">
                                📦 Tracking: <span className="font-mono font-semibold">{order.tracking_number}</span>
                            </p>
                        )}
                        {order.estimated_delivery && (
                            <p className="text-sm text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg">
                                🚚 Estimated delivery: <strong>{fmt(order.estimated_delivery)}</strong>
                            </p>
                        )}
                    </div>
                </div>
            ) : (
                <div className="card border border-red-200 bg-red-50">
                    <p className="text-red-700 font-semibold">❌ This order was cancelled.</p>
                </div>
            )}

            {/* Items */}
            <div className="card">
                <h2 className="font-semibold text-gray-900 mb-4">Items Ordered</h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 border-y border-gray-200">
                                <th className="text-left px-4 py-2.5 text-gray-600 font-semibold">Product</th>
                                <th className="text-center px-4 py-2.5 text-gray-600 font-semibold w-16">Qty</th>
                                <th className="text-right px-4 py-2.5 text-gray-600 font-semibold w-28">Unit Price</th>
                                <th className="text-right px-4 py-2.5 text-gray-600 font-semibold w-28">Subtotal</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {order.items.map((item: any) => (
                                <tr key={item.order_item_id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-gray-800 font-medium">
                                        {item.product_name || <span className="font-mono text-xs text-gray-400">{item.product_id.slice(0, 8)}</span>}
                                    </td>
                                    <td className="px-4 py-3 text-center text-gray-600">{item.quantity}</td>
                                    <td className="px-4 py-3 text-right text-gray-600">₹{Number(item.unit_price).toLocaleString('en-IN')}</td>
                                    <td className="px-4 py-3 text-right font-semibold text-gray-900">₹{(item.quantity * Number(item.unit_price)).toLocaleString('en-IN')}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            {Number(order.deal_discount) > 0 && (
                                <tr className="border-t border-gray-200">
                                    <td colSpan={3} className="px-4 py-2 text-right text-green-700 text-sm font-medium">Deal Discount</td>
                                    <td className="px-4 py-2 text-right text-green-700 font-semibold">–₹{Number(order.deal_discount).toLocaleString('en-IN')}</td>
                                </tr>
                            )}
                            <tr className="border-t-2 border-gray-300 bg-gray-50">
                                <td colSpan={3} className="px-4 py-3 text-right font-bold text-gray-900">Grand Total</td>
                                <td className="px-4 py-3 text-right font-bold text-blue-600 text-base">₹{Number(order.total_price).toLocaleString('en-IN')}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            {/* Payment & Shipping */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="card">
                    <h2 className="font-semibold text-gray-900 mb-3">Payment</h2>
                    <p className="text-sm text-gray-700 capitalize font-medium">{order.payment_method || '—'}</p>
                    <span className={`mt-1.5 inline-block text-xs px-2.5 py-0.5 rounded-full font-semibold ${order.payment_status === 'paid' ? 'bg-green-100 text-green-700' : order.payment_status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {order.payment_status}
                    </span>
                    {order.payment_method !== 'cod' && order.payment_status !== 'paid' && order.razorpay_order_id && paymentConfig?.razorpay_key_id && (
                        <button
                            onClick={handleRetryPayment}
                            className="mt-3 btn-primary text-xs py-1.5 px-3 w-full"
                        >
                            {order.payment_status === 'failed' ? '🔄 Retry Payment' : '💳 Complete Payment'}
                        </button>
                    )}
                </div>

                {order.shipping_address && (
                    <div className="card">
                        <h2 className="font-semibold text-gray-900 mb-3">Shipping Address</h2>
                        <div className="text-sm text-gray-700 space-y-1">
                            <p className="font-semibold text-gray-900">{order.shipping_address.full_name}</p>
                            <p className="text-gray-500">{order.shipping_address.phone}</p>
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
    )
}

function DeliveryMap({ address }: { address: { address_line1: string; city: string; state: string; pincode: string } }) {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
    const { isLoaded } = useJsApiLoader({ googleMapsApiKey: apiKey })
    const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null)

    const geocode = useCallback(() => {
        if (!isLoaded || !window.google) return
        const geocoder = new window.google.maps.Geocoder()
        const addressStr = `${address.address_line1}, ${address.city}, ${address.state} ${address.pincode}, India`
        geocoder.geocode({ address: addressStr }, (results: google.maps.GeocoderResult[] | null, status: google.maps.GeocoderStatus) => {
            if (status === 'OK' && results && results[0]) {
                setPosition({
                    lat: results[0].geometry.location.lat(),
                    lng: results[0].geometry.location.lng(),
                })
            }
        })
    }, [isLoaded, address])

    // Geocode on mount
    useState(() => { geocode() })

    if (!apiKey || !isLoaded || !position) return null

    return (
        <div className="card">
            <h2 className="font-semibold text-gray-900 mb-3">📍 Delivery Location</h2>
            <GoogleMap
                mapContainerStyle={{ width: '100%', height: '250px', borderRadius: '0.5rem' }}
                center={position}
                zoom={14}
            >
                <MarkerF position={position} />
            </GoogleMap>
        </div>
    )
}
