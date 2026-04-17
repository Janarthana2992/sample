import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../../store/authStore'
import { useCartStore } from '../../store/cartStore'
import { productService } from '../../services/products'

// ── Search tracking ──────────────────────────────────────────
const SEARCH_KEY = 'sp_recent_searches'

function readRecentSearches(limit = 8) {
    try {
        const raw = localStorage.getItem(SEARCH_KEY)
        const searches: string[] = raw ? JSON.parse(raw) : []
        return searches.slice(0, limit)
    } catch {
        return []
    }
}

function trackRecentSearch(query: string) {
    try {
        const searches = readRecentSearches()
        const updated = [query, ...searches.filter(s => s.toLowerCase() !== query.toLowerCase())].slice(0, 8)
        localStorage.setItem(SEARCH_KEY, JSON.stringify(updated))
        return updated
    } catch { /* ignore */ }
    return []
}

// ── Dark mode hook ───────────────────────────────────────────
function useDarkMode() {
    const [dark, setDark] = useState(() => {
        const stored = localStorage.getItem('theme')
        if (stored) return stored === 'dark'
        return window.matchMedia('(prefers-color-scheme: dark)').matches
    })

    useEffect(() => {
        const root = document.documentElement
        if (dark) { root.classList.add('dark'); localStorage.setItem('theme', 'dark') }
        else { root.classList.remove('dark'); localStorage.setItem('theme', 'light') }
    }, [dark])

    return [dark, () => setDark(d => !d)] as const
}

