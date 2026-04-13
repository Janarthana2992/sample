import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
        }
    }

    const portalLink = () => {
        if (!user) return null
        if (user.role === 'admin') return <Link to="/admin" className="text-sm text-blue-600 hover:underline whitespace-nowrap">Admin Portal</Link>
        if (user.role === 'staff') return <Link to="/staff" className="text-sm text-blue-600 hover:underline whitespace-nowrap">Staff Portal</Link>
        return null
    }

    const visibleSuggestions = query.trim().length >= 2 ? suggestions : recentSearches.slice(0, 3)
    const showingRecentSearches = query.trim().length < 2

    const searchBar = (extraClass = '') => (
        <form onSubmit={handleSearch} className={`relative ${extraClass}`}>
            <div className="flex">
                <button
                    type="button"
                    onClick={() => setAiSearchEnabled(v => !v)}
                    className={`px-2 shrink-0 rounded-l-lg border border-r-0 text-sm transition-colors ${aiSearchEnabled
                        ? 'bg-purple-100 border-purple-300 text-purple-700 dark:bg-purple-900/30 dark:border-purple-600 dark:text-purple-300'
                        : 'bg-gray-50 border-gray-300 text-gray-400 hover:text-gray-600 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-500'
                        }`}
                    title={aiSearchEnabled ? 'AI search ON — click to disable' : 'Enable AI-powered search'}
                >
                    ✨
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
                    className="input rounded-none flex-1 min-w-0"
                    autoFocus={showMobileSearch}
                />
                <button type="submit" className="btn-primary rounded-l-none px-4 shrink-0">🔍</button>
            </div>
            {showSuggestions && visibleSuggestions.length > 0 && (
                <ul className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 dark:bg-gray-800 dark:border-gray-700">
                    {showingRecentSearches && (
                        <li className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400 border-b border-gray-100 dark:border-gray-700 dark:text-gray-500">
                            Recent Searches
                        </li>
                    )}
                    {visibleSuggestions.map(s => (
                        <li key={s}>
                            <button
                                type="button"
                                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-200"
                                onMouseDown={() => {
                                    setQuery(s)
                                    const updated = trackRecentSearch(s)
                                    setRecentSearches(updated.slice(0, 3))
                                    navigate(`/products?q=${encodeURIComponent(s)}`)
                                    setShowSuggestions(false)
                                    setShowMobileSearch(false)
                                }}
                            >
                                {showingRecentSearches ? `🕘 ${s}` : s}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </form>
    )

    return (
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50 dark:bg-gray-900 dark:border-gray-700">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Main toolbar */}
                <div className="flex items-center gap-3 h-16">
                    {/* Logo */}
                    <Link to="/" className="text-lg sm:text-xl font-bold text-blue-600 whitespace-nowrap shrink-0">🛒 ShopHere</Link>
                    <Link to="/events" className="text-sm font-medium text-gray-600 hover:text-blue-600 whitespace-nowrap hidden md:block shrink-0">📅 Events</Link>

                    {/* Desktop search */}
                    <div className="hidden sm:flex flex-1 min-w-0">
                        {searchBar('flex-1')}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 ml-auto shrink-0">
                        {/* Mobile search toggle */}
                        <button
                            className="sm:hidden text-gray-500 hover:text-gray-800 text-xl p-1 dark:text-gray-400 dark:hover:text-gray-200"
                            onClick={() => setShowMobileSearch(v => !v)}
                            aria-label="Search"
                        >
                            🔍
                        </button>

                        {/* Dark mode toggle */}
                        <button
                            onClick={toggleDark}
                            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
                            aria-label="Toggle dark mode"
                            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
                        >
                            {dark ? '☀️' : '🌙'}
                        </button>

                        {portalLink()}

                        {isAuthenticated ? (
                            <>
                                <Link to="/cart" className="relative p-1">
                                    <span className="text-2xl">🛒</span>
                                    {itemCount > 0 && (
                                        <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center leading-none">
                                            {itemCount > 9 ? '9+' : itemCount}
                                        </span>
                                    )}
                                </Link>
                                <div className="relative">
                                    <button
                                        onClick={() => setShowUserMenu(v => !v)}
                                        className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center font-semibold text-blue-700"
                                    >
                                        {user?.full_name[0]?.toUpperCase()}
                                    </button>
                                    {showUserMenu && (
                                        <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 dark:bg-gray-800 dark:border-gray-700">
                                            <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700">
                                                <p className="text-sm font-medium text-gray-900 truncate dark:text-gray-100">{user?.full_name}</p>
                                                <p className="text-xs text-gray-500 truncate dark:text-gray-400">{user?.email}</p>
                                            </div>
                                            <Link to="/events" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 md:hidden dark:text-gray-300 dark:hover:bg-gray-700">📅 Events</Link>
                                            <Link to="/orders" onClick={() => setShowUserMenu(false)} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700">My Orders</Link>
                                            <button
                                                onClick={() => { logout(); navigate('/login') }}
                                                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                            >
                                                Logout
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="flex gap-2">
                                <Link to="/login" className="btn-secondary text-sm py-1.5">Login</Link>
                                <Link to="/register" className="btn-primary text-sm py-1.5 hidden xs:inline-flex">Sign Up</Link>
                            </div>
                        )}
                    </div>
                </div>

                {/* Mobile search bar (toggled) */}
                {showMobileSearch && (
                    <div className="sm:hidden pb-3">
                        {searchBar('w-full')}
                    </div>
                )}
            </div>
        </header>
    )
}
