import { Link } from 'react-router-dom'
import { AnimatedPage } from '../../components/common/AnimatedPage'

export default function Support() {
    return (
        <AnimatedPage>
            <div className="max-w-2xl mx-auto space-y-8 py-6">
                <div>
                    <h1 className="text-3xl font-bold text-surface-900 dark:text-white">Contact Support</h1>
                    <p className="text-surface-500 dark:text-surface-400 mt-2">We're here to help. Reach out any way that's convenient for you.</p>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                    <div className="card space-y-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-2xl">💬</div>
                        <h2 className="font-semibold text-surface-900 dark:text-white">Live Chat</h2>
                        <p className="text-sm text-surface-500 dark:text-surface-400">Chat with our AI assistant right now or request a human agent.</p>
                        <p className="text-xs text-surface-400 dark:text-surface-500">Available 24/7 via the chat bubble at the bottom of your screen.</p>
                    </div>

                    <div className="card space-y-3">
                        <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-2xl">📧</div>
                        <h2 className="font-semibold text-surface-900 dark:text-white">Email Us</h2>
                        <p className="text-sm text-surface-500 dark:text-surface-400">Send us an email and we'll get back to you within 2 hours.</p>
                        <a href="mailto:support@shophere.in" className="text-sm text-primary-600 dark:text-primary-400 hover:underline font-medium">support@shophere.in</a>
                    </div>

                    <div className="card space-y-3">
                        <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-2xl">📞</div>
                        <h2 className="font-semibold text-surface-900 dark:text-white">Call Us</h2>
                        <p className="text-sm text-surface-500 dark:text-surface-400">Toll-free helpline available Monday to Saturday.</p>
                        <p className="text-sm font-semibold text-surface-800 dark:text-surface-200">1800-XXX-XXXX</p>
                        <p className="text-xs text-surface-400 dark:text-surface-500">9 AM – 9 PM IST</p>
                    </div>

                    <div className="card space-y-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-2xl">🕐</div>
                        <h2 className="font-semibold text-surface-900 dark:text-white">Support Hours</h2>
                        <div className="text-sm text-surface-500 dark:text-surface-400 space-y-1">
                            <p>Monday – Saturday</p>
                            <p className="font-semibold text-surface-700 dark:text-surface-300">9:00 AM – 9:00 PM IST</p>
                            <p className="text-xs">Average response time: under 2 hours</p>
                        </div>
                    </div>
                </div>

                <div className="flex gap-3 flex-wrap">
                    <Link to="/help" className="btn-secondary text-sm">Help Center</Link>
                    <Link to="/returns" className="btn-secondary text-sm">Returns & Refunds</Link>
                    <Link to="/shipping" className="btn-secondary text-sm">Shipping Info</Link>
                </div>
            </div>
        </AnimatedPage>
    )
}
