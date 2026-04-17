import { Link } from 'react-router-dom'
import { AnimatedPage } from '../../components/common/AnimatedPage'

const RETURN_WINDOWS = [
    { category: 'General Products', window: '7 days', icon: '📦', note: 'Item must be unused and in original packaging.' },
    { category: 'Electronics', window: '10 days', icon: '💻', note: 'Replacement only. Item must be defective or damaged on arrival.' },
    { category: 'Fashion & Apparel', window: '15 days', icon: '👕', note: 'Unused with all original tags attached.' },
    { category: 'Books & Stationery', window: '7 days', icon: '📚', note: 'Only if wrong item was delivered.' },
]

export default function Returns() {
    return (
        <AnimatedPage>
            <div className="max-w-2xl mx-auto space-y-8 py-6">
                <div>
                    <h1 className="text-3xl font-bold text-surface-900 dark:text-white">Returns & Refunds</h1>
                    <p className="text-surface-500 dark:text-surface-400 mt-2">Easy, hassle-free returns on most products.</p>
                </div>

                {/* Return windows */}
                <div>
                    <h2 className="font-semibold text-surface-800 dark:text-surface-200 mb-3">Return Windows by Category</h2>
                    <div className="grid sm:grid-cols-2 gap-3">
                        {RETURN_WINDOWS.map(rw => (
                            <div key={rw.category} className="card space-y-1.5">
                                <div className="flex items-center gap-2">
                                    <span className="text-xl">{rw.icon}</span>
                                    <span className="font-medium text-surface-900 dark:text-white text-sm">{rw.category}</span>
                                </div>
                                <p className="text-2xl font-bold text-primary-600 dark:text-primary-400">{rw.window}</p>
                                <p className="text-xs text-surface-500 dark:text-surface-400">{rw.note}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* How to return */}
                <div className="card space-y-4">
                    <h2 className="font-semibold text-surface-900 dark:text-white">How to Return an Item</h2>
                    <ol className="space-y-3">
                        {[
                            { step: 1, title: 'Go to My Orders', desc: 'Find the delivered order you want to return.' },
                            { step: 2, title: 'Click "Request Return"', desc: 'Available on the order detail page for delivered orders within the return window.' },
                            { step: 3, title: 'Schedule Pickup', desc: 'Our logistics partner will arrange a pickup within 2 business days.' },
                            { step: 4, title: 'Receive Refund', desc: 'Refund is processed within 5–7 business days after successful pickup.' },
                        ].map(s => (
                            <li key={s.step} className="flex items-start gap-4">
                                <span className="w-7 h-7 rounded-full bg-primary-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{s.step}</span>
                                <div>
                                    <p className="font-medium text-surface-900 dark:text-white text-sm">{s.title}</p>
                                    <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">{s.desc}</p>
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>

                {/* Cancellations */}
                <div className="card space-y-3">
                    <h2 className="font-semibold text-surface-900 dark:text-white">Order Cancellation</h2>
                    <ul className="text-sm text-surface-600 dark:text-surface-400 space-y-1.5">
                        <li>• Orders can be cancelled <strong className="text-surface-800 dark:text-surface-200">before they are dispatched</strong>.</li>
                        <li>• Once dispatched, wait for delivery and then request a return.</li>
                        <li>• Refunds for cancellations are processed within <strong className="text-surface-800 dark:text-surface-200">3–5 business days</strong>.</li>
                    </ul>
                    <Link to="/orders" className="btn-primary inline-block text-sm mt-2">View My Orders</Link>
                </div>

                <div className="flex gap-3 flex-wrap">
                    <Link to="/support" className="btn-secondary text-sm">Contact Support</Link>
                    <Link to="/shipping" className="btn-secondary text-sm">Shipping Info</Link>
                </div>
            </div>
        </AnimatedPage>
    )
}
