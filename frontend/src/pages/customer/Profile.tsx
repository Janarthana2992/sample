import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useAuthStore } from '../../store/authStore'
import { authService } from '../../services/auth'
import { orderService } from '../../services/orders'
import { AddressForm } from '../../components/common/AddressForm'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import type { Address } from '../../types'

export default function Profile() {
    const { user, setUser } = useAuthStore()
    const qc = useQueryClient()

    const [editingProfile, setEditingProfile] = useState(false)
    const [showAddForm, setShowAddForm] = useState(false)
    const [profileDraft, setProfileDraft] = useState({
        full_name: user?.full_name || '',
        phone: user?.phone || '',
    })

    const { data: addresses, isLoading } = useQuery({
        queryKey: ['addresses'],
        queryFn: orderService.listAddresses,
    })

    const updateProfile = useMutation({
        mutationFn: () => authService.updateMe(profileDraft),
        onSuccess: updated => {
            setUser(updated)
            setEditingProfile(false)
            toast.success('Profile updated')
        },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update profile'),
    })

    const deleteAddress = useMutation({
        mutationFn: (id: string) => orderService.deleteAddress(id),
        onSuccess: () => {
            toast.success('Address removed')
            qc.invalidateQueries({ queryKey: ['addresses'] })
        },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to delete address'),
    })

    if (!user) return <LoadingSpinner />

    return (
        <div className="max-w-3xl mx-auto space-y-8">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">My Profile</h1>

            {/* Account info card */}
            <section className="card space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Account Details</h2>
                    {!editingProfile && (
                        <button
                            className="text-sm text-blue-600 hover:underline"
                            onClick={() => {
                                setProfileDraft({ full_name: user.full_name, phone: user.phone || '' })
                                setEditingProfile(true)
                            }}
                        >
                            Edit
                        </button>
                    )}
                </div>

                {!editingProfile ? (
                    <dl className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                        <div className="flex"><dt className="w-28 text-gray-500">Name</dt><dd>{user.full_name}</dd></div>
                        <div className="flex"><dt className="w-28 text-gray-500">Email</dt><dd>{user.email}</dd></div>
                        <div className="flex"><dt className="w-28 text-gray-500">Phone</dt><dd>{user.phone || '—'}</dd></div>
                        <div className="flex"><dt className="w-28 text-gray-500">Role</dt><dd className="capitalize">{user.role}</dd></div>
                    </dl>
                ) : (
                    <div className="space-y-3">
                        <div>
                            <label className="label">Full Name</label>
                            <input
                                className="input"
                                value={profileDraft.full_name}
                                onChange={e => setProfileDraft(d => ({ ...d, full_name: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="label">Phone</label>
                            <input
                                className="input"
                                inputMode="numeric"
                                value={profileDraft.phone}
                                onChange={e => setProfileDraft(d => ({ ...d, phone: e.target.value }))}
                            />
                        </div>
                        <div className="flex gap-2">
                            <button
                                className="btn-primary"
                                disabled={updateProfile.isPending}
                                onClick={() => updateProfile.mutate()}
                            >
                                {updateProfile.isPending ? 'Saving…' : 'Save'}
                            </button>
                            <button className="btn-secondary" onClick={() => setEditingProfile(false)}>
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </section>

            {/* Addresses */}
            <section className="card space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Saved Addresses</h2>
                    <button
                        className="text-sm text-blue-600 hover:underline"
                        onClick={() => setShowAddForm(v => !v)}
                    >
                        {showAddForm ? '✕ Cancel' : '+ Add new address'}
                    </button>
                </div>

                {isLoading ? (
                    <LoadingSpinner />
                ) : (
                    <div className="space-y-3">
                        {(addresses || []).length === 0 && !showAddForm && (
                            <p className="text-sm text-gray-500">You have no saved addresses yet.</p>
                        )}
                        {(addresses || []).map((addr: Address) => (
                            <div
                                key={addr.address_id}
                                className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 flex items-start justify-between gap-3"
                            >
                                <div className="text-sm text-gray-800 dark:text-gray-200">
                                    <p className="font-medium">
                                        {addr.full_name} · {addr.phone}
                                        {addr.is_default && (
                                            <span className="badge bg-blue-100 text-blue-700 ml-2">Default</span>
                                        )}
                                    </p>
                                    <p className="text-gray-600 dark:text-gray-400">{addr.address_line1}</p>
                                    {addr.address_line2 && (
                                        <p className="text-gray-600 dark:text-gray-400">{addr.address_line2}</p>
                                    )}
                                    <p className="text-gray-600 dark:text-gray-400">
                                        {addr.city}, {addr.state} — {addr.pincode}
                                    </p>
                                </div>
                                <button
                                    className="text-xs text-red-500 hover:underline shrink-0"
                                    onClick={() => {
                                        if (confirm('Remove this address?')) deleteAddress.mutate(addr.address_id)
                                    }}
                                >
                                    Delete
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {showAddForm && (
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                        <AddressForm
                            onSaved={() => {
                                setShowAddForm(false)
                                qc.invalidateQueries({ queryKey: ['addresses'] })
                            }}
                            onCancel={() => setShowAddForm(false)}
                        />
                    </div>
                )}
            </section>
        </div>
    )
}
