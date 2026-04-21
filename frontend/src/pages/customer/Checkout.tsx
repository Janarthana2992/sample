import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { orderService } from '../../services/orders'
import { cartService } from '../../services/cart'
import { useCartStore } from '../../store/cartStore'
import { useAuthStore } from '../../store/authStore'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import { AddressForm } from '../../components/common/AddressForm'
import type { Address } from '../../types'

const STEPS = ['Cart Review', 'Shipping', 'Payment', 'Confirm']

export default function Checkout() {
    const [step, setStep] = useState(0)
    const [selectedAddressId, setSelectedAddressId] = useState<string>('')
    const [paymentMethod, setPaymentMethod] = useState('upi')
    const [showNewAddress, setShowNewAddress] = useState(false)
    const { clearCart } = useCartStore()
    const { user } = useAuthStore()
    const navigate = useNavigate()

    const { data: cart, isLoading: cartLoading } = useQuery({ queryKey: ['cart'], queryFn: cartService.getCart })
    const { data: addresses, refetch: refetchAddresses } = useQuery({ queryKey: ['addresses'], queryFn: orderService.listAddresses })
    const { data: paymentConfig } = useQuery({ queryKey: ['payment-config'], queryFn: orderService.getPaymentConfig })

    const checkoutMutation = useMutation({
        mutationFn: () => orderService.checkout(selectedAddressId, paymentMethod),
        onSuccess: (order) => {
            clearCart()

            // For non-COD with Razorpay configured, open payment modal
            if (paymentMethod !== 'cod' && order.razorpay_order_id && paymentConfig?.razorpay_key_id && window.Razorpay) {
                const options = {
                    key: paymentConfig.razorpay_key_id,
                    amount: Math.round(Number(order.total_price) * 100),
                    currency: 'INR',
                    name: 'ShopHere',
                    description: `Order #${order.order_id.slice(0, 8).toUpperCase()}`,
                    order_id: order.razorpay_order_id,
                    prefill: {
                        name: user?.full_name || '',
                        email: user?.email || '',
                    },
                    handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
                        try {
                            await orderService.verifyPayment(order.order_id, {
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature,
                            })
                            toast.success('Payment successful!')
                        } catch {
                            toast.error('Payment verification failed. You can retry from order details.')
                        }
                        navigate(`/orders/${order.order_id}`)
                    },
                    modal: {
                        ondismiss: () => {
                            toast('Payment pending. You can complete it from order details.', { icon: '⏳' })
                            navigate(`/orders/${order.order_id}`)
                        },
                    },
                    theme: { color: '#2563eb' },
                }
                const rzp = new window.Razorpay(options)
                rzp.open()
            } else {
                toast.success('Order placed successfully!')
                navigate(`/orders/${order.order_id}`)
            }
        },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Checkout failed'),
    })

    if (cartLoading) return <LoadingSpinner />
    if (!cart || cart.items.length === 0) {
        navigate('/cart')
        return null
    }

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold text-gray-900">Checkout</h1>

            {/* Steps indicator */}
            <div className="flex items-center gap-2">
                {STEPS.map((s, i) => (
                    <div key={s} className="flex items-center gap-2 flex-1">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${i <= step ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                            }`}>{i + 1}</div>
                        <span className={`text-sm ${i <= step ? 'text-gray-900' : 'text-gray-400'}`}>{s}</span>
                        {i < STEPS.length - 1 && <div className={`flex-1 h-px ${i < step ? 'bg-blue-600' : 'bg-gray-200'}`} />}
                    </div>
                ))}
            </div>

            {/* Step 0: Cart Review */}
            {step === 0 && (
                <div className="card space-y-4">
                    <h2 className="text-lg font-semibold">Review Your Cart</h2>
                    {cart.items.map(item => (
                        <div key={item.product_id} className="flex items-center justify-between text-sm border-b pb-2">
                            <span className="text-gray-700">{item.product_name} × {item.quantity}</span>
                            <span className="font-semibold">₹{item.line_total.toLocaleString('en-IN')}</span>
                        </div>
                    ))}
                    <div className="flex justify-between font-bold text-base pt-2">
                        <span>Total</span>
                        <span>₹{cart.subtotal.toLocaleString('en-IN')}</span>
                    </div>
                    <button onClick={() => setStep(1)} className="btn-primary w-full">Continue to Shipping</button>
                </div>
            )}

            {/* Step 1: Shipping */}
            {step === 1 && (
                <div className="card space-y-4">
                    <h2 className="text-lg font-semibold">Shipping Address</h2>

                    {addresses && addresses.length > 0 && (
                        <div className="space-y-2">
                            {addresses.map((addr: Address) => (
                                <label key={addr.address_id} className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer ${selectedAddressId === addr.address_id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                                    }`}>
                                    <input
                                        type="radio"
                                        name="address"
                                        value={addr.address_id}
                                        checked={selectedAddressId === addr.address_id}
                                        onChange={() => setSelectedAddressId(addr.address_id)}
                                        className="mt-1"
                                    />
                                    <div className="text-sm">
                                        <p className="font-medium">{addr.full_name} · {addr.phone}</p>
                                        <p className="text-gray-600">{addr.address_line1}</p>
                                        <p className="text-gray-600">{addr.city}, {addr.state} — {addr.pincode}</p>
                                    </div>
                                </label>
                            ))}
                        </div>
                    )}

                    <button
                        type="button"
                        className="btn-secondary w-full text-sm"
                        onClick={() => setShowNewAddress(v => !v)}
                    >
                        {showNewAddress ? '✕ Cancel' : '+ Add New Address'}
                    </button>

                    {showNewAddress && (
                        <div className="border-t pt-4">
                            <AddressForm
                                onSaved={addr => {
                                    setSelectedAddressId(addr.address_id)
                                    setShowNewAddress(false)
                                    refetchAddresses()
                                }}
                                onCancel={() => setShowNewAddress(false)}
                            />
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button onClick={() => setStep(0)} className="btn-secondary flex-1">← Back</button>
                        <button
                            onClick={() => setStep(2)}
                            disabled={!selectedAddressId}
                            className="btn-primary flex-1 disabled:opacity-50"
                        >
                            Continue to Payment
                        </button>
                    </div>
                </div>
            )}

            {/* Step 2: Payment */}
            {step === 2 && (
                <div className="card space-y-4">
                    <h2 className="text-lg font-semibold">Payment Method</h2>
                    <div className="space-y-2">
                        {[
                            { value: 'upi', label: '📱 UPI' },
                            { value: 'card', label: '💳 Card' },
                            { value: 'net_banking', label: '🏦 Net Banking' },
                            { value: 'cod', label: '💵 Cash on Delivery' },
                        ].map(pm => (
                            <label key={pm.value} className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer ${paymentMethod === pm.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                                }`}>
                                <input type="radio" name="payment" value={pm.value} checked={paymentMethod === pm.value} onChange={() => setPaymentMethod(pm.value)} />
                                <span className="font-medium text-sm">{pm.label}</span>
                            </label>
                        ))}
                    </div>
                    {paymentConfig?.payment_enabled ? (
                        <p className="text-xs text-gray-500 bg-green-50 border border-green-200 p-3 rounded-lg">
                            🔒 Payments are securely processed via Razorpay. For COD, no online payment is required.
                        </p>
                    ) : (
                        <p className="text-xs text-gray-500 bg-yellow-50 border border-yellow-200 p-3 rounded-lg">
                            💡 Payment gateway is in test mode. No real payments will be processed.
                        </p>
                    )}
                    <div className="flex gap-3">
                        <button onClick={() => setStep(1)} className="btn-secondary flex-1">← Back</button>
                        <button onClick={() => setStep(3)} className="btn-primary flex-1">Review Order</button>
                    </div>
                </div>
            )}

            {/* Step 3: Confirm */}
            {step === 3 && (
                <div className="card space-y-4">
                    <h2 className="text-lg font-semibold">Order Confirmation</h2>
                    <div className="bg-gray-50 p-4 rounded-lg space-y-2 text-sm">
                        <p><strong>Items:</strong> {cart.item_count}</p>
                        <p><strong>Total:</strong> ₹{cart.subtotal.toLocaleString('en-IN')}</p>
                        <p><strong>Payment:</strong> {paymentMethod.toUpperCase()}</p>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => setStep(2)} className="btn-secondary flex-1">← Back</button>
                        <button
                            onClick={() => checkoutMutation.mutate()}
                            disabled={checkoutMutation.isPending}
                            className="btn-primary flex-1"
                        >
                            {checkoutMutation.isPending ? 'Placing order...' : '✓ Place Order'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
