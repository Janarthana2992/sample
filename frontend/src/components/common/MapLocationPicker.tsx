import { useState, useCallback, useRef, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import toast from 'react-hot-toast'

// Fix default marker icon for Leaflet + bundlers
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
})

const DEFAULT_CENTER: [number, number] = [20.5937, 78.9629] // India center

interface MapLocationPickerProps {
    onLocationSelect: (location: {
        lat: number
        lng: number
        address_line1: string
        city: string
        state: string
        pincode: string
    }) => void
    initialPosition?: { lat: number; lng: number } | null
    className?: string
}

// Reverse geocode using Nominatim (free, no API key)
async function reverseGeocodeNominatim(lat: number, lng: number) {
    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=en`,
            { headers: { 'User-Agent': 'ECommerceApp/1.0' } }
        )
        const data = await res.json()
        const addr = data.address || {}
        const address_line1 = [addr.road, addr.neighbourhood, addr.suburb].filter(Boolean).join(', ') || data.display_name?.split(',')[0] || ''
        const city = addr.city || addr.town || addr.village || addr.county || ''
        const state = addr.state || ''
        const pincode = addr.postcode || ''
        return { address_line1, city, state, pincode }
    } catch {
        return { address_line1: '', city: '', state: '', pincode: '' }
    }
}

// Search locations using Nominatim
async function searchNominatim(query: string) {
    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=in&accept-language=en`,
            { headers: { 'User-Agent': 'ECommerceApp/1.0' } }
        )
        return await res.json()
    } catch {
        return []
    }
}

// Child component that handles map click events
function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
    useMapEvents({
        click(e) {
            onMapClick(e.latlng.lat, e.latlng.lng)
        },
    })
    return null
}

// Child component to fly to a position
function FlyTo({ position, zoom }: { position: [number, number]; zoom: number }) {
    const map = useMap()
    useEffect(() => {
        map.flyTo(position, zoom, { duration: 1 })
    }, [map, position[0], position[1], zoom])
    return null
}