export function Header() {
    const { user, isAuthenticated, logout } = useAuthStore()
    const { itemCount } = useCartStore()
    const [query, setQuery] = useState('')
    const [suggestions, setSuggestions] = useState<string[]>([])
    const [recentSearches, setRecentSearches] = useState<string[]>(() => readRecentSearches(3))
    const [showSuggestions, setShowSuggestions] = useState(false)
    const [isSearchFocused, setIsSearchFocused] = useState(false)
    const [showUserMenu, setShowUserMenu] = useState(false)
    const [showMobileSearch, setShowMobileSearch] = useState(false)
    const [aiSearchEnabled, setAiSearchEnabled] = useState(false)
    const [dark, toggleDark] = useDarkMode()
    const debounceRef = useRef<ReturnType<typeof setTimeout>>()
    const navigate = useNavigate()

    useEffect(() => {
        if (query.length < 2) {
            setSuggestions([])
            if (isSearchFocused) {
                const recent = readRecentSearches(3)
                setRecentSearches(recent)
                setShowSuggestions(recent.length > 0)
            }
            return
        }
        clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(async () => {
            try {
                const data = await productService.autocomplete(query)
                setSuggestions(data.suggestions)
                setShowSuggestions(true)
            } catch { /* ignored */ }
        }, 300)
        return () => clearTimeout(debounceRef.current)
    }, [query, isSearchFocused])

    // Close user menu when clicking outside
    useEffect(() => {
        if (!showUserMenu) return
        const handler = () => setShowUserMenu(false)
        document.addEventListener('click', handler)
        return () => document.removeEventListener('click', handler)
    }, [showUserMenu])

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        if (query.trim()) {
            const updated = trackRecentSearch(query.trim())
            setRecentSearches(updated.slice(0, 3))
            const searchParams = new URLSearchParams({ q: query.trim() })
            if (aiSearchEnabled) searchParams.set('ai', '1')
            navigate(`/products?${searchParams.toString()}`)
            setShowSuggestions(false)
            setShowMobileSearch(false)
        } else {
            // Clear search — navigate to products without q
            navigate('/products')
            setShowSuggestions(false)
            setShowMobileSearch(false)
        }
    }

    const portalLink = () => {
        if (!user) return null
        if (user.role === 'admin') return <Link to="/admin" className="text-xs font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400 px-3 py-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/20 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors whitespace-nowrap">Admin</Link>
        if (user.role === 'staff') return <Link to="/staff" className="text-xs font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400 px-3 py-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/20 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors whitespace-nowrap">Staff</Link>
        return null
    }

    const visibleSuggestions = query.trim().length >= 2 ? suggestions : recentSearches.slice(0, 3)
    const showingRecentSearches = query.trim().length < 2

    const searchBar = (extraClass = '') => (
        <form onSubmit={handleSearch} className={`relative ${extraClass}`}>
            <div className="flex items-center bg-gray-100 dark:bg-gray-800/80 rounded-xl overflow-hidden ring-1 ring-transparent focus-within:ring-2 focus-within:ring-primary-500/30 focus-within:bg-white dark:focus-within:bg-gray-800 transition-all duration-200">
                <button
                    type="button"
                    onClick={() => setAiSearchEnabled(v => !v)}
                    className={`px-3 py-2.5 shrink-0 text-sm transition-all duration-200 ${aiSearchEnabled
                        ? 'text-purple-600 dark:text-purple-400 bg-purple-100/60 dark:bg-purple-900/30'
                        : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                        }`}
                    title={aiSearchEnabled ? 'AI search ON — click to disable' : 'Enable AI-powered search'}
                >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L9.19 8.63L2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61z"/></svg>
                </button>
                <input
                    type="search"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onBlur={() => setTimeout(() => { setShowSuggestions(false); setIsSearchFocused(false) }, 150)}
                    onFocus={() => {
                        setIsSearchFocused(true)
                        if (query.trim().length < 2) {
                            const recent = readRecentSearches(3)
                            setRecentSearches(recent)
                            setShowSuggestions(recent.length > 0)
                            return
                        }
                        if (suggestions.length > 0) setShowSuggestions(true)
                    }}
                    placeholder={aiSearchEnabled ? 'Ask anything... e.g. "gifts under ₹500"' : 'Search products...'}
                    className="flex-1 min-w-0 bg-transparent px-1 py-2.5 text-sm outline-none text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                    autoFocus={showMobileSearch}
                />
                <button type="submit" className="px-4 py-2.5 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx={11} cy={11} r={8}/><path d="m21 21-4.35-4.35"/></svg>
                </button>
            </div>
            <AnimatePresence>
                {showSuggestions && visibleSuggestions.length > 0 && (
                    <motion.ul
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-glass overflow-hidden z-50"
                    >
                        {showingRecentSearches && (
                            <li className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                Recent
                            </li>
                        )}
                        {visibleSuggestions.map(s => (
                            <li key={s}>
                                <button
                                    type="button"
                                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 flex items-center gap-2.5 transition-colors"
                                    onMouseDown={() => {
                                        setQuery(s)
                                        const updated = trackRecentSearch(s)
                                        setRecentSearches(updated.slice(0, 3))
                                        navigate(`/products?q=${encodeURIComponent(s)}`)
                                        setShowSuggestions(false)
                                        setShowMobileSearch(false)
                                    }}
                                >
                                    {showingRecentSearches ? (
                                        <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                                    ) : (
                                        <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx={11} cy={11} r={8}/><path d="m21 21-4.35-4.35"/></svg>
                                    )}
                                    <span>{s}</span>
                                </button>
                            </li>
                        ))}
                    </motion.ul>
                )}
            </AnimatePresence>
        </form>
    )

    return (
        <header className="bg-white/80 backdrop-blur-xl border-b border-gray-200/60 sticky top-0 z-50 dark:bg-surface-950/80 dark:border-gray-800/60">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Main toolbar */}
                <div className="flex items-center gap-4 h-16">
                    {/* Logo */}
                    <Link to="/" className="flex items-center gap-2 shrink-0 group">
                        <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center shadow-sm group-hover:shadow-glow transition-shadow duration-300">
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
                        </div>
                        <span className="text-lg font-bold text-gray-900 dark:text-white hidden sm:block">ShopHere</span>
                    </Link>

                    <Link to="/events" className="text-sm font-medium text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 whitespace-nowrap hidden lg:block shrink-0 transition-colors">
                        Events
                    </Link>

                    {/* Desktop search */}
                    <div className="hidden sm:flex flex-1 max-w-xl min-w-0">
                        {searchBar('flex-1')}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 ml-auto shrink-0">
                        {/* Mobile search toggle */}
                        <button
                            className="sm:hidden p-2 rounded-xl text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
                            onClick={() => setShowMobileSearch(v => !v)}
                            aria-label="Search"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx={11} cy={11} r={8}/><path d="m21 21-4.35-4.35"/></svg>
                        </button>

                        {/* Dark mode toggle */}
                        <button
                            onClick={toggleDark}
                            className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-all duration-200"
                            aria-label="Toggle dark mode"
                            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
                        >
                            {dark ? (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx={12} cy={12} r={5}/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                            ) : (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
                            )}
                        </button>

                        {portalLink()}

                        {isAuthenticated ? (
                            <>
                                {/* Wishlist icon */}
                                <Link to="/wishlist" className="relative p-2 rounded-xl text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors" title="Wishlist">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
                                </Link>
                                <Link to="/cart" className="relative p-2 rounded-xl text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
                                    {itemCount > 0 && (
                                        <motion.span
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            className="absolute -top-0 -right-0 bg-primary-600 text-white text-[10px] font-bold rounded-full h-4 min-w-[16px] flex items-center justify-center leading-none px-1"
                                        >
                                            {itemCount > 9 ? '9+' : itemCount}
                                        </motion.span>
                                    )}
                                </Link>
                                <div className="relative" onClick={e => e.stopPropagation()}>
                                    <button
                                        onClick={() => setShowUserMenu(v => !v)}
                                        className="w-9 h-9 bg-gradient-to-br from-primary-400 to-primary-600 rounded-xl flex items-center justify-center font-semibold text-white text-sm shadow-sm hover:shadow-md transition-all duration-200"
                                    >
                                        {user?.full_name[0]?.toUpperCase()}
                                    </button>
                                    <AnimatePresence>
                                        {showUserMenu && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                                                transition={{ duration: 0.15 }}
                                                className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-glass-lg overflow-hidden z-50"
                                            >
                                                <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50">
                                                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{user?.full_name}</p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{user?.email}</p>
                                                </div>
                                                <div className="p-1.5">
                                                    <Link to="/events" className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl transition-colors md:hidden" onClick={() => setShowUserMenu(false)}>
                                                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x={3} y={4} width={18} height={18} rx={2}/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                                                        Events
                                                    </Link>
                                                    <Link to="/orders" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl transition-colors">
                                                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
                                                        My Orders
                                                    </Link>
                                                    <Link to="/wishlist" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl transition-colors">
                                                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
                                                        Wishlist
                                                    </Link>
                                                    <Link to="/addresses" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl transition-colors">
                                                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                                                        Saved Addresses
                                                    </Link>
                                                    <button
                                                        onClick={() => { logout(); navigate('/login') }}
                                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-xl transition-colors"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
                                                        Sign Out
                                                    </button>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </>
                        ) : (
                            <div className="flex gap-2">
                                <Link to="/login" className="btn-ghost text-sm py-2 px-4">Sign In</Link>
                                <Link to="/register" className="btn-primary text-sm py-2 px-4 hidden sm:inline-flex">Get Started</Link>
                            </div>
                        )}
                    </div>
                </div>

                {/* Mobile search bar (toggled) */}
                <AnimatePresence>
                    {showMobileSearch && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="sm:hidden overflow-hidden"
                        >
                            <div className="pb-3">
                                {searchBar('w-full')}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </header>
    )
}
