import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { productService } from '../../services/products'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import { AnimatedPage } from '../../components/common/AnimatedPage'
import type { Event } from '../../types'

// ─── helpers ──────────────────────────────────────────────────────────────
function getEventStatus(event_date?: string): 'live' | 'soon' | 'upcoming' | 'nodateet' {
    if (!event_date) return 'nodateet'
    const diff = new Date(event_date).getTime() - Date.now()
    if (diff <= 0) return 'live'
    if (diff < 3 * 86400000) return 'soon'
    return 'upcoming'
}

function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })
}
function fmtTime(d: string) {
    return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

// ─── Countdown ────────────────────────────────────────────────────────────
function Countdown({ eventDate, large = false }: { eventDate: string; large?: boolean }) {
    const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })
    const [expired, setExpired] = useState(false)

    useEffect(() => {
        const calc = () => {
            const diff = new Date(eventDate).getTime() - Date.now()
            if (diff <= 0) { setExpired(true); return }
            setTimeLeft({
                days: Math.floor(diff / 86400000),
                hours: Math.floor((diff % 86400000) / 3600000),
                minutes: Math.floor((diff % 3600000) / 60000),
                seconds: Math.floor((diff % 60000) / 1000),
            })
        }
        calc()
        const id = setInterval(calc, 1000)
        return () => clearInterval(id)
    }, [eventDate])

    if (expired) return (
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-500 dark:text-red-400">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            Happening now!
        </span>
    )

    const units = [
        { v: timeLeft.days, l: 'Days' },
        { v: timeLeft.hours, l: 'Hrs' },
        { v: timeLeft.minutes, l: 'Min' },
        { v: timeLeft.seconds, l: 'Sec' },
    ]

    return (
        <div className="flex items-end gap-1.5">
            {units.map(({ v, l }, i) => (
                <div key={l} className="flex items-end gap-1.5">
                    <div className={`flex flex-col items-center ${large ? 'min-w-[54px]' : 'min-w-[40px]'}`}>
                        <span className={`font-black tabular-nums rounded-xl flex items-center justify-center w-full
                            ${large
                                ? 'text-3xl text-white bg-white/20 backdrop-blur-sm py-2'
                                : 'text-xl text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/40 py-1.5'
                            }`}>
                            {String(v).padStart(2, '0')}
                        </span>
                        <span className={`uppercase tracking-widest mt-1 font-semibold ${large ? 'text-[10px] text-indigo-200' : 'text-[9px] text-gray-400 dark:text-gray-500'}`}>{l}</span>
                    </div>
                    {i < 3 && <span className={`pb-5 font-bold ${large ? 'text-white/60 text-xl' : 'text-gray-300 dark:text-gray-600 text-lg'}`}>:</span>}
                </div>
            ))}
        </div>
    )
}

// ─── Date chip ────────────────────────────────────────────────────────────
function DateChip({ event_date }: { event_date: string }) {
    const d = new Date(event_date)
    return (
        <div className="flex flex-col items-center bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden w-12 shrink-0 shadow-sm">
            <span className="w-full text-center text-[9px] font-bold uppercase tracking-wider bg-indigo-600 text-white py-0.5">
                {d.toLocaleDateString('en-IN', { month: 'short' })}
            </span>
            <span className="text-xl font-black text-gray-900 dark:text-white leading-tight py-1">
                {d.getDate()}
            </span>
        </div>
    )
}

// ─── Status badge ─────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: ReturnType<typeof getEventStatus> }) {
    if (status === 'live') return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-500 text-white shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
            LIVE NOW
        </span>
    )
    if (status === 'soon') return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-400 text-amber-900">
            🔥 This Week
        </span>
    )
    return null
}

// ─── Add-to-Calendar helper ───────────────────────────────────────────────
function addToCalendarUrl(ev: Event) {
    if (!ev.event_date) return '#'
    const start = new Date(ev.event_date)
    const end = new Date(start.getTime() + 2 * 3600000) // +2h default
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
    const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: ev.title,
        dates: `${fmt(start)}/${fmt(end)}`,
        details: ev.description,
        location: ev.register_url,
    })
    return `https://calendar.google.com/calendar/render?${params.toString()}`
}

