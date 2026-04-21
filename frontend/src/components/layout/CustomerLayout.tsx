import { Outlet, Link } from 'react-router-dom'
import { Header } from './Header'
import { ChatWidget } from '../common/ChatWidget'

export function CustomerLayout() {
    return (
        <div className="min-h-screen flex flex-col bg-surface-50 dark:bg-surface-950">
            <Header />
            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
                <Outlet />
            </main>
            <ChatWidget />
            <footer className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-surface-900 mt-16">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                        <div className="md:col-span-2">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center">
                                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                                </div>
                                <span className="text-lg font-bold text-gray-900 dark:text-white">ShopHere</span>
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm leading-relaxed">
                                Premium shopping experience with curated products, AI-powered recommendations, and seamless checkout.
                            </p>
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4">Quick Links</h3>
                            <ul className="space-y-2.5 text-sm text-gray-500 dark:text-gray-400">
                                <li><a href="/products" className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">Products</a></li>
                                <li><a href="/events" className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">Events</a></li>
                                <li><a href="/orders" className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">My Orders</a></li>
                            </ul>
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4">Support</h3>
                            <ul className="space-y-2.5 text-sm text-gray-500 dark:text-gray-400">
                                <li><Link to="/support" className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">Support</Link></li>
                                <li><Link to="/help" className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">Help Center</Link></li>
                                <li><Link to="/shipping" className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">Shipping Info</Link></li>
                                <li><Link to="/returns" className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">Returns</Link></li>
                            </ul>
                        </div>
                    </div>
                    <div className="border-t border-gray-200 dark:border-gray-800 mt-10 pt-6 text-center text-xs text-gray-400 dark:text-gray-500">
                        © 2026 ShopHere. All rights reserved.
                    </div>
                </div>
            </footer>
        </div>
    )
}
