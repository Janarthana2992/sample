import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

const navItems = [
    { to: '/admin', label: '📊 Dashboard', end: true },
    { to: '/admin/products', label: '📦 Products' },
    { to: '/admin/categories', label: '🗂️ Categories' },
    { to: '/admin/deals', label: '🏷️ Deals' },
    { to: '/admin/events', label: '📅 Events' },
    { to: '/admin/orders', label: '📋 Orders' },
    { to: '/admin/reviews', label: '⭐ Reviews' },
    { to: '/admin/staff', label: '👥 Staff' },
]

export function AdminLayout() {
    const { user, logout } = useAuthStore()
    const navigate = useNavigate()
    const [open, setOpen] = useState(false)

    const sidebar = (
        <div className="flex flex-col h-full bg-gray-900 text-white w-64">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                <div>
                    <Link to="/" className="text-lg font-bold text-blue-400">🛒 ShopHere</Link>
                    <p className="text-xs text-gray-400 mt-0.5">Admin Portal</p>
                </div>
                <button onClick={() => setOpen(false)} className="lg:hidden text-gray-400 hover:text-white text-xl leading-none">✕</button>
            </div>
            <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
                {navItems.map(item => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        onClick={() => setOpen(false)}
                        className={({ isActive }) =>
                            `flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'}`
                        }
                    >
                        {item.label}
                    </NavLink>
                ))}
            </nav>
            <div className="p-4 border-t border-gray-700">
                <p className="text-sm font-medium truncate">{user?.full_name}</p>
                <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                <button
                    onClick={() => { logout(); navigate('/login') }}
                    className="mt-3 w-full text-left text-xs text-red-400 hover:text-red-300"
                >
                    Logout →
                </button>
            </div>
        </div>
    )

    return (
        <div className="flex h-screen bg-gray-100 overflow-hidden">
            {/* Desktop sidebar */}
            <aside className="hidden lg:flex flex-col shrink-0 w-64">
                {sidebar}
            </aside>

            {/* Mobile drawer overlay */}
            {open && (
                <div className="fixed inset-0 z-40 flex lg:hidden">
                    <div className="fixed inset-0 bg-black/50" onClick={() => setOpen(false)} />
                    <aside className="relative z-50 flex flex-col w-64 max-w-[80vw]">
                        {sidebar}
                    </aside>
                </div>
            )}

            {/* Content */}
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shrink-0">
                    <button
                        onClick={() => setOpen(true)}
                        className="lg:hidden text-gray-500 hover:text-gray-800 text-xl leading-none"
                        aria-label="Open menu"
                    >
                        ☰
                    </button>
                    <h1 className="text-sm text-gray-500">E-Commerce Admin</h1>
                </header>
                <main className="flex-1 overflow-y-auto p-4 sm:p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    )
}