export function MapLocationPicker({ onLocationSelect, initialPosition, className }: MapLocationPickerProps) {
    const [marker, setMarker] = useState<[number, number] | null>(
        initialPosition ? [initialPosition.lat, initialPosition.lng] : null
    )
    const [flyTarget, setFlyTarget] = useState<{ pos: [number, number]; zoom: number } | null>(null)
    const [searchText, setSearchText] = useState('')
    const [suggestions, setSuggestions] = useState<any[]>([])
    const [locating, setLocating] = useState(false)
    const [locError, setLocError] = useState<string | null>(null)
    const [searching, setSearching] = useState(false)
    const [fetchedCoords, setFetchedCoords] = useState<{ lat: number; lng: number } | null>(null)
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const handlePlaceMarker = useCallback(async (lat: number, lng: number) => {
        setMarker([lat, lng])
        setFetchedCoords(null) // manual click — don't show coords badge
        const addr = await reverseGeocodeNominatim(lat, lng)
        onLocationSelect({ lat, lng, ...addr })
    }, [onLocationSelect])

    // Debounced search
    const handleSearchChange = useCallback((value: string) => {
        setSearchText(value)
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
        if (value.length < 3) { setSuggestions([]); return }
        searchTimeoutRef.current = setTimeout(async () => {
            setSearching(true)
            const results = await searchNominatim(value)
            setSuggestions(results)
            setSearching(false)
        }, 400)
    }, [])

    const handleSuggestionClick = useCallback(async (item: any) => {
        const lat = parseFloat(item.lat)
        const lng = parseFloat(item.lon)
        setMarker([lat, lng])
        setFlyTarget({ pos: [lat, lng], zoom: 16 })
        setSuggestions([])
        setSearchText(item.display_name?.split(',').slice(0, 2).join(',') || '')
        const addr = item.address || {}
        const address_line1 = [addr.road, addr.neighbourhood, addr.suburb].filter(Boolean).join(', ') || item.display_name?.split(',')[0] || ''
        const city = addr.city || addr.town || addr.village || addr.county || ''
        const state = addr.state || ''
        const pincode = addr.postcode || ''
        setFetchedCoords({ lat, lng })
        onLocationSelect({ lat, lng, address_line1, city, state, pincode })
    }, [onLocationSelect])

    const handleCurrentLocation = useCallback(() => {
        if (!navigator.geolocation) {
            toast.error('Your browser does not support location access')
            setLocError('Geolocation is not supported by your browser.')
            return
        }
        setLocating(true)
        setLocError(null)
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const lat = pos.coords.latitude
                const lng = pos.coords.longitude
                setMarker([lat, lng])
                setFlyTarget({ pos: [lat, lng], zoom: 16 })
                const addr = await reverseGeocodeNominatim(lat, lng)
                setFetchedCoords({ lat, lng })
                onLocationSelect({ lat, lng, ...addr })
                setLocating(false)
                setLocError(null)
            },
            (err) => {
                setLocating(false)
                let msg = 'Could not get your location.'
                if (err.code === 1) {
                    msg = 'Location permission denied. Please allow location access in your browser settings, then try again.'
                } else if (err.code === 2) {
                    msg = 'Location unavailable. Try searching for your address instead.'
                } else if (err.code === 3) {
                    msg = 'Location request timed out. Please try again or search manually.'
                }
                setLocError(msg)
                toast.error(msg, { duration: 5000 })
            },
            { enableHighAccuracy: true, timeout: 10000 }
        )
    }, [onLocationSelect])

    return (
        <div className={`space-y-3 ${className || ''}`}>
            {/* Search bar + locate me button */}
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm z-10">🔍</span>
                    <input
                        type="text"
                        value={searchText}
                        onChange={e => handleSearchChange(e.target.value)}
                        placeholder="Search for your location..."
                        className="input pl-9 w-full"
                    />
                    {suggestions.length > 0 && (
                        <ul className="absolute z-[1000] left-0 right-0 top-full mt-1 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            {suggestions.map((item: any, i: number) => (
                                <li
                                    key={i}
                                    onClick={() => handleSuggestionClick(item)}
                                    className="px-3 py-2 text-sm text-surface-700 dark:text-surface-300 hover:bg-primary-50 dark:hover:bg-primary-900/20 cursor-pointer truncate"
                                >
                                    {item.display_name}
                                </li>
                            ))}
                        </ul>
                    )}
                    {searching && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 text-xs animate-pulse">Searching...</span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={handleCurrentLocation}
                    disabled={locating}
                    className="btn-secondary flex items-center gap-1.5 text-sm whitespace-nowrap"
                    title="Use my current location"
                >
                    {locating ? (
                        <span className="animate-spin">⏳</span>
                    ) : (
                        <span>📍</span>
                    )}
                    <span className="hidden sm:inline">{locating ? 'Locating...' : 'Use My Location'}</span>
                </button>
            </div>

            {/* Location error banner */}
            {locError && (
                <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg px-3 py-2 text-xs text-red-700 dark:text-red-400">
                    <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                    <span>{locError}</span>
                    <button
                        type="button"
                        onClick={() => setLocError(null)}
                        className="ml-auto text-red-400 hover:text-red-600 shrink-0"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            )}

            {/* Map */}
            <div className="relative rounded-lg overflow-hidden border border-gray-200 shadow-sm" style={{ height: '300px' }}>
                <MapContainer
                    center={marker || DEFAULT_CENTER}
                    zoom={marker ? 16 : 5}
                    style={{ width: '100%', height: '100%' }}
                    zoomControl={true}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <MapClickHandler onMapClick={handlePlaceMarker} />
                    {flyTarget && <FlyTo position={flyTarget.pos} zoom={flyTarget.zoom} />}
                    {marker && (
                        <Marker
                            position={marker}
                            draggable
                            eventHandlers={{
                                dragend: (e) => {
                                    const latlng = e.target.getLatLng()
                                    handlePlaceMarker(latlng.lat, latlng.lng)
                                },
                            }}
                        />
                    )}
                </MapContainer>

                {/* Hint overlay */}
                {!marker && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/10 pointer-events-none">
                        <div className="bg-white/95 px-4 py-2 rounded-full shadow text-sm text-gray-600 font-medium">
                            📍 Click on the map or search to select delivery location
                        </div>
                    </div>
                )}
            </div>

            {marker && (
                <p className="text-xs text-gray-500 flex items-center gap-1">
                    <span>📌</span> Drag the pin to adjust your exact delivery location
                </p>
            )}
            {fetchedCoords && (
                <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-lg px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="font-medium">Exact coordinates:</span>
                    <span className="font-mono">{fetchedCoords.lat.toFixed(6)}, {fetchedCoords.lng.toFixed(6)}</span>
                </div>
            )}
        </div>
    )
}
