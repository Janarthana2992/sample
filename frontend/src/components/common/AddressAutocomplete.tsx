import { useRef, useState, useCallback } from 'react'

interface AddressAutocompleteProps {
    onPlaceSelected: (place: {
        address_line1: string
        city: string
        state: string
        pincode: string
    }) => void
    defaultValue?: string
    className?: string
    placeholder?: string
}

export function AddressAutocomplete({
    onPlaceSelected,
    defaultValue = '',
    className = 'input',
    placeholder = 'Start typing your address...',
}: AddressAutocompleteProps) {
    const [value, setValue] = useState(defaultValue)
    const [suggestions, setSuggestions] = useState<any[]>([])
    const [showDropdown, setShowDropdown] = useState(false)
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const handleChange = useCallback((text: string) => {
        setValue(text)
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        if (text.length < 3) { setSuggestions([]); setShowDropdown(false); return }
        timeoutRef.current = setTimeout(async () => {
            try {
                const res = await fetch(
                    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(text)}&format=json&addressdetails=1&limit=5&countrycodes=in&accept-language=en`,
                    { headers: { 'User-Agent': 'ECommerceApp/1.0' } }
                )
                const data = await res.json()
                setSuggestions(data)
                setShowDropdown(data.length > 0)
            } catch {
                setSuggestions([])
                setShowDropdown(false)
            }
        }, 400)
    }, [])

    const handleSelect = useCallback((item: any) => {
        const addr = item.address || {}
        const address_line1 = [addr.road, addr.neighbourhood, addr.suburb].filter(Boolean).join(', ') || item.display_name?.split(',')[0] || ''
        const city = addr.city || addr.town || addr.village || addr.county || ''
        const state = addr.state || ''
        const pincode = addr.postcode || ''
        setValue(item.display_name?.split(',').slice(0, 3).join(',') || '')
        setShowDropdown(false)
        setSuggestions([])
        onPlaceSelected({ address_line1, city, state, pincode })
    }, [onPlaceSelected])

    return (
        <div className="relative">
            <input
                type="text"
                value={value}
                onChange={e => handleChange(e.target.value)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                className={className}
                placeholder={placeholder}
            />
            {showDropdown && suggestions.length > 0 && (
                <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {suggestions.map((item: any, i: number) => (
                        <li
                            key={i}
                            onMouseDown={() => handleSelect(item)}
                            className="px-3 py-2 text-sm text-surface-700 dark:text-surface-300 hover:bg-primary-50 dark:hover:bg-primary-900/20 cursor-pointer truncate"
                        >
                            {item.display_name}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
