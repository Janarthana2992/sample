import { useRef, useEffect } from 'react'
import { useJsApiLoader } from '@react-google-maps/api'

const LIBRARIES: ('places')[] = ['places']

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
    const inputRef = useRef<HTMLInputElement>(null)
    const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''

    const { isLoaded } = useJsApiLoader({
        googleMapsApiKey: apiKey,
        libraries: LIBRARIES,
    })

    useEffect(() => {
        if (!isLoaded || !inputRef.current || autocompleteRef.current) return

        autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
            componentRestrictions: { country: 'in' },
            fields: ['address_components', 'formatted_address'],
            types: ['address'],
        })

        autocompleteRef.current.addListener('place_changed', () => {
            const place = autocompleteRef.current?.getPlace()
            if (!place?.address_components) return

            let streetNumber = ''
            let route = ''
            let city = ''
            let state = ''
            let pincode = ''

            for (const comp of place.address_components) {
                const types = comp.types
                if (types.includes('street_number')) streetNumber = comp.long_name
                if (types.includes('route')) route = comp.long_name
                if (types.includes('sublocality_level_1') || types.includes('sublocality')) {
                    if (!route) route = comp.long_name
                }
                if (types.includes('locality')) city = comp.long_name
                if (types.includes('administrative_area_level_1')) state = comp.long_name
                if (types.includes('postal_code')) pincode = comp.long_name
            }

            const address_line1 = streetNumber ? `${streetNumber} ${route}` : route || place.formatted_address || ''

            onPlaceSelected({ address_line1, city, state, pincode })
        })
    }, [isLoaded, onPlaceSelected])

    if (!apiKey) {
        // Fallback: plain input if no API key
        return (
            <input
                type="text"
                defaultValue={defaultValue}
                className={className}
                placeholder={placeholder}
            />
        )
    }

    return (
        <input
            ref={inputRef}
            type="text"
            defaultValue={defaultValue}
            className={className}
            placeholder={isLoaded ? placeholder : 'Loading...'}
        />
    )
}
