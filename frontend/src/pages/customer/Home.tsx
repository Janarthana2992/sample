import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { productService } from '../../services/products'
import { aiClient } from '../../services/api'
import { ProductCard } from '../../components/common/ProductCard'
import { AnimatedPage, FadeInView } from '../../components/common/AnimatedPage'
import { ProductGridSkeleton } from '../../components/common/Skeleton'
import { useAuthStore } from '../../store/authStore'
import { getViewedProducts } from './ProductDetail'

// ── Read recently tracked searches ───────────────────────────
function getRecentSearches(): string[] {
    try {
        const raw = localStorage.getItem('sp_recent_searches')
        return raw ? JSON.parse(raw) : []
    } catch { return [] }
}

type RecommendationCardItem = {
    product_id: string
    score: number
    name?: string
    mrp?: number
    selling_price?: number
    image_url?: string
    stock_status?: string
}

function mixRecommendations(primary: RecommendationCardItem[], secondary: RecommendationCardItem[], limit = 12) {
    const items: RecommendationCardItem[] = []
    const seen = new Set<string>()

    const push = (item?: RecommendationCardItem) => {
        if (!item || seen.has(item.product_id)) return
        seen.add(item.product_id)
        items.push(item)
    }

    const maxLen = Math.max(primary.length, secondary.length)
    for (let index = 0; index < maxLen && items.length < limit; index++) {
        push(primary[index])
        push(secondary[index])
    }

    return items
}

