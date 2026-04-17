import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { orderService } from '../../services/orders'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import { AnimatedPage, FadeInView } from '../../components/common/AnimatedPage'
import { MapLocationPicker } from '../../components/common/MapLocationPicker'
import type { Address } from '../../types'

interface AddressForm {
    full_name: string
    phone: string
    address_line1: string
    address_line2?: string
    city: string
    state: string
    pincode: string
    latitude?: number
    longitude?: number
    is_default: boolean
}

export default function Addresses() {
    const qc = useQueryClient()
    const [showForm, setShowForm] = useState(false)
    const [editAddress, setEditAddress] = useState<Address | null>(null)
    const [mapPos, setMapPos] = useState<{ lat: number; lng: number } | null>(null)

    const { register, handleSubmit, formState: { errors }, setValue, reset, watch } = useForm<AddressForm>({
        defaultValues: { is_default: false },
    })

    const { data: addresses, isLoading } = useQuery({
        queryKey: ['addresses'],
        queryFn: orderService.listAddresses,
    })

    const addMutation = useMutation({
        mutationFn: (data: AddressForm) => orderService.createAddress(data),
        onSuccess: () => {
            toast.success('Address saved')
            qc.invalidateQueries({ queryKey: ['addresses'] })
            setShowForm(false)
            reset()
            setMapPos(null)
        },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to save address'),
    })

    const handleLocationSelect = (loc: { lat: number; lng: number; address_line1: string; city: string; state: string; pincode: string }) => {
        setValue('address_line1', loc.address_line1)
        setValue('city', loc.city)
        setValue('state', loc.state)
        setValue('pincode', loc.pincode)
        setValue('latitude', loc.lat)
        setValue('longitude', loc.lng)
        setMapPos({ lat: loc.lat, lng: loc.lng })
    }

    const openAddForm = () => {
        setEditAddress(null)
        reset({ is_default: false })
        setMapPos(null)
        setShowForm(true)
    }

    if (isLoading) return <LoadingSpinner />

    return (
        <AnimatedPage>
            <div className="max-w-3xl mx-auto space-y-8">
                {/* Header */}
                <FadeInView>
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Saved Addresses</h1>
                            <p className="text-gray-500 dark:text-gray-400 mt-1">Manage your delivery addresses</p>
                        </div>
                        <button onClick={openAddForm} className="btn-primary flex items-center gap-2 text-sm">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"/></svg>
                            Add Address
                        </button>
                    </div>
                </FadeInView>

                {/* Address list */}
                {!addresses || addresses.length === 0 ? (
                    <div className="text-center py-20">
                        <div className="w-20 h-20 bg-gray-50 dark:bg-gray-800 rounded-3xl flex items-center justify-center mx-auto mb-6">
                            <svg className="w-10 h-10 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                        </div>
                        <p className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">No addresses saved</p>
                        <p className="text-sm text-gray-400 mb-6">Add a delivery address to speed up checkout</p>
                        <button onClick={openAddForm} className="btn-primary">Add Your First Address</button>
                    </div>
                ) : (
                    <div className="grid sm:grid-cols-2 gap-4">
                        {addresses.map((addr, i) => (
                            <motion.div
                                key={addr.address_id}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 space-y-3"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <p className="font-semibold text-gray-900 dark:text-white">{addr.full_name}</p>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">{addr.phone}</p>
                                    </div>
                                    {addr.is_default && (
                                        <span className="shrink-0 text-xs bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 font-semibold px-2.5 py-1 rounded-lg">Default</span>
                                    )}
                                </div>
                                <div className="text-sm text-gray-600 dark:text-gray-300 space-y-0.5">
                                    <p>{addr.address_line1}</p>
                                    {addr.address_line2 && <p>{addr.address_line2}</p>}
                                    <p>{addr.city}, {addr.state} — {addr.pincode}</p>
                                </div>
                                {addr.latitude && addr.longitude && (
                                    <p className="text-xs text-gray-400 flex items-center gap-1">
                                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                                        {addr.latitude.toFixed(4)}, {addr.longitude.toFixed(4)}
                                    </p>
                                )}
                            </motion.div>
                        ))}
                    </div>
                )}

                {/* Add address form slide-in */}
                <AnimatePresence>
                    {showForm && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
                            onClick={() => setShowForm(false)}
                        >
                            <motion.div
                                initial={{ y: 60, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: 60, opacity: 0 }}
                                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                                className="bg-white dark:bg-gray-900 w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl overflow-hidden max-h-[95vh] flex flex-col"
                                onClick={e => e.stopPropagation()}
                            >
                                {/* Modal header */}
                                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
                                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">Add New Address</h2>
                                    <button
                                        onClick={() => setShowForm(false)}
                                        className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg>
                                    </button>
                                </div>

                                {/* Scrollable body */}
                                <form onSubmit={handleSubmit(d => addMutation.mutate(d))} className="overflow-y-auto flex-1 p-6 space-y-5">
                                    {/* Map – use current location */}
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
                                            <svg className="w-4 h-4 text-primary-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                                            Pin Delivery Location
                                        </label>
                                        <p className="text-xs text-gray-400 mb-3">Click "Use My Location" or drop a pin on the map — address fields will auto-fill.</p>
                                        <MapLocationPicker
                                            onLocationSelect={handleLocationSelect}
                                            initialPosition={mapPos}
                                        />
                                    </div>

                                    {/* Name & Phone */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="label">Full Name *</label>
                                            <input className="input" placeholder="John Doe" {...register('full_name', { required: 'Required' })} />
                                            {errors.full_name && <p className="text-red-500 text-xs mt-1">{errors.full_name.message}</p>}
                                        </div>
                                        <div>
                                            <label className="label">Phone *</label>
                                            <input className="input" placeholder="9876543210" {...register('phone', { required: 'Required' })} />
                                            {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
                                        </div>
                                    </div>

                                    {/* Address Line 1 */}
                                    <div>
                                        <label className="label">Address Line 1 *</label>
                                        <input className="input" placeholder="Street / Flat no." {...register('address_line1', { required: 'Required' })} />
                                        {errors.address_line1 && <p className="text-red-500 text-xs mt-1">{errors.address_line1.message}</p>}
                                    </div>

                                    {/* Address Line 2 */}
                                    <div>
                                        <label className="label">Address Line 2 <span className="text-gray-400 font-normal">(optional)</span></label>
                                        <input className="input" placeholder="Landmark, area..." {...register('address_line2')} />
                                    </div>

                                    {/* City / State / Pincode */}
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <label className="label">City *</label>
                                            <input className="input" placeholder="Mumbai" {...register('city', { required: 'Required' })} />
                                            {errors.city && <p className="text-red-500 text-xs mt-1">{errors.city.message}</p>}
                                        </div>
                                        <div>
                                            <label className="label">State *</label>
                                            <input className="input" placeholder="Maharashtra" {...register('state', { required: 'Required' })} />
                                            {errors.state && <p className="text-red-500 text-xs mt-1">{errors.state.message}</p>}
                                        </div>
                                        <div>
                                            <label className="label">Pincode *</label>
                                            <input className="input" placeholder="400001" {...register('pincode', { required: 'Required', pattern: { value: /^\d{6}$/, message: '6-digit pincode' } })} />
                                            {errors.pincode && <p className="text-red-500 text-xs mt-1">{errors.pincode.message}</p>}
                                        </div>
                                    </div>

                                    {/* Default checkbox */}
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input type="checkbox" className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500" {...register('is_default')} />
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Set as default address</span>
                                    </label>

                                    {/* Hidden lat/lng */}
                                    <input type="hidden" {...register('latitude')} />
                                    <input type="hidden" {...register('longitude')} />

                                    <button
                                        type="submit"
                                        disabled={addMutation.isPending}
                                        className="btn-primary w-full flex items-center justify-center gap-2"
                                    >
                                        {addMutation.isPending ? (
                                            <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Saving…</>
                                        ) : (
                                            <><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>Save Address</>
                                        )}
                                    </button>
                                </form>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </AnimatedPage>
    )
}
