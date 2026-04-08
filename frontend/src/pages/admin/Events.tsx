import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { productService } from '../../services/products'
import type { Event } from '../../types'

type FormState = {
    title: string
    description: string
    register_url: string
    event_date: string
    is_active: boolean
    image: File | null
}

const blank: FormState = {
    title: '', description: '', register_url: '', event_date: '', is_active: true, image: null,
}

function normalizeUrl(value: string) {
    const trimmed = value.trim()
    if (!trimmed) return ''
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

export default function AdminEvents() {
    const qc = useQueryClient()
    const [showForm, setShowForm] = useState(false)
    const [editing, setEditing] = useState<Event | null>(null)
    const [form, setForm] = useState<FormState>(blank)
    const [preview, setPreview] = useState<string | null>(null)

    const { data: events, isLoading } = useQuery({
        queryKey: ['events'],
        queryFn: () => productService.listEvents(),
    })

    const buildFd = () => {
        const fd = new FormData()
        fd.append('title', form.title)
        fd.append('description', form.description)
        fd.append('register_url', normalizeUrl(form.register_url))
        if (form.event_date) fd.append('event_date', form.event_date)
        fd.append('is_active', String(form.is_active))
        if (form.image) fd.append('image', form.image)
        return fd
    }

    const createMut = useMutation({
        mutationFn: () => productService.createEvent(buildFd()),
        onSuccess: async () => {
            toast.success('Event created!')
            await qc.invalidateQueries({ queryKey: ['events'] })
            reset()
        },
        onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to create event'),
    })

    const updateMut = useMutation({
        mutationFn: () => productService.updateEvent(editing!.event_id, buildFd()),
        onSuccess: async () => {
            toast.success('Event updated!')
            await qc.invalidateQueries({ queryKey: ['events'] })
            reset()
        },
        onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to update event'),
    })

    const deleteMut = useMutation({
        mutationFn: (id: string) => productService.deleteEvent(id),
        onSuccess: async () => {
            toast.success('Event deleted')
            await qc.invalidateQueries({ queryKey: ['events'] })
        },
        onError: () => toast.error('Failed to delete event'),
    })

    const reset = () => { setForm(blank); setEditing(null); setShowForm(false); setPreview(null) }

    const startEdit = (ev: Event) => {
        setEditing(ev)
        setForm({
            title: ev.title,
            description: ev.description,
            register_url: ev.register_url,
            event_date: ev.event_date ? ev.event_date.slice(0, 16) : '',
            is_active: ev.is_active,
            image: null,
        })
        setPreview(ev.image_url || null)
        setShowForm(true)
    }

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] || null
        setForm(f => ({ ...f, image: file }))
        if (file) setPreview(URL.createObjectURL(file))
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.title || form.title.length < 3) { toast.error('Title must be at least 3 characters'); return }
        if (!form.description || form.description.length < 10) { toast.error('Description must be at least 10 characters'); return }
        if (!form.register_url) { toast.error('Registration link is required'); return }
        try {
            new URL(normalizeUrl(form.register_url))
        } catch {
            toast.error('Enter a valid registration link')
            return
        }
        editing ? updateMut.mutate() : createMut.mutate()
    }

    const isPending = createMut.isPending || updateMut.isPending

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900">Events</h1>
                {!showForm && (
                    <button onClick={() => { reset(); setShowForm(true) }} className="btn-primary">
                        + New Event
                    </button>
                )}
            </div>

            {/* Create / Edit Form */}
            {showForm && (
                <div className="card space-y-4">
                    <h2 className="font-semibold text-gray-900">{editing ? 'Edit Event' : 'New Event'}</h2>
                    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                        <div>
                            <label className="label">Title *</label>
                            <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Annual Tech Summit 2026" />
                        </div>

                        <div>
                            <label className="label">Description *</label>
                            <textarea
                                className="input min-h-[120px] resize-y"
                                value={form.description}
                                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                placeholder="Tell attendees what this event is about..."
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="label">Registration Link *</label>
                                <input
                                    className="input"
                                    type="text"
                                    value={form.register_url}
                                    onChange={e => setForm(f => ({ ...f, register_url: e.target.value }))}
                                    placeholder="forms.example.com/register or https://forms.example.com/register"
                                />
                            </div>
                            <div>
                                <label className="label">Event Date & Time</label>
                                <input
                                    className="input"
                                    type="datetime-local"
                                    value={form.event_date}
                                    onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="label">Banner Image (JPEG / PNG / WEBP, max 5MB)</label>
                            <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                onChange={handleImageChange}
                                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                            />
                            {preview && (
                                <img src={preview} alt="preview" className="mt-2 h-40 rounded-lg object-cover border border-gray-200" />
                            )}
                        </div>

                        <label className="flex items-center gap-3 cursor-pointer">
                            <button
                                type="button"
                                onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                                className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${form.is_active ? 'bg-blue-600' : 'bg-gray-300'}`}
                            >
                                <span className={`inline-block h-5 w-5 rounded-full bg-white shadow mt-0.5 transition-transform ${form.is_active ? 'translate-x-5' : 'translate-x-0.5'}`} />
                            </button>
                            <span className="text-sm font-medium text-gray-700">Visible to customers</span>
                        </label>

                        <div className="flex gap-3 pt-2">
                            <button type="button" onClick={reset} className="btn-secondary">Cancel</button>
                            <button type="submit" disabled={isPending} className="btn-primary flex-1">
                                {isPending ? 'Saving...' : editing ? 'Save Changes' : 'Create Event'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Events List */}
            {isLoading ? (
                <p className="text-gray-400 text-sm">Loading events...</p>
            ) : !events || events.length === 0 ? (
                <div className="card text-center py-12 text-gray-400">
                    <p className="text-4xl mb-3">📅</p>
                    <p className="font-medium">No events yet</p>
                    <p className="text-sm mt-1">Click "New Event" to create your first event post.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {events.map(ev => (
                        <div key={ev.event_id} className="card flex gap-4">
                            {/* Banner */}
                            <div className="w-36 h-28 shrink-0 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
                                {ev.image_url
                                    ? <img src={ev.image_url} alt={ev.title} className="w-full h-full object-cover" />
                                    : <span className="text-3xl">📅</span>
                                }
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                    <h3 className="font-semibold text-gray-900 truncate">{ev.title}</h3>
                                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${ev.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                        {ev.is_active ? 'Active' : 'Hidden'}
                                    </span>
                                </div>
                                <p className="text-sm text-gray-600 mt-1 line-clamp-2">{ev.description}</p>
                                <div className="mt-2 flex items-center gap-4 flex-wrap">
                                    {ev.event_date && (
                                        <span className="text-xs text-gray-500">
                                            📆 {new Date(ev.event_date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                                        </span>
                                    )}
                                    <a href={ev.register_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline truncate max-w-xs">
                                        🔗 {ev.register_url}
                                    </a>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="shrink-0 flex flex-col gap-2 justify-center">
                                <button onClick={() => startEdit(ev)} className="btn-secondary text-xs px-3 py-1.5">Edit</button>
                                <button
                                    onClick={() => { if (confirm('Delete this event?')) deleteMut.mutate(ev.event_id) }}
                                    className="text-xs px-3 py-1.5 rounded-lg text-red-600 hover:bg-red-50 border border-red-200"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