export default function Home() {
    const { user } = useAuthStore()
    const recentViews = getViewedProducts()
    const recentSearches = getRecentSearches()
    const marqueeRef = useRef<HTMLDivElement>(null)
    const [isPaused, setIsPaused] = useState(false)

    const { data: featuredData, isLoading: isFeaturedLoading } = useQuery({
        queryKey: ['products', 'featured-marquee'],
        queryFn: () => productService.listFeatured(1, 20),
    })

    const { data: promotedData } = useQuery({
        queryKey: ['products', 'promoted-marquee'],
        queryFn: () => productService.listPromoted(1, 30),
    })

    // Marquee: promoted products only; fall back to featured if no promoted
    const promotedProducts = promotedData?.items ?? []
    const featuredProducts = featuredData?.items ?? []
    const marqueeProducts = promotedProducts.length > 0 ? promotedProducts : featuredProducts

    const { data: categories = [] } = useQuery({
        queryKey: ['home-categories'],
        queryFn: () => productService.listCategories(),
        staleTime: 5 * 60_000,
    })
    const activeCategories = (categories as any[]).filter((c: any) => c.is_active)

    const { data: recommendations } = useQuery({
        queryKey: ['recommendations', ...recentViews.slice(0, 5), ...recentSearches.slice(0, 3)],
        queryFn: async () => {
            const recentSearchTerms = recentSearches.slice(0, 3)
            const searchBasedGroups = await Promise.all(
                recentSearchTerms.map(async term => {
                    try {
                        const response = await productService.search(term, 1, 4)
                        return (response.hits || []).map(hit => ({
                            product_id: hit.product_id,
                            score: hit.score,
                            name: hit.name,
                            mrp: hit.mrp,
                            selling_price: hit.selling_price,
                            image_url: hit.image_url,
                            stock_status: hit.stock_status,
                        }))
                    } catch {
                        return [] as RecommendationCardItem[]
                    }
                })
            )

            const searchBased: RecommendationCardItem[] = []
            const seenSearchIds = new Set<string>()
            const maxSearchDepth = Math.max(0, ...searchBasedGroups.map(group => group.length))
            for (let depth = 0; depth < maxSearchDepth; depth++) {
                for (const group of searchBasedGroups) {
                    const item = group[depth]
                    if (!item || seenSearchIds.has(item.product_id)) continue
                    seenSearchIds.add(item.product_id)
                    searchBased.push(item)
                }
            }

            let viewBased: RecommendationCardItem[] = []
            if (recentViews.length > 0) {
                try {
                    const response = await aiClient.get('/recommend/interest', {
                        params: { product_ids: recentViews.slice(0, 8).join(','), top_n: 8 },
                    })
                    viewBased = response.data.items || []
                } catch {
                    viewBased = []
                }
            }

            const blended = mixRecommendations(searchBased, viewBased, 12)
            if (blended.length > 0) return blended

            const r = await aiClient.get('/recommend/products', { params: { top_n: 8 } })
            return r.data.items
        },
        staleTime: 0,
        gcTime: 60_000,
    })

    const { data: orderBasedRecs } = useQuery({
        queryKey: ['order-recommendations', user?.user_id],
        queryFn: async () => {
            const r = await aiClient.get(`/recommend/user/${user!.user_id}`, { params: { top_n: 8 } })
            return (r.data.items || []) as RecommendationCardItem[]
        },
        enabled: !!user,
        staleTime: 5 * 60_000,
    })

    const { data: categoryPicks } = useQuery({
        queryKey: ['category-picks', user?.user_id],
        queryFn: async () => {
            const r = await aiClient.get(`/recommend/category-picks/${user!.user_id}`, { params: { top_n: 8 } })
            return r.data as { items: RecommendationCardItem[]; category_affinity?: string[] }
        },
        enabled: !!user,
        staleTime: 5 * 60_000,
    })

    const recLabel = (() => {
        if (recentViews.length > 0 && recentSearches.length > 0) return 'Based on Your Recent Searches & Views'
        if (recentViews.length > 0) return 'Based on Your Recent Views'
        if (recentSearches.length > 0) return 'Based on Your Recent Searches'
        return 'Recommended for You'
    })()

    const RecCarousel = ({ items, label }: { items: RecommendationCardItem[]; label: string }) => (
        <FadeInView>
            <section>
                <h2 className="section-title mb-1">{label}</h2>
                <p className="section-subtitle mb-5">Curated picks just for you</p>
                <div className="flex gap-4 overflow-x-auto pb-3 -mx-1 px-1 snap-x snap-mandatory">
                    {items.map((rec, i) => (
                        <motion.div
                            key={rec.product_id}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                        >
                            <Link
                                to={`/products/${rec.product_id}`}
                                className="shrink-0 w-44 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 hover:shadow-card-hover transition-all duration-300 overflow-hidden block snap-start group"
                            >
                                <div className="w-full aspect-square bg-gray-50 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
                                    {rec.image_url
                                        ? <img src={rec.image_url} alt={rec.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                        : <svg className="w-10 h-10 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                                    }
                                </div>
                                <div className="p-3">
                                    <p className="text-xs font-medium text-gray-800 dark:text-gray-200 line-clamp-2 leading-snug mb-1.5 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{rec.name || 'View Product'}</p>
                                    {rec.selling_price && (
                                        <div className="flex items-baseline gap-1.5">
                                            <span className="text-sm font-bold text-gray-900 dark:text-white">₹{Number(rec.selling_price).toLocaleString('en-IN')}</span>
                                            {rec.mrp && rec.mrp > rec.selling_price && (
                                                <span className="text-[11px] text-gray-400 line-through">₹{Number(rec.mrp).toLocaleString('en-IN')}</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </Link>
                        </motion.div>
                    ))}
                </div>
            </section>
        </FadeInView>
    )

    return (
        <AnimatedPage>
            <div className="space-y-14">
                {/* Hero */}
                <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 text-white">
                    <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDM0djZoLTZWMzRoLTR2LTRoNHYtNmg2djZoNHY0aC00eiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
                    <div className="relative px-8 py-16 sm:px-16 sm:py-24 text-center">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6 }}
                        >
                            <span className="inline-block text-primary-200 text-sm font-semibold tracking-wider uppercase mb-4">Premium Shopping Experience</span>
                            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold mb-6 tracking-tight leading-tight">
                                Discover Products<br className="hidden sm:block" /> You'll Love
                            </h1>
                            <p className="text-primary-100 text-lg sm:text-xl mb-8 max-w-2xl mx-auto leading-relaxed">
                                AI-powered recommendations, curated collections, and unbeatable prices — all in one place.
                            </p>
                            <div className="flex items-center justify-center gap-4">
                                <Link
                                    to="/products"
                                    className="inline-flex items-center gap-2 bg-white text-primary-700 font-bold px-8 py-3.5 rounded-2xl hover:bg-primary-50 transition-all duration-200 shadow-lg hover:shadow-xl active:scale-[0.98]"
                                >
                                    <span>Shop Now</span>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
                                </Link>
                                <Link
                                    to="/events"
                                    className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm text-white font-semibold px-6 py-3.5 rounded-2xl hover:bg-white/20 border border-white/20 transition-all duration-200"
                                >
                                    View Events
                                </Link>
                            </div>
                        </motion.div>
                    </div>
                </section>

                {/* Featured / Promoted Products – auto-scrolling marquee */}
                {marqueeProducts.length > 0 && (
                    <FadeInView>
                        <section>
                            <div className="flex items-end justify-between mb-4">
                                <div>
                                    <h2 className="section-title">Featured Products</h2>
                                    <p className="section-subtitle">Our handpicked top picks</p>
                                </div>
                                <Link to="/products" className="text-sm font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors flex items-center gap-1">
                                    View all
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
                                </Link>
                            </div>
                            <div
                                className="relative overflow-hidden"
                                onMouseEnter={() => setIsPaused(true)}
                                onMouseLeave={() => setIsPaused(false)}
                            >
                                {/* Fade edges */}
                                <div className="pointer-events-none absolute inset-y-0 left-0 w-12 z-10 bg-gradient-to-r from-white dark:from-gray-950 to-transparent" />
                                <div className="pointer-events-none absolute inset-y-0 right-0 w-12 z-10 bg-gradient-to-l from-white dark:from-gray-950 to-transparent" />

                                <div
                                    ref={marqueeRef}
                                    className="flex gap-4 w-max"
                                    style={{
                                        animation: `marquee-scroll ${marqueeProducts.length * 4}s linear infinite`,
                                        animationPlayState: isPaused ? 'paused' : 'running',
                                    }}
                                >
                                    {/* Duplicate items for seamless loop */}
                                    {[...marqueeProducts, ...marqueeProducts].map((p, i) => (
                                        <div key={`${p.product_id}-${i}`} className="shrink-0 w-52">
                                            <ProductCard product={p} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>
                    </FadeInView>
                )}
                {isFeaturedLoading && !featuredData && (
                    <ProductGridSkeleton count={4} />
                )}

                {/* Quick stats */}
                <FadeInView>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {[
                            { icon: '🚚', label: 'Free Delivery', desc: 'On all orders' },
                            { icon: '🔒', label: 'Secure Payment', desc: 'Razorpay powered' },
                            { icon: '🤖', label: 'AI Powered', desc: 'Smart search' },
                            { icon: '↩️', label: 'Easy Returns', desc: 'Hassle-free' },
                        ].map(stat => (
                            <div key={stat.label} className="card-hover text-center py-5">
                                <span className="text-2xl mb-2 block">{stat.icon}</span>
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">{stat.label}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">{stat.desc}</p>
                            </div>
                        ))}
                    </div>
                </FadeInView>

                {/* Browse by Category */}
                {activeCategories.length > 0 && (
                    <FadeInView>
                        <section>
                            <h2 className="section-title mb-1">Browse by Category</h2>
                            <p className="section-subtitle mb-5">Find exactly what you're looking for</p>
                            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
                                {activeCategories.map((cat: any) => (
                                    <Link
                                        key={cat.category_id}
                                        to={`/products?q=${encodeURIComponent(cat.name)}`}
                                        className="shrink-0 snap-start px-5 py-3 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-card-hover transition-all duration-200 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400"
                                    >
                                        {cat.name}
                                    </Link>
                                ))}
                            </div>
                        </section>
                    </FadeInView>
                )}

                {/* Order history-based recommendations */}
                {orderBasedRecs && orderBasedRecs.length > 0 && (
                    <RecCarousel items={orderBasedRecs} label="Based on Your Order History" />
                )}

                {/* Search & view-based recommendations */}
                {recommendations && recommendations.length > 0 && (
                    <RecCarousel items={recommendations} label={recLabel} />
                )}

                {/* Category-based picks */}
                {categoryPicks && categoryPicks.items.length > 0 && (
                    <RecCarousel
                        items={categoryPicks.items}
                        label={
                            categoryPicks.category_affinity?.length
                                ? `Popular in ${categoryPicks.category_affinity.slice(0, 2).join(' & ')}`
                                : 'Popular in Your Categories'
                        }
                    />
                )}

            </div>
        </AnimatedPage>
    )
}
