import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { productService } from '../../services/products'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import type { Event } from '../../types'

export default function Events() {
    const [selected, setSelected] = useState<Event | null>(null)
    const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null)

    const { data: events, isLoading } = useQuery({
        queryKey: ['events', 'active'],
        queryFn: () => productService.listEvents({ active_only: true }),
    })

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Upcoming Events</h1>
                <p className="text-gray-500 mt-1">Don't miss out — register today!</p>
            </div>

            {isLoading ? (
                <LoadingSpinner />
            ) : !events || events.length === 0 ? (
                <div className="text-center py-20 text-gray-400">
                    <p className="text-5xl mb-4">📅</p>
                    <p className="text-lg font-medium">No upcoming events</p>
                    <p className="text-sm mt-1">Check back soon!</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {events.map(ev => (
                        <button
                            key={ev.event_id}
                            onClick={() => setSelected(ev)}
                            className="w-full text-left card overflow-hidden p-0 hover:shadow-md transition-all active:scale-[.99]"
                        >
                            <div className="flex">
                                {/* Thumbnail */}
                                {ev.image_url ? (
                                    <div className="w-28 sm:w-40 shrink-0 h-auto overflow-hidden">
                                        <img src={ev.image_url} alt={ev.title} className="w-full h-full object-cover" />
                                    </div>
                                ) : (
                                    <div className="w-28 sm:w-40 shrink-0 bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-5xl">
                                        📅
                                    </div>
                                )}
                                {/* Preview */}
                                <div className="p-4 flex flex-col gap-1.5 min-w-0 flex-1">
                                    <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white leading-snug">{ev.title}</h2>
                                    {ev.event_date && (
                                        <span className="text-xs text-blue-700 dark:text-blue-400 font-semibold">
                                            📆 {new Date(ev.event_date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                                        </span>
                                    )}
                                    <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">{ev.description}</p>
                                    <span className="text-xs text-blue-600 dark:text-blue-400 font-medium mt-auto pt-1">Tap to view details →</span>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {/* ── Detail Modal ─────────────────────────────────────── */}
            {selected && (
                <div
                    className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
                    onClick={() => setSelected(null)}
                >
                    <div
                        className="bg-white dark:bg-gray-900 w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl overflow-hidden max-h-[92vh] flex flex-col"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Full banner image */}
                        {selected.image_url && (
                            <button
                                type="button"
                                className="w-full max-h-[50vh] shrink-0 overflow-hidden bg-black/5 dark:bg-black/20 cursor-zoom-in"
                                onClick={() => setZoomImageUrl(selected.image_url || null)}
                            >
                                <img src={selected.image_url} alt={selected.title} className="w-full max-h-[50vh] object-contain mx-auto" />
                            </button>
                        )}

                        {/* Scrollable content */}
                        <div className="overflow-y-auto flex-1 p-6 space-y-4">
                            <div className="flex items-start justify-between gap-3">
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white leading-snug">{selected.title}</h2>
                                <button
                                    onClick={() => setSelected(null)}
                                    className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-xl font-bold"
                                    aria-label="Close"
                                >
                                    ×
                                </button>
                            </div>

                            {selected.event_date && (
                                <span className="inline-block bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm font-semibold px-3 py-1 rounded-full">
                                    📆 {new Date(selected.event_date).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })}
                                </span>
                            )}

                            <p className="text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-line">{selected.description}</p>

                            {selected.image_url && (
                                <button
                                    type="button"
                                    onClick={() => setZoomImageUrl(selected.image_url || null)}
                                    className="text-sm text-blue-600 dark:text-blue-400 font-medium"
                                >
                                    View image full screen
                                </button>
                            )}

                            <a
                                href={selected.register_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
                            >
                                Register Now →
                            </a>
                        </div>
                    </div>
                </div>
            )}

            {zoomImageUrl && (
                <div
                    className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4"
                    onClick={() => setZoomImageUrl(null)}
                >
                    <button
                        type="button"
                        onClick={() => setZoomImageUrl(null)}
                        className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/15 text-white text-2xl leading-none hover:bg-white/25"
                        aria-label="Close full image"
                    >
                        ×
                    </button>
                    <img
                        src={zoomImageUrl}
                        alt={selected?.title || 'Event image'}
                        className="max-w-full max-h-full object-contain"
                        onClick={e => e.stopPropagation()}
                    />
                </div>
            )}
        </div>
    )
}
