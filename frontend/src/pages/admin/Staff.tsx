import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { authService } from '../../services/auth'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import type { StaffUser } from '../../types'

const MODULES = [
    { id: 'reply_reviews', label: 'Reply to Reviews' },
    { id: 'stock_management', label: 'Stock Management' },
    { id: 'deal_management', label: 'Deal Details View' },
    { id: 'order_management', label: 'Order Dispatch' },
    { id: 'product_listing_view', label: 'Product Listing View' },
]

interface CreateStaffForm {
    email: string
    full_name: string
    phone?: string
    temp_password: string
}

export default function AdminStaff() {
    const qc = useQueryClient()
    const [showCreate, setShowCreate] = useState(false)
    const [selectedPermissions, setSelectedPermissions] = useState<string[]>([])
    const [editingPerms, setEditingPerms] = useState<{ id: string; perms: string[] } | null>(null)

    const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<CreateStaffForm>()

    const { data: staff, isLoading } = useQuery({
        queryKey: ['admin', 'staff'],
        queryFn: authService.listStaff,
    })

    const createMutation = useMutation({
        mutationFn: (data: object) => authService.createStaff(data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['admin', 'staff'] })
            setShowCreate(false)
            reset()
            setSelectedPermissions([])
            toast.success('Staff member created!')
        },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to create staff'),
    })

    const toggleMutation = useMutation({
        mutationFn: (id: string) => authService.toggleSuspend(id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'staff'] }); toast.success('Status updated') },
    })

    const updatePermsMutation = useMutation({
        mutationFn: ({ id, perms }: { id: string; perms: string[] }) =>
            authService.updateStaffPermissions(id, perms),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'staff'] }); setEditingPerms(null); toast.success('Permissions updated') },
    })

    const onCreateSubmit = (data: CreateStaffForm) => {
        createMutation.mutate({ ...data, permissions: selectedPermissions })
    }

    const togglePerm = (mod: string, arr: string[], setArr: (a: string[]) => void) => {
        setArr(arr.includes(mod) ? arr.filter(m => m !== mod) : [...arr, mod])
    }

    if (isLoading) return <LoadingSpinner />

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900">Staff Management</h1>
                <button onClick={() => setShowCreate(v => !v)} className="btn-primary text-sm">
                    {showCreate ? '✕ Cancel' : '+ Add Staff'}
                </button>
            </div>

            {/* Create form */}
            {showCreate && (
                <div className="card space-y-4">
                    <h2 className="font-semibold text-gray-900">New Staff Member</h2>
                    <form onSubmit={handleSubmit(onCreateSubmit)} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="label">Full Name</label>
                                <input className="input" {...register('full_name', { required: 'Required' })} />
                                {errors.full_name && <p className="text-red-500 text-xs mt-1">{errors.full_name.message}</p>}
                            </div>
                            <div>
                                <label className="label">Email</label>
                                <input type="email" className="input" {...register('email', { required: 'Required' })} />
                                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
                            </div>
                            <div>
                                <label className="label">Phone (optional)</label>
                                <input type="tel" className="input" {...register('phone')} />
                            </div>
                            <div>
                                <label className="label">Temporary Password</label>
                                <input type="password" className="input" {...register('temp_password', { required: 'Required', minLength: { value: 8, message: 'Min 8 chars' } })} />
                                {errors.temp_password && <p className="text-red-500 text-xs mt-1">{errors.temp_password.message}</p>}
                            </div>
                        </div>

                        <div>
                            <label className="label">Permissions</label>
                            <div className="flex flex-wrap gap-2">
                                {MODULES.map(m => (
                                    <button
                                        key={m.id}
                                        type="button"
                                        onClick={() => togglePerm(m.id, selectedPermissions, setSelectedPermissions)}
                                        className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${selectedPermissions.includes(m.id) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                                            }`}
                                    >
                                        {m.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button type="submit" disabled={isSubmitting} className="btn-primary">
                            {isSubmitting ? 'Creating...' : 'Create Staff Member'}
                        </button>
                    </form>
                </div>
            )}

            {/* Staff list */}
            <div className="space-y-3">
                {staff?.map((s: StaffUser) => (
                    <div key={s.user_id} className="card">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="font-semibold text-gray-900">{s.full_name}</p>
                                <p className="text-sm text-gray-500">{s.email}</p>
                                <p className="text-xs text-gray-400 mt-1">Last login: —</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className={`badge ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    {s.is_active ? 'Active' : 'Suspended'}
                                </span>
                                <button
                                    onClick={() => toggleMutation.mutate(s.user_id)}
                                    className="text-xs text-gray-500 hover:underline"
                                >
                                    {s.is_active ? 'Suspend' : 'Reactivate'}
                                </button>
                            </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-1">
                            {s.permissions.map(p => (
                                <span key={p.permission_id} className="badge bg-blue-50 text-blue-700 text-xs">
                                    {MODULES.find(m => m.id === p.module)?.label || p.module}
                                </span>
                            ))}
                        </div>

                        {editingPerms?.id === s.user_id ? (
                            <div className="mt-3 border-t pt-3 space-y-2">
                                <div className="flex flex-wrap gap-2">
                                    {MODULES.map(m => (
                                        <button
                                            key={m.id}
                                            type="button"
                                            onClick={() => setEditingPerms(ep => ep ? { ...ep, perms: ep.perms.includes(m.id) ? ep.perms.filter(x => x !== m.id) : [...ep.perms, m.id] } : ep)}
                                            className={`px-3 py-1 rounded-lg text-xs border ${editingPerms.perms.includes(m.id) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'
                                                }`}
                                        >
                                            {m.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => updatePermsMutation.mutate({ id: s.user_id, perms: editingPerms.perms })}
                                        disabled={updatePermsMutation.isPending}
                                        className="btn-primary text-sm py-1"
                                    >Save</button>
                                    <button onClick={() => setEditingPerms(null)} className="btn-secondary text-sm py-1">Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={() => setEditingPerms({ id: s.user_id, perms: s.permissions.map(p => p.module) })}
                                className="mt-3 text-xs text-blue-600 hover:underline"
                            >
                                Edit Permissions
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}
