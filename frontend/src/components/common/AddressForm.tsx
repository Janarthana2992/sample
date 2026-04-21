import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { orderService } from '../../services/orders'
import { AddressAutocomplete } from './AddressAutocomplete'
import type { Address } from '../../types'

export interface AddressFormData {
    full_name: string
    phone: string
    address_line1: string
    address_line2?: string
    city: string
    state: string
    pincode: string
    is_default?: boolean
}

interface Props {
    onSaved: (address: Address) => void
    onCancel?: () => void
    defaultValues?: Partial<AddressFormData>
    submitLabel?: string
}

const NAME_PATTERN = /^[A-Za-z][A-Za-z .'\-]{1,254}$/
const PHONE_PATTERN = /^[6-9]\d{9}$/
const PINCODE_PATTERN = /^[1-9]\d{5}$/

/**
 * Reusable address entry form with:
 *   - client-side validation (name, phone, line1, city, state, pincode)
 *   - Google Maps autocomplete
 *   - live pincode → city/state lookup via the India Post API
 *   - robust error handling so the page never "goes blank" on a save failure
 */
export function AddressForm({ onSaved, onCancel, defaultValues, submitLabel = 'Save Address' }: Props) {
    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
        setValue,
        watch,
        setError,
        clearErrors,
    } = useForm<AddressFormData>({ defaultValues, mode: 'onBlur' })

    const pincode = watch('pincode')
    const [pincodeChecking, setPincodeChecking] = useState(false)
    const [pincodeCity, setPincodeCity] = useState<string | null>(null)
    const [pincodeState, setPincodeState] = useState<string | null>(null)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        if (!pincode || !PINCODE_PATTERN.test(pincode)) {
            setPincodeCity(null)
            setPincodeState(null)
            return
        }
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(async () => {
            setPincodeChecking(true)
            try {
                const info = await orderService.lookupPincode(pincode)
                if (!info.valid) {
                    setError('pincode', { message: 'This pincode is not a valid Indian PIN' })
                    setPincodeCity(null)
                    setPincodeState(null)
                } else {
                    clearErrors('pincode')
                    setPincodeCity(info.city)
                    setPincodeState(info.state)
                    if (info.city) setValue('city', info.city, { shouldValidate: true })
                    if (info.state) setValue('state', info.state, { shouldValidate: true })
                }
            } catch {
                // network hiccup — keep client-side validity only
            } finally {
                setPincodeChecking(false)
            }
        }, 400)
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current)
        }
    }, [pincode, setValue, setError, clearErrors])

    const onSubmit = handleSubmit(async data => {
        try {
            const saved = await orderService.createAddress(data)
            toast.success('Address saved')
            onSaved(saved)
        } catch (err: unknown) {
            // Extract the best error message we can from the backend response
            // while staying defensive against unexpected shapes — the goal is
            // to never crash the page on a save failure.
            const response = (err as { response?: { data?: unknown } })?.response
            const data = response?.data as { detail?: unknown } | undefined
            let message = 'Failed to save address'
            if (data) {
                if (typeof data.detail === 'string') {
                    message = data.detail
                } else if (Array.isArray(data.detail) && data.detail.length > 0) {
                    const first = data.detail[0] as { msg?: string }
                    if (first?.msg) message = first.msg
                }
            }
            toast.error(message)
        }
    })

    return (
        <form onSubmit={onSubmit} className="space-y-3" noValidate>
            <div>
                <label className="label">Search Address (Google Maps)</label>
                <AddressAutocomplete
                    onPlaceSelected={place => {
                        setValue('address_line1', place.address_line1, { shouldValidate: true })
                        if (place.city) setValue('city', place.city, { shouldValidate: true })
                        if (place.state) setValue('state', place.state, { shouldValidate: true })
                        if (place.pincode) setValue('pincode', place.pincode, { shouldValidate: true })
                    }}
                    placeholder="Start typing to search..."
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                    <label className="label">Full Name</label>
                    <input
                        className="input"
                        autoComplete="name"
                        {...register('full_name', {
                            required: 'Full name is required',
                            minLength: { value: 2, message: 'At least 2 characters' },
                            maxLength: { value: 255, message: 'Too long' },
                            pattern: { value: NAME_PATTERN, message: "Only letters, spaces, . - ' are allowed" },
                        })}
                    />
                    {errors.full_name && <p className="text-red-500 text-xs mt-1">{errors.full_name.message}</p>}
                </div>
                <div>
                    <label className="label">Phone (10-digit mobile)</label>
                    <input
                        className="input"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        maxLength={10}
                        {...register('phone', {
                            required: 'Phone is required',
                            pattern: {
                                value: PHONE_PATTERN,
                                message: 'Enter a 10-digit Indian mobile number (starts with 6-9)',
                            },
                        })}
                    />
                    {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
                </div>
            </div>

            <div>
                <label className="label">Address Line 1</label>
                <input
                    className="input"
                    autoComplete="address-line1"
                    {...register('address_line1', {
                        required: 'Address is required',
                        minLength: { value: 5, message: 'At least 5 characters' },
                        maxLength: { value: 255, message: 'Too long' },
                    })}
                />
                {errors.address_line1 && <p className="text-red-500 text-xs mt-1">{errors.address_line1.message}</p>}
            </div>

            <div>
                <label className="label">Address Line 2 (optional)</label>
                <input
                    className="input"
                    autoComplete="address-line2"
                    {...register('address_line2', { maxLength: { value: 255, message: 'Too long' } })}
                />
                {errors.address_line2 && <p className="text-red-500 text-xs mt-1">{errors.address_line2.message}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                    <label className="label">Pincode</label>
                    <input
                        className="input"
                        inputMode="numeric"
                        maxLength={6}
                        autoComplete="postal-code"
                        {...register('pincode', {
                            required: 'Pincode is required',
                            pattern: { value: PINCODE_PATTERN, message: 'Enter a valid 6-digit Indian PIN' },
                        })}
                    />
                    {pincodeChecking && (
                        <p className="text-xs text-gray-500 mt-1">Verifying pincode…</p>
                    )}
                    {!pincodeChecking && pincodeCity && pincodeState && (
                        <p className="text-xs text-green-600 mt-1">
                            ✓ {pincodeCity}, {pincodeState}
                        </p>
                    )}
                    {errors.pincode && <p className="text-red-500 text-xs mt-1">{errors.pincode.message}</p>}
                </div>
                <div>
                    <label className="label">City</label>
                    <input
                        className="input"
                        autoComplete="address-level2"
                        {...register('city', {
                            required: 'City is required',
                            minLength: { value: 2, message: 'Too short' },
                        })}
                    />
                    {errors.city && <p className="text-red-500 text-xs mt-1">{errors.city.message}</p>}
                </div>
                <div>
                    <label className="label">State</label>
                    <input
                        className="input"
                        autoComplete="address-level1"
                        {...register('state', {
                            required: 'State is required',
                            minLength: { value: 2, message: 'Too short' },
                        })}
                    />
                    {errors.state && <p className="text-red-500 text-xs mt-1">{errors.state.message}</p>}
                </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" {...register('is_default')} className="rounded text-blue-600" />
                Set as default address
            </label>

            <div className="flex gap-2 pt-1">
                <button type="submit" disabled={isSubmitting || pincodeChecking} className="btn-primary">
                    {isSubmitting ? 'Saving…' : submitLabel}
                </button>
                {onCancel && (
                    <button type="button" onClick={onCancel} className="btn-secondary">
                        Cancel
                    </button>
                )}
            </div>
        </form>
    )
}
