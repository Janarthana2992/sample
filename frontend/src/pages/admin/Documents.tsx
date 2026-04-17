import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { aiClient } from '../../services/api'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'

interface RagDoc {
    doc_id: string
    filename: string
    chunk_count: number
    char_count: number
}

export default function Documents() {
    const queryClient = useQueryClient()
    const [dragOver, setDragOver] = useState(false)
    const [error, setError] = useState('')

    const { data, isLoading } = useQuery({
        queryKey: ['admin-rag-docs'],
        queryFn: () => aiClient.get<{ documents: RagDoc[]; total: number }>('/admin/documents').then(r => r.data),
    })

    const uploadMutation = useMutation({
        mutationFn: (file: File) => {
            const fd = new FormData()
            fd.append('file', file)
            return aiClient.post('/admin/documents', fd).then(r => r.data)
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin-rag-docs'] })
            setError('')
        },
        onError: (err: any) => {
            setError(err.response?.data?.detail || 'Upload failed')
        },
    })

    const deleteMutation = useMutation({
        mutationFn: (docId: string) => aiClient.delete(`/admin/documents/${docId}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin-rag-docs'] })
        },
    })

    const handleFiles = (files: FileList | null) => {
        if (!files) return
        setError('')
        for (const file of Array.from(files)) {
            const ext = file.name.split('.').pop()?.toLowerCase()
            if (!['txt', 'md', 'pdf', 'csv'].includes(ext || '')) {
                setError(`Unsupported file type: .${ext}. Allowed: .txt, .md, .pdf, .csv`)
                continue
            }
            if (file.size > 5 * 1024 * 1024) {
                setError('File too large. Max 5 MB')
                continue
            }
            uploadMutation.mutate(file)
        }
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setDragOver(false)
        handleFiles(e.dataTransfer.files)
    }

    if (isLoading) return <LoadingSpinner />

    const docs = data?.documents ?? []

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-surface-900 dark:text-white">RAG Documents</h1>
                <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
                    Upload documents to feed the AI chatbot knowledge base. Supported: .txt, .md, .pdf, .csv (max 5 MB)
                </p>
            </div>

            {/* Upload zone */}
            <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-surface-300 dark:border-surface-600 bg-surface-50 dark:bg-surface-800'
                    }`}
            >
                <div className="text-4xl mb-3">📄</div>
                <p className="text-sm text-surface-600 dark:text-surface-400 mb-3">
                    Drag & drop files here, or click to browse
                </p>
                <label className="inline-block cursor-pointer bg-primary-600 text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-colors">
                    Choose Files
                    <input
                        type="file"
                        className="hidden"
                        multiple
                        accept=".txt,.md,.pdf,.csv"
                        onChange={(e) => handleFiles(e.target.files)}
                    />
                </label>
                {uploadMutation.isPending && (
                    <p className="text-sm text-blue-600 mt-3">Uploading & indexing...</p>
                )}
            </div>

            {error && (
                <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
            )}

            {/* Documents list */}
            {docs.length === 0 ? (
                <div className="text-center py-12 text-surface-500 dark:text-surface-400">
                    <p className="text-5xl mb-4">📂</p>
                    <p className="text-lg font-medium">No documents uploaded yet</p>
                    <p className="text-sm mt-1">Upload files to enhance the chatbot's knowledge</p>
                </div>
            ) : (
                <div className="space-y-3">
                    <p className="text-sm text-surface-500 dark:text-surface-400 font-medium">{docs.length} document(s) indexed</p>
                    {docs.map(doc => (
                        <div key={doc.doc_id} className="card flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">
                                    {doc.filename.endsWith('.pdf') ? '📕' :
                                        doc.filename.endsWith('.csv') ? '📊' :
                                            doc.filename.endsWith('.md') ? '📝' : '📄'}
                                </span>
                                <div>
                                    <p className="font-medium text-surface-900 dark:text-white">{doc.filename}</p>
                                    <p className="text-xs text-surface-500 dark:text-surface-400">
                                        {doc.chunk_count} chunks · {(doc.char_count / 1000).toFixed(1)}k chars
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    if (window.confirm(`Delete "${doc.filename}" from the knowledge base?`)) {
                                        deleteMutation.mutate(doc.doc_id)
                                    }
                                }}
                                disabled={deleteMutation.isPending}
                                className="text-red-600 hover:text-red-800 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                            >
                                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
