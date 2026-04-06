import { Outlet } from 'react-router-dom'
import { Header } from './Header'

export function CustomerLayout() {
    return (
        <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
            <Header />
            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
                <Outlet />
            </main>
            <footer className="bg-gray-800 text-gray-300 py-8 mt-12 dark:bg-gray-900 dark:border-t dark:border-gray-800">
                <div className="max-w-7xl mx-auto px-4 text-center text-sm">
                    © 2026 ShopHere. All rights reserved.
                </div>
            </footer>
        </div>
    )
}
