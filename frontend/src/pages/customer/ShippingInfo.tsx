import { Link } from 'react-router-dom'
import { AnimatedPage } from '../../components/common/AnimatedPage'

export default function ShippingInfo() {
    return (
        <AnimatedPage>
            <div className="max-w-2xl mx-auto space-y-8 py-6">
                <div>
                    <h1 className="text-3xl font-bold text-surface-900 dark:text-white">Shipping Information</h1>
                    <p className="text-surface-500 dark:text-surface-400 mt-2">Everything you need to know about delivery at ShopHere.</p>
                </div>

                <div className="space-y-4">
                    <div className="card space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-xl">🚚</div>
                            <h2 className="font-semibold text-surface-900 dark:text-white">Standard Shipping</h2>
                        </div>
                        <ul className="text-sm text-surface-600 dark:text-surface-400 space-y-1.5 ml-12">
                            <li>• Delivery in <strong className="text-surface-800 dark:text-surface-200">3–7 business days</strong> across India</li>
                            <li>• Free on orders above <strong className="text-surface-800 dark:text-surface-200">₹499</strong></li>
                            <li>• Nominal shipping fee applies on orders below ₹499</li>
                        </ul>
                    </div>

                    <div className="card space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-xl">⚡</div>
                            <h2 className="font-semibold text-surface-900 dark:text-white">Express Shipping</h2>
                        </div>
                        <ul className="text-sm text-surface-600 dark:text-surface-400 space-y-1.5 ml-12">
                            <li>• Delivery in <strong className="text-surface-800 dark:text-surface-200">1–3 business days</strong></li>
                            <li>• Available for ₹99 extra on eligible items</li>
                            <li>• Select at checkout if available for your pincode</li>
                        </ul>
                    </div>

                    <div className="card space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-xl">📍</div>
                            <h2 className="font-semibold text-surface-900 dark:text-white">Delivery Coverage</h2>
                        </div>
                        <ul className="text-sm text-surface-600 dark:text-surface-400 space-y-1.5 ml-12">
                            <li>• We ship to <strong className="text-surface-800 dark:text-surface-200">all Indian pincodes</strong></li>
                            <li>• Live order tracking available for every order</li>
                            <li>• You'll receive a tracking number once your order is dispatched</li>
                        </ul>
                    </div>

                    <div className="card space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-xl">📦</div>
                            <h2 className="font-semibold text-surface-900 dark:text-white">Packaging</h2>
                        </div>
                        <ul className="text-sm text-surface-600 dark:text-surface-400 space-y-1.5 ml-12">
                            <li>• All items are securely packed to prevent damage</li>
                            <li>• Electronics are bubble-wrapped and double-boxed</li>
                            <li>• Fragile items are marked and handled with extra care</li>
                        </ul>
                    </div>
                </div>

                <div className="flex gap-3 flex-wrap">
                    <Link to="/returns" className="btn-secondary text-sm">Returns Policy</Link>
                    <Link to="/support" className="btn-secondary text-sm">Contact Support</Link>
                </div>
            </div>
        </AnimatedPage>
    )
}
