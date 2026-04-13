import { useState, useRef, useEffect } from 'react'
import { aiClient } from '../../services/api'
import ReactMarkdown from 'react-markdown'

interface ChatMessage {
    role: 'user' | 'assistant'
    content: string
    products?: Product[]
    handoffTicketId?: string
}

interface Product {
    product_id: string
    name: string
    selling_price?: number
    mrp?: number
    stock_status?: string
    rating?: number
    review_count?: number
    image_url?: string
}

export function ChatWidget() {
    const [open, setOpen] = useState(false)
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [sessionId, setSessionId] = useState<string | null>(null)
    const [handoffTicketId, setHandoffTicketId] = useState<string | null>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const sendMessage = async () => {
        const text = input.trim()
        if (!text || loading) return

        setInput('')
        setMessages(prev => [...prev, { role: 'user', content: text }])
        setLoading(true)

        try {
            const res = await aiClient.post('/chat', {
                message: text,
                session_id: sessionId,
            })
            const data = res.data
            if (data.session_id) setSessionId(data.session_id)

            // Check for handoff action
            const handoffAction = data.actions?.find((a: { type: string }) => a.type === 'handoff')
            const ticketId = handoffAction?.data?.ticket_id
            if (ticketId) setHandoffTicketId(ticketId)

            setMessages(prev => [
                ...prev,
                {
                    role: 'assistant',
                    content: data.response,
                    products: data.products || undefined,
                    handoffTicketId: ticketId || undefined,
                },
            ])
        } catch (err: unknown) {
            const status = (err as { response?: { status?: number } })?.response?.status
            const msg =
                status === 429
                    ? 'AI assistant is temporarily busy. Please try again in a moment.'
                    : 'Sorry, I encountered an error. Please try again.'
            setMessages(prev => [...prev, { role: 'assistant', content: msg }])
        } finally {
            setLoading(false)
        }
    }

    return (
        <>
            {/* Toggle button */}
            <button
                onClick={() => setOpen(!open)}
                className="fixed bottom-5 right-5 z-50 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg transition-transform hover:scale-105"
                aria-label="Chat with assistant"
            >
                {open ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                )}
            </button>

            {/* Chat panel */}
            {open && (
                <div className="fixed bottom-24 right-5 z-50 w-96 max-w-[calc(100vw-2.5rem)] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col" style={{ height: '32rem' }}>
                    {/* Header */}
                    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-indigo-600 text-white rounded-t-2xl flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                            <span className="font-semibold text-sm">ShopHere Assistant</span>
                        </div>
                        <button
                            onClick={() => {
                                setMessages([])
                                setSessionId(null)
                                setHandoffTicketId(null)
                            }}
                            className="text-xs text-indigo-200 hover:text-white"
                        >
                            Clear
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-3">
                        {messages.length === 0 && (
                            <div className="text-center text-gray-400 dark:text-gray-500 text-sm mt-8">
                                <p className="mb-2">👋 Hi! I'm your shopping assistant.</p>
                                <p className="text-xs">Ask me about products, orders, or recommendations!</p>
                            </div>
                        )}
                        {messages.map((msg, i) => (
                            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div
                                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${msg.role === 'user'
                                        ? 'bg-indigo-600 text-white rounded-br-md'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-md'
                                        }`}
                                >
                                    {msg.role === 'assistant' ? (
                                        <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:mb-1 [&_ul]:mt-1 [&_li]:mb-0.5">
                                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                                        </div>
                                    ) : (
                                        msg.content
                                    )}
                                    {msg.products && msg.products.length > 0 && (
                                        <div className="mt-2 space-y-2">
                                            {msg.products.slice(0, 4).map(p => (
                                                <a
                                                    key={p.product_id}
                                                    href={`/product/${p.product_id}`}
                                                    className="block p-2 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 hover:shadow-md transition-shadow"
                                                >
                                                    <div className="font-medium text-xs text-gray-900 dark:text-gray-100 truncate">
                                                        {p.name}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-indigo-600 dark:text-indigo-400 font-bold text-xs">
                                                            ₹{p.selling_price?.toLocaleString('en-IN')}
                                                        </span>
                                                        {p.mrp && p.mrp > (p.selling_price || 0) && (
                                                            <span className="text-gray-400 line-through text-xs">
                                                                ₹{p.mrp.toLocaleString('en-IN')}
                                                            </span>
                                                        )}
                                                        {p.rating != null && (
                                                            <span className="text-yellow-500 text-xs">
                                                                ★ {p.rating.toFixed(1)}
                                                                {p.review_count ? ` (${p.review_count})` : ''}
                                                            </span>
                                                        )}
                                                    </div>
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-2 rounded-bl-md">
                                    <div className="flex space-x-1">
                                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="p-3 border-t border-gray-200 dark:border-gray-700">
                        {handoffTicketId ? (
                            <div className="text-center text-xs text-gray-500 dark:text-gray-400 py-1">
                                🔄 Waiting for a human agent...
                            </div>
                        ) : (
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && sendMessage()}
                                    placeholder="Ask me anything..."
                                    className="flex-1 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-gray-200"
                                    disabled={loading}
                                />
                                <button
                                    onClick={sendMessage}
                                    disabled={loading || !input.trim()}
                                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl px-3 py-2 text-sm font-medium transition-colors"
                                >
                                    Send
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    )
}

