import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { cartService } from '../../services/cart'
import { useCartStore } from '../../store/cartStore'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import { aiClient } from '../../services/api'

export default function Cart() {
    const { setCart } = useCartStore()
    const qc = useQueryClient()

    const { data: cart, isLoading } = useQuery({
        queryKey: ['cart'],
        queryFn: cartService.getCart,
    })

    const removeMutation = useMutation({
        mutationFn: (productId: string) => cartService.removeItem(productId),
        onSuccess: async () => {
            const updated = await cartService.getCart()
            setCart(updated)
            await qc.invalidateQueries({ queryKey: ['cart'] })
            toast.success('Item removed')
        },
    })

    const updateMutation = useMutation({
        mutationFn: ({ productId, qty }: { productId: string; qty: number }) =>
            cartService.updateItem(productId, qty),
        onSuccess: async () => {
            const updated = await cartService.getCart()
            setCart(updated)
            await qc.invalidateQueries({ queryKey: ['cart'] })
        },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update'),
    })

    if (isLoading) return <LoadingSpinner />

    const cartProductIds = cart?.items.map(i => i.product_id) ?? []

    return <CartContent cart={cart} cartProductIds={cartProductIds} removeMutation={removeMutation} updateMutation={updateMutation} />
}

function CartContent({ cart, cartProductIds, removeMutation, updateMutation }: {
    cart: import('../../types').Cart | undefined
    cartProductIds: string[]
    removeMutation: any
    updateMutation: any
}) {
    const { data: cartRecs } = useQuery({
        queryKey: ['cart-recs', ...cartProductIds],
        queryFn: async () => {
            if (cartProductIds.length === 0) return []
            const r = await aiClient.get('/recommend/interest', {
                params: { product_ids: cartProductIds.join(','), top_n: 6 },
            })
            return (r.data.items || []).filter((i: any) => !cartProductIds.includes(i.product_id))
        },
        enabled: cartProductIds.length > 0,
        staleTime: 60_000,
    })

    if (!cart || cart.items.length === 0) {
        return (
            <div className="text-center py-16">
                <p className="text-6xl mb-4">🛒</p>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Your cart is empty</h2>
                <p className="text-gray-500 mb-6">Add some products to get started</p>
                <Link to="/products" className="btn-primary">Shop Now</Link>
            </div>
        )
    }

    return (
        <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
                <h1 className="text-2xl font-bold text-gray-900">Shopping Cart ({cart.item_count} items)</h1>

                {cart.items.map(item => (
                    <div key={item.product_id} className="card flex items-center gap-4">
                        <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center text-3xl shrink-0">
                            {item.image_url ? <img src={item.image_url} alt={item.product_name} className="w-full h-full object-cover rounded-lg" /> : '📦'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-gray-900 truncate">{item.product_name}</h3>
                            <p className="text-sm font-bold text-gray-800 mt-1">₹{item.current_price.toLocaleString('en-IN')}</p>
                            {item.price_stale && (
                                <p className="text-xs text-orange-600">⚠ Price changed since added to cart</p>
                            )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <div className="flex items-center border border-gray-300 rounded-lg">
                                <button
                                    onClick={() => updateMutation.mutate({ productId: item.product_id, qty: item.quantity - 1 })}
                                    disabled={item.quantity <= 1 || updateMutation.isPending}
                                    className="px-2 py-1 text-gray-600 hover:bg-gray-100 rounded-l-lg disabled:opacity-40 text-sm"
                                >−</button>
                                <span className="px-3 py-1 text-sm font-semibold">{item.quantity}</span>
                                <button
                                    onClick={() => updateMutation.mutate({ productId: item.product_id, qty: item.quantity + 1 })}
                                    disabled={updateMutation.isPending}
                                    className="px-2 py-1 text-gray-600 hover:bg-gray-100 rounded-r-lg text-sm"
                                >+</button>
                            </div>
                            <button
                                onClick={() => removeMutation.mutate(item.product_id)}
                                disabled={removeMutation.isPending}
                                className="text-red-500 hover:text-red-700 text-sm px-2"
                            >✕</button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Summary */}
            <div>
                <div className="card sticky top-24 space-y-4">
                    <h2 className="text-lg font-bold text-gray-900">Order Summary</h2>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between text-gray-600">
                            <span>Subtotal ({cart.item_count} items)</span>
                            <span>₹{cart.subtotal.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-between text-gray-600">
                            <span>Shipping</span>
                            <span className="text-green-600">Free</span>
                        </div>
                        <div className="border-t border-gray-200 pt-2 flex justify-between font-bold text-gray-900">
                            <span>Total</span>
                            <span>₹{cart.subtotal.toLocaleString('en-IN')}</span>
                        </div>
                    </div>
                    <Link to="/checkout" className="btn-primary w-full text-center block">
                        Proceed to Checkout
                    </Link>
                    <Link to="/products" className="btn-secondary w-full text-center block text-sm">
                        Continue Shopping
                    </Link>
                </div>
            </div>

            {/* You might also like */}
            {cartRecs && cartRecs.length > 0 && (
                <div className="lg:col-span-3">
                    <h2 className="text-lg font-bold text-gray-900 mb-4">You Might Also Like</h2>
                    <div className="flex gap-4 overflow-x-auto pb-2">
                        {cartRecs.map((rec: any) => (
                            <Link
                                key={rec.product_id}
                                to={`/products/${rec.product_id}`}
                                className="shrink-0 w-40 bg-white rounded-xl border border-gray-200 hover:shadow-md transition-shadow overflow-hidden"
                            >
                                <div className="w-full aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                                    {rec.image_url
                                        ? <img src={rec.image_url} alt={rec.name} className="w-full h-full object-cover" />
                                        : <span className="text-3xl">📦</span>
                                    }
                                </div>
                                <div className="p-2">
                                    <p className="text-xs font-semibold text-gray-800 line-clamp-2 leading-snug mb-1">{rec.name || 'View Product'}</p>
                                    {rec.selling_price && (
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-sm font-bold text-gray-900">₹{Number(rec.selling_price).toLocaleString('en-IN')}</span>
                                            {rec.mrp && rec.mrp > rec.selling_price && (
                                                <span className="text-xs text-gray-400 line-through">₹{Number(rec.mrp).toLocaleString('en-IN')}</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