// ─── Featured (hero) card ─────────────────────────────────────────────────
function FeaturedCard({ ev, onOpen }: { ev: Event; onOpen: (e: Event) => void }) {
    const status = getEventStatus(ev.event_date)
    const now = Date.now()

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-3xl cursor-pointer group"
            onClick={() => onOpen(ev)}
        >
            {/* Background image */}
            <div className="relative h-72 sm:h-96">
                {ev.image_url ? (
                    <img src={ev.image_url} alt={ev.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                ) : (
                    <div className="w-full h-full bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
            </div>

            {/* Content overlay */}
            <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-8 text-white">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold uppercase tracking-widest text-indigo-300 bg-indigo-900/60 backdrop-blur-sm px-3 py-1 rounded-full">
                                ⭐ Featured Event
                            </span>
                            <StatusBadge status={status} />
                        </div>
                        <h2 className="text-2xl sm:text-3xl font-extrabold leading-tight tracking-tight drop-shadow">{ev.title}</h2>
                        {ev.event_date && (
                            <p className="text-sm text-white/80 flex items-center gap-1.5">
                                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                {fmtDate(ev.event_date)} · {fmtTime(ev.event_date)}
                            </p>
                        )}
                        {ev.event_date && new Date(ev.event_date).getTime() > now && (
                            <div className="mt-3">
                                <p className="text-[11px] uppercase tracking-widest text-white/60 mb-2 font-semibold">Starts in</p>
                                <Countdown eventDate={ev.event_date} large />
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col gap-2 shrink-0">
                        <a
                            href={ev.register_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="flex items-center gap-2 bg-white text-indigo-700 hover:bg-indigo-50 font-bold text-sm px-5 py-2.5 rounded-xl transition-colors shadow-lg whitespace-nowrap"
                        >
                            Register Now
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                        </a>
                        {ev.event_date && (
                            <a
                                href={addToCalendarUrl(ev)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="flex items-center justify-center gap-1.5 bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                Add to Calendar
                            </a>
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    )
}

// ─── Regular event card ───────────────────────────────────────────────────
function EventCard({ ev, index, onOpen }: { ev: Event; index: number; onOpen: (e: Event) => void }) {
    const status = getEventStatus(ev.event_date)
    const now = Date.now()

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="group bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden hover:shadow-xl hover:border-indigo-200 dark:hover:border-indigo-800 hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col"
            onClick={() => onOpen(ev)}
        >
            {/* Image */}
            <div className="relative h-44 overflow-hidden bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 shrink-0">
                {ev.image_url ? (
                    <img src={ev.image_url} alt={ev.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <svg className="w-16 h-16 text-indigo-200 dark:text-indigo-900" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </div>
                )}
                <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent" />
                {/* Status badge top-left */}
                <div className="absolute top-3 left-3">
                    <StatusBadge status={status} />
                </div>
                {/* Date chip top-right */}
                {ev.event_date && (
                    <div className="absolute top-3 right-3">
                        <DateChip event_date={ev.event_date} />
                    </div>
                )}
            </div>

            {/* Body */}
            <div className="p-5 flex flex-col gap-2.5 flex-1">
                <h3 className="font-bold text-gray-900 dark:text-white leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-2">
                    {ev.title}
                </h3>

                {ev.event_date && (
                    <p className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {fmtDate(ev.event_date)} · {fmtTime(ev.event_date)}
                    </p>
                )}

                <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed flex-1">
                    {ev.description}
                </p>

                {ev.event_date && new Date(ev.event_date).getTime() > now && (
                    <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-3">
                        <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest mb-1.5">Starts in</p>
                        <Countdown eventDate={ev.event_date} />
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 mt-auto pt-1">
                    <a
                        href={ev.register_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors"
                    >
                        Register Now
                    </a>
                    {ev.event_date && (
                        <a
                            href={addToCalendarUrl(ev)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            title="Add to Google Calendar"
                            className="w-10 h-10 flex items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 text-gray-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:border-indigo-600 dark:hover:text-indigo-400 transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        </a>
                    )}
                </div>
            </div>
        </motion.div>
    )
}

// ─── Main page ────────────────────────────────────────────────────────────
export default function Events() {
    const [selected, setSelected] = useState<Event | null>(null)
    const [filter, setFilter] = useState<'all' | 'upcoming' | 'soon'>('all')

    const { data: events, isLoading } = useQuery({
        queryKey: ['events', 'active'],
        queryFn: () => productService.listEvents({ active_only: true }),
    })

    const now = Date.now()

    const sortedEvents = useMemo(() => {
        if (!events) return []
        return [...events].sort((a, b) => {
            if (!a.event_date) return 1
            if (!b.event_date) return -1
            return new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
        })
    }, [events])

    const filteredEvents = useMemo(() => sortedEvents.filter(ev => {
        if (filter === 'upcoming') return !ev.event_date || new Date(ev.event_date).getTime() > now
        if (filter === 'soon') {
            if (!ev.event_date) return false
            const diff = new Date(ev.event_date).getTime() - now
            return diff > 0 && diff < 7 * 86400000
        }
        return true
    }), [sortedEvents, filter, now])

    const featuredEvent = filteredEvents[0] ?? null
    const restEvents = filteredEvents.slice(1)

    // counts for filter pills
    const counts = useMemo(() => {
        const all = sortedEvents.length
        const upcoming = sortedEvents.filter(e => !e.event_date || new Date(e.event_date).getTime() > now).length
        const soon = sortedEvents.filter(e => {
            if (!e.event_date) return false
            const diff = new Date(e.event_date).getTime() - now
            return diff > 0 && diff < 7 * 86400000
        }).length
        return { all, upcoming, soon }
    }, [sortedEvents, now])

    return (
        <AnimatedPage>
            <div className="max-w-5xl mx-auto space-y-6 pb-10">

                {/* Header row */}
                <div className="flex items-end justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">Events</h1>
                        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
                            {sortedEvents.length > 0
                                ? `${sortedEvents.length} event${sortedEvents.length !== 1 ? 's' : ''} — register before seats fill up`
                                : 'Browse upcoming events and experiences'}
                        </p>
                    </div>

                    {/* Filter pills */}
                    {!isLoading && sortedEvents.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                            {([
                                { key: 'all', label: 'All' },
                                { key: 'upcoming', label: 'Upcoming' },
                                { key: 'soon', label: '🔥 This Week' },
                            ] as const).map(({ key, label }) => (
                                <button
                                    key={key}
                                    onClick={() => setFilter(key)}
                                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all ${filter === key
                                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                                            : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-400 dark:hover:border-indigo-600'
                                        }`}
                                >
                                    {label}
                                    <span className={`ml-1.5 text-[10px] ${filter === key ? 'text-indigo-200' : 'text-gray-400'}`}>
                                        {counts[key]}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Content */}
                {isLoading ? (
                    <div className="grid sm:grid-cols-2 gap-5">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse h-72" />
                        ))}
                    </div>
                ) : filteredEvents.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center py-24"
                    >
                        <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/20 rounded-3xl flex items-center justify-center mx-auto mb-5">
                            <svg className="w-10 h-10 text-indigo-300 dark:text-indigo-700" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        </div>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">No events found</h2>
                        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
                            {filter !== 'all' ? 'Try changing the filter.' : 'Check back soon for exciting events!'}
                        </p>
                        {filter !== 'all' && (
                            <button onClick={() => setFilter('all')} className="mt-4 btn-primary text-sm">View All Events</button>
                        )}
                    </motion.div>
                ) : (
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={filter}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="space-y-6"
                        >
                            {/* Featured event */}
                            {featuredEvent && (
                                <FeaturedCard ev={featuredEvent} onOpen={setSelected} />
                            )}

                            {/* Rest of events grid */}
                            {restEvents.length > 0 && (
                                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {restEvents.map((ev, i) => (
                                        <EventCard key={ev.event_id} ev={ev} index={i} onOpen={setSelected} />
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    </AnimatePresence>
                )}

                {/* Detail Modal */}
                <AnimatePresence>
                    {selected && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
                            onClick={() => setSelected(null)}
                        >
                            <motion.div
                                initial={{ y: 80, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: 80, opacity: 0 }}
                                transition={{ type: 'spring', damping: 26, stiffness: 280 }}
                                className="bg-white dark:bg-gray-900 w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden max-h-[92vh] flex flex-col shadow-2xl"
                                onClick={e => e.stopPropagation()}
                            >
                                {/* Banner */}
                                <div className="relative shrink-0">
                                    {selected.image_url ? (
                                        <div className="relative h-56 overflow-hidden">
                                            <img src={selected.image_url} alt={selected.title} className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                                            {selected.event_date && (
                                                <div className="absolute bottom-4 left-5 text-white">
                                                    <p className="text-lg font-extrabold leading-tight drop-shadow">{selected.title}</p>
                                                    <p className="text-sm text-white/80 mt-0.5 flex items-center gap-1.5">
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                                        {fmtDate(selected.event_date)} · {fmtTime(selected.event_date)}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="h-32 bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 flex items-end p-5">
                                            <p className="text-xl font-extrabold text-white">{selected.title}</p>
                                        </div>
                                    )}
                                    {/* Close button */}
                                    <button
                                        onClick={() => setSelected(null)}
                                        className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors backdrop-blur-sm"
                                        aria-label="Close"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                    {/* Status badge */}
                                    <div className="absolute top-3 left-3">
                                        <StatusBadge status={getEventStatus(selected.event_date)} />
                                    </div>
                                </div>

                                {/* Scrollable content */}
                                <div className="overflow-y-auto flex-1 p-5 space-y-4">
                                    {/* Title when no image */}
                                    {!selected.image_url && (
                                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">{selected.title}</h2>
                                    )}
                                    {!selected.image_url && selected.event_date && (
                                        <p className="text-sm text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-1.5">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                            {fmtDate(selected.event_date)} · {fmtTime(selected.event_date)}
                                        </p>
                                    )}

                                    {/* Countdown box */}
                                    {selected.event_date && new Date(selected.event_date).getTime() > now && (
                                        <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/40 rounded-2xl p-4">
                                            <p className="text-[11px] text-indigo-500 dark:text-indigo-400 font-bold uppercase tracking-widest mb-2">Event starts in</p>
                                            <Countdown eventDate={selected.event_date} />
                                        </div>
                                    )}

                                    {/* Description */}
                                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-line">
                                        {selected.description}
                                    </p>

                                    {/* CTA row */}
                                    <div className="flex gap-2 pt-1">
                                        <a
                                            href={selected.register_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-3 rounded-xl transition-colors text-sm"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                            Register Now
                                        </a>
                                        {selected.event_date && (
                                            <a
                                                href={addToCalendarUrl(selected)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title="Add to Google Calendar"
                                                className="flex items-center justify-center gap-1.5 border border-gray-200 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-600 text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 px-4 py-3 rounded-xl transition-colors text-xs font-semibold whitespace-nowrap"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                                + Calendar
                                            </a>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </AnimatedPage>
    )
}

