import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { orderService } from '../../services/orders'
import { cartService } from '../../services/cart'
import { productService } from '../../services/products'
import { useCartStore } from '../../store/cartStore'
import { useAuthStore } from '../../store/authStore'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import { AnimatedPage } from '../../components/common/AnimatedPage'
import { AddressAutocomplete } from '../../components/common/AddressAutocomplete'
import { MapLocationPicker } from '../../components/common/MapLocationPicker'
import type { Address, Deal } from '../../types'

const STEPS = ['Cart Review', 'Shipping', 'Payment', 'Confirm']

interface AddressForm {
    full_name: string
    phone: string
    address_line1: string
    address_line2?: string
    city: string
    state: string
    pincode: string
    latitude?: number
    longitude?: number
}

export default function Checkout() {
    const [step, setStep] = useState(0)
    const [selectedAddressId, setSelectedAddressId] = useState<string>('')
    const [paymentMethod, setPaymentMethod] = useState('upi')
    const [showNewAddress, setShowNewAddress] = useState(false)
    const [paymentCancelled, setPaymentCancelled] = useState(false)
    const { clearCart } = useCartStore()
    const { user } = useAuthStore()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const buyNowProductId = searchParams.get('buyNow')

    const { register, handleSubmit, formState: { errors }, setValue } = useForm<AddressForm>()

    const { data: fullCart, isLoading: cartLoading } = useQuery({ queryKey: ['cart'], queryFn: cartService.getCart })
    const { data: addresses, refetch: refetchAddresses } = useQuery({ queryKey: ['addresses'], queryFn: orderService.listAddresses })
    const { data: paymentConfig } = useQuery({ queryKey: ['payment-config'], queryFn: orderService.getPaymentConfig })
    const { data: activeDeals } = useQuery<Deal[]>({
        queryKey: ['deals', 'active'],
        queryFn: () => productService.listDeals({ active_only: true }),
        staleTime: 60_000,
    })

    // If buyNow mode, filter cart to just that product
    const cart = fullCart && buyNowProductId
        ? {
            ...fullCart,
            items: fullCart.items.filter(i => i.product_id === buyNowProductId),
            subtotal: fullCart.items.filter(i => i.product_id === buyNowProductId).reduce((sum, i) => sum + i.line_total, 0),
            item_count: fullCart.items.filter(i => i.product_id === buyNowProductId).reduce((sum, i) => sum + i.quantity, 0),
        }
        : fullCart

    // Compute best deal discount for display (mirrors server-side logic)
    const dealPreview = useMemo(() => {
        if (!cart || !activeDeals || activeDeals.length === 0) return null
        const subtotal = cart.subtotal
        const now = new Date()
        let bestDiscount = 0
        let bestDeal: Deal | null = null
        for (const deal of activeDeals) {
            if (new Date(deal.start_datetime) > now || new Date(deal.end_datetime) < now) continue
            if (deal.min_cart_value && subtotal < Number(deal.min_cart_value)) continue
            let discount = 0
            if (deal.deal_type === 'percentage' && deal.discount_value) {
                discount = subtotal * Number(deal.discount_value) / 100
            } else if (deal.deal_type === 'flat' && deal.discount_value) {
                discount = Math.min(Number(deal.discount_value), subtotal)
            } else if (deal.deal_type === 'bogo') {
                discount = subtotal * 0.5
            }
            if (discount > bestDiscount) { bestDiscount = discount; bestDeal = deal }
        }
        return bestDeal ? { discount: bestDiscount, deal: bestDeal } : null
    }, [cart, activeDeals])

    const addAddressMutation = useMutation({
        mutationFn: orderService.createAddress,
        onSuccess: (addr: Address) => {
            setSelectedAddressId(addr.address_id)
            setShowNewAddress(false)
            refetchAddresses()
            toast.success('Address saved')
        },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to save address'),
    })

    const checkoutMutation = useMutation({
        mutationFn: () => orderService.checkout(
            selectedAddressId,
            paymentMethod,
            buyNowProductId ? [buyNowProductId] : undefined,
        ),
        onSuccess: (order) => {
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
                            if (!buyNowProductId) clearCart()
                            toast.success('Payment successful!')
                            navigate(`/orders/${order.order_id}`)
                        } catch {
                            toast.error('Payment verification failed. Please try again.')
                            setPaymentCancelled(true)
                            setStep(2)
                            try { await orderService.cancelOrder(order.order_id, 'Payment verification failed') } catch { /* ignore */ }
                        }
                    },
                    modal: {
                        ondismiss: async () => {
                            setPaymentCancelled(true)
                            setStep(2)
                            try { await orderService.cancelOrder(order.order_id, 'Payment cancelled by user') } catch { /* ignore */ }
                        },
                    },
                    theme: { color: '#2563eb' },
                }
                const rzp = new window.Razorpay(options)
                rzp.open()
            } else {
                if (!buyNowProductId) clearCart()
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
        <AnimatedPage>
            <div className="max-w-3xl mx-auto space-y-6">
                <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Checkout</h1>

                {/* Steps indicator */}
                <div className="flex items-center gap-2">
                    {STEPS.map((s, i) => (
                        <div key={s} className="flex items-center gap-2 flex-1">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${i < step ? 'bg-primary-600 text-white' :
                                i === step ? 'bg-primary-600 text-white ring-4 ring-primary-100 dark:ring-primary-900/40' :
                                    'bg-surface-200 dark:bg-surface-700 text-surface-500'
                                }`}>
                                {i < step ? (
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                ) : i + 1}
                            </div>
                            <span className={`text-sm font-medium ${i <= step ? 'text-surface-900 dark:text-white' : 'text-surface-400'}`}>{s}</span>
                            {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 rounded transition-colors duration-300 ${i < step ? 'bg-primary-600' : 'bg-surface-200 dark:bg-surface-700'}`} />}
                        </div>
                    ))}
                </div>

                {/* Step 0: Cart Review */}
                {step === 0 && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card space-y-4">
                        <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Review Your Cart</h2>
                        <div className="divide-y divide-surface-100 dark:divide-surface-800">
                            {cart.items.map(item => (
                                <div key={item.product_id} className="flex items-center justify-between py-3 text-sm">
                                    <span className="text-surface-700 dark:text-surface-300">{item.product_name} × {item.quantity}</span>
                                    <span className="font-semibold text-surface-900 dark:text-white">₹{item.line_total.toLocaleString('en-IN')}</span>
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-between font-bold text-base pt-3 border-t border-surface-200 dark:border-surface-700">
                            <span className="text-surface-900 dark:text-white">Total</span>
                            <span className="text-primary-600 dark:text-primary-400">₹{cart.subtotal.toLocaleString('en-IN')}</span>
                        </div>
                        <button onClick={() => setStep(1)} className="btn-primary w-full">Continue to Shipping</button>
                    </motion.div>
                )}

                {/* Step 1: Shipping */}
                {step === 1 && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card space-y-4">
                        <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Shipping Address</h2>

                        {addresses && addresses.length > 0 && (
                            <div className="space-y-2">
                                {addresses.map((addr: Address) => (
                                    <label key={addr.address_id} className={`flex items-start gap-3 p-4 border rounded-2xl cursor-pointer transition-all ${selectedAddressId === addr.address_id
                                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 ring-2 ring-primary-500/20'
                                        : 'border-surface-200 dark:border-surface-700 hover:border-primary-300 dark:hover:border-primary-700'
                                        }`}>
                                        <input
                                            type="radio"
                                            name="address"
                                            value={addr.address_id}
                                            checked={selectedAddressId === addr.address_id}
                                            onChange={() => setSelectedAddressId(addr.address_id)}
                                            className="mt-1 text-primary-600 focus:ring-primary-500"
                                        />
                                        <div className="text-sm">
                                            <p className="font-semibold text-surface-900 dark:text-white">{addr.full_name} · {addr.phone}</p>
                                            <p className="text-surface-500 dark:text-surface-400">{addr.address_line1}</p>
                                            <p className="text-surface-500 dark:text-surface-400">{addr.city}, {addr.state} — {addr.pincode}</p>
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
                            <form onSubmit={handleSubmit(d => addAddressMutation.mutate(d))} className="space-y-3 border-t pt-4">
                                <div>
                                    <label className="label">📍 Select Delivery Location on Map</label>
                                    <MapLocationPicker
                                        onLocationSelect={(loc) => {
                                            setValue('address_line1', loc.address_line1)
                                            setValue('city', loc.city)
                                            setValue('state', loc.state)
                                            setValue('pincode', loc.pincode)
                                            setValue('latitude', loc.lat)
                                            setValue('longitude', loc.lng)
                                        }}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="label">Full Name</label>
                                        <input className="input" {...register('full_name', { required: true })} />
                                    </div>
                                    <div>
                                        <label className="label">Phone</label>
                                        <input className="input" {...register('phone', { required: true })} />
                                    </div>
                                </div>
                                <div>
                                    <label className="label">Address Line 1</label>
                                    <input className="input" {...register('address_line1', { required: true })} />
                                </div>
                                <div>
                                    <label className="label">Address Line 2 (optional)</label>
                                    <input className="input" {...register('address_line2')} />
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    <div>
                                        <label className="label">City</label>
                                        <input className="input" {...register('city', { required: true })} />
                                    </div>
                                    <div>
                                        <label className="label">State</label>
                                        <input className="input" {...register('state', { required: true })} />
                                    </div>
                                    <div>
                                        <label className="label">Pincode</label>
                                        <input className="input" {...register('pincode', { required: true, pattern: /^\d{6}$/ })} />
                                        {errors.pincode && <p className="text-red-500 text-xs mt-1">Enter a valid 6-digit pincode</p>}
                                    </div>
                                </div>
                                <input type="hidden" {...register('latitude')} />
                                <input type="hidden" {...register('longitude')} />
                                <button type="submit" disabled={addAddressMutation.isPending} className="btn-primary">
                                    {addAddressMutation.isPending ? 'Saving...' : 'Save Address'}
                                </button>
                            </form>
                        )}

                        <div className="flex gap-3 pt-2">
                            <button onClick={() => setStep(0)} className="btn-secondary flex-1">
                                <span className="flex items-center justify-center gap-1">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                    Back
                                </span>
                            </button>
                            <button
                                onClick={() => setStep(2)}
                                disabled={!selectedAddressId}
                                className="btn-primary flex-1 disabled:opacity-50"
                            >
                                Continue to Payment
                            </button>
                        </div>
                    </motion.div>
                )}

                {/* Step 2: Payment */}
                {step === 2 && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card space-y-4">
                        <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Payment Method</h2>
                        {paymentCancelled && (
                            <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl">
                                <svg className="w-5 h-5 text-red-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                                <div>
                                    <p className="text-sm font-semibold text-red-700 dark:text-red-400">Payment was not completed</p>
                                    <p className="text-xs text-red-600 dark:text-red-300 mt-0.5">Your previous order was cancelled. Please choose a payment method and place a new order.</p>
                                </div>
                                <button onClick={() => setPaymentCancelled(false)} className="ml-auto text-red-400 hover:text-red-600">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                        )}
                        <div className="space-y-2">
                            {[
                                { value: 'upi', label: 'UPI', icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z' },
                                { value: 'card', label: 'Card', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
                                { value: 'net_banking', label: 'Net Banking', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
                                { value: 'cod', label: 'Cash on Delivery', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
                            ].map(pm => (
                                <label key={pm.value} className={`flex items-center gap-3 p-4 border rounded-2xl cursor-pointer transition-all ${paymentMethod === pm.value
                                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 ring-2 ring-primary-500/20'
                                    : 'border-surface-200 dark:border-surface-700 hover:border-primary-300 dark:hover:border-primary-700'
                                    }`}>
                                    <input type="radio" name="payment" value={pm.value} checked={paymentMethod === pm.value} onChange={() => setPaymentMethod(pm.value)} className="text-primary-600 focus:ring-primary-500" />
                                    <svg className="w-5 h-5 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={pm.icon} /></svg>
                                    <span className="font-medium text-sm text-surface-900 dark:text-white">{pm.label}</span>
                                </label>
                            ))}
                        </div>
                        {paymentConfig?.payment_enabled ? (
                            <p className="text-xs text-surface-600 dark:text-surface-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-3 rounded-xl flex items-center gap-2">
                                <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                Payments are securely processed via Razorpay. For COD, no online payment is required.
                            </p>
                        ) : (
                            <p className="text-xs text-surface-600 dark:text-surface-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 rounded-xl flex items-center gap-2">
                                <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Payment gateway is in test mode. No real payments will be processed.
                            </p>
                        )}
                        <div className="flex gap-3">
                            <button onClick={() => setStep(1)} className="btn-secondary flex-1">
                                <span className="flex items-center justify-center gap-1">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                    Back
                                </span>
                            </button>
                            <button onClick={() => setStep(3)} className="btn-primary flex-1">Review Order</button>
                        </div>
                    </motion.div>
                )}

                {/* Step 3: Confirm */}
                {step === 3 && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card space-y-4">
                        <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Order Confirmation</h2>
                        <div className="bg-surface-50 dark:bg-surface-800 p-5 rounded-2xl space-y-3 text-sm">
                            <div className="flex justify-between">
                                <span className="text-surface-500 dark:text-surface-400">Items</span>
                                <span className="font-semibold text-surface-900 dark:text-white">{cart.item_count}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-surface-500 dark:text-surface-400">Total</span>
                                <span className="font-bold text-primary-600 dark:text-primary-400 text-base">₹{cart.subtotal.toLocaleString('en-IN')}</span>
                            </div>
                            {dealPreview && (
                                <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                                    <span>Deal: {dealPreview.deal.name}</span>
                                    <span className="font-semibold">–₹{dealPreview.discount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                                </div>
                            )}
                            {dealPreview && (
                                <div className="flex justify-between border-t border-surface-200 dark:border-surface-700 pt-2">
                                    <span className="font-semibold text-surface-900 dark:text-white">You Pay</span>
                                    <span className="font-bold text-primary-600 dark:text-primary-400 text-base">
                                        ₹{Math.max(cart.subtotal - dealPreview.discount, 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                    </span>
                                </div>
                            )}
                            <div className="flex justify-between">
                                <span className="text-surface-500 dark:text-surface-400">Payment</span>
                                <span className="font-semibold text-surface-900 dark:text-white uppercase">{paymentMethod}</span>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setStep(2)} className="btn-secondary flex-1">
                                <span className="flex items-center justify-center gap-1">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                    Back
                                </span>
                            </button>
                            <button
                                onClick={() => checkoutMutation.mutate()}
                                disabled={checkoutMutation.isPending}
                                className="btn-primary flex-1 flex items-center justify-center gap-2"
                            >
                                {checkoutMutation.isPending ? (
                                    <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Placing order...</>
                                ) : (
                                    <><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Place Order</>
                                )}
                            </button>
                        </div>
                    </motion.div>
                )}
            </div>
        </AnimatedPage>
    )
}
