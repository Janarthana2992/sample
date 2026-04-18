import { useState, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { aiClient } from '../../services/api'
import ReactMarkdown from 'react-markdown'

interface ChatMessage {
    role: 'user' | 'assistant'
    content: string
    products?: Product[]
    handoffTicketId?: string
    ts?: number
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

const QUICK_REPLIES = [
    '🔥 Best deals today',
    '📦 Track my order',
    '🛍️ Recommend products',
    '↩️ Return policy',
]

function formatTime(ts?: number) {
    if (!ts) return ''
    return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

export function ChatWidget() {
    const [open, setOpen] = useState(false)
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [sessionId, setSessionId] = useState<string | null>(null)
    const [handoffTicketId, setHandoffTicketId] = useState<string | null>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const location = useLocation()

    // Bug fix 1: close chat on route change
    useEffect(() => {
        setOpen(false)
    }, [location.pathname])

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, loading])

    // Bug fix 2: focus input when chat opens or after message sent
    useEffect(() => {
        if (open && !handoffTicketId) {
            setTimeout(() => inputRef.current?.focus(), 50)
        }
    }, [open, handoffTicketId])

    const sendMessage = async (text?: string) => {
        const msg = (text ?? input).trim()
        if (!msg || loading) return

        setInput('')
        setMessages(prev => [...prev, { role: 'user', content: msg, ts: Date.now() }])
        setLoading(true)

        try {
            const res = await aiClient.post('/chat', {
                message: msg,
                session_id: sessionId,
            })
            const data = res.data
            if (data.session_id) setSessionId(data.session_id)

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
                    ts: Date.now(),
                },
            ])
        } catch (err: unknown) {
            const status = (err as { response?: { status?: number } })?.response?.status
            const errMsg =
                status === 429
                    ? 'AI assistant is temporarily busy. Please try again in a moment.'
                    : 'Sorry, I encountered an error. Please try again.'
            setMessages(prev => [...prev, { role: 'assistant', content: errMsg, ts: Date.now() }])
        } finally {
            setLoading(false)
            // Bug fix 2: re-focus input after every reply
            setTimeout(() => inputRef.current?.focus(), 50)
        }
    }

    const handleClear = () => {
        setMessages([])
        setSessionId(null)
        setHandoffTicketId(null)
        setTimeout(() => inputRef.current?.focus(), 50)
    }

    return (
        <>
            {/* Toggle button */}
            <motion.button
                onClick={() => setOpen(v => !v)}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-colors"
                style={{
                    background: open
                        ? 'linear-gradient(135deg, #6366f1, #4f46e5)'
                        : 'linear-gradient(135deg, #4c6ef5, #364fc7)',
                }}
                aria-label="Chat with assistant"
            >
                <AnimatePresence mode="wait" initial={false}>
                    {open ? (
                        <motion.svg
                            key="close"
                            initial={{ rotate: -90, opacity: 0 }}
                            animate={{ rotate: 0, opacity: 1 }}
                            exit={{ rotate: 90, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="w-5 h-5 text-white"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </motion.svg>
                    ) : (
                        <motion.svg
                            key="chat"
                            initial={{ rotate: 90, opacity: 0 }}
                            animate={{ rotate: 0, opacity: 1 }}
                            exit={{ rotate: -90, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="w-6 h-6 text-white"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </motion.svg>
                    )}
                </AnimatePresence>
                {/* Unread badge when closed */}
                {!open && messages.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[9px] text-white font-bold flex items-center justify-center">
                        {messages.filter(m => m.role === 'assistant').length}
                    </span>
                )}
            </motion.button>

            {/* Chat panel */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 16, scale: 0.96 }}
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                        className="fixed bottom-24 right-6 z-50 w-96 max-w-[calc(100vw-3rem)] flex flex-col rounded-2xl overflow-hidden"
                        style={{
                            height: '34rem',
                            boxShadow: '0 24px 64px rgba(0,0,0,0.18), 0 4px 16px rgba(76,110,245,0.12)',
                        }}
                    >
                        {/* Header */}
                        <div
                            className="flex items-center justify-between px-4 py-3 shrink-0"
                            style={{ background: 'linear-gradient(135deg, #4c6ef5 0%, #364fc7 100%)' }}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1 1 .03 2.798-1.414 2.798H4.212c-1.444 0-2.414-1.798-1.414-2.798L4.2 15.3" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="text-white font-semibold text-sm leading-tight">ShopHere Assistant</p>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                                        <span className="text-white/70 text-[11px]">Online · AI powered</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                {messages.length > 0 && (
                                    <button
                                        onClick={handleClear}
                                        className="text-white/60 hover:text-white text-xs px-2 py-1 rounded-lg hover:bg-white/10 transition-colors"
                                    >
                                        Clear
                                    </button>
                                )}
                                <button
                                    onClick={() => setOpen(false)}
                                    className="text-white/60 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                                    aria-label="Close chat"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 px-3 py-3 space-y-3">
                            {messages.length === 0 && (
                                <div className="flex flex-col items-center justify-center h-full gap-5 pb-4">
                                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                                        style={{ background: 'linear-gradient(135deg, #dbe4ff, #bac8ff)' }}>
                                        <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                        </svg>
                                    </div>
                                    <div className="text-center">
                                        <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm">Hi there! 👋</p>
                                        <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">I can help with products, orders & more.</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2 justify-center w-full px-1">
                                        {QUICK_REPLIES.map(q => (
                                            <button
                                                key={q}
                                                onClick={() => sendMessage(q)}
                                                className="text-xs px-3 py-1.5 rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors font-medium"
                                            >
                                                {q}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {messages.map((msg, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.18 }}
                                    className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    {msg.role === 'assistant' && (
                                        <div className="w-7 h-7 rounded-xl shrink-0 mt-0.5 flex items-center justify-center"
                                            style={{ background: 'linear-gradient(135deg, #4c6ef5, #364fc7)' }}>
                                            <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M12 2L9.19 8.63L2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61z" />
                                            </svg>
                                        </div>
                                    )}
                                    <div className="flex flex-col gap-1 max-w-[78%]">
                                        <div
                                            className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${msg.role === 'user'
                                                ? 'text-white rounded-tr-sm'
                                                : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-tl-sm border border-gray-100 dark:border-gray-700 shadow-sm'
                                                }`}
                                            style={msg.role === 'user' ? { background: 'linear-gradient(135deg, #4c6ef5, #364fc7)' } : {}}
                                        >
                                            {msg.role === 'assistant' ? (
                                                <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:mb-1 [&_p:last-child]:mb-0 [&_ul]:mt-1 [&_li]:mb-0.5">
                                                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                                                </div>
                                            ) : (
                                                <span>{msg.content}</span>
                                            )}
                                        </div>

                                        {/* Product cards */}
                                        {msg.products && msg.products.length > 0 && (
                                            <div className="space-y-1.5 mt-1">
                                                {msg.products.slice(0, 4).map(p => (
                                                    <a
                                                        key={p.product_id}
                                                        href={`/products/${p.product_id}`}
                                                        className="flex gap-3 p-2.5 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 hover:border-primary-200 dark:hover:border-primary-700 hover:shadow-md transition-all group/product"
                                                    >
                                                        <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-700 overflow-hidden shrink-0">
                                                            {p.image_url ? (
                                                                <img src={p.image_url} alt={p.name} className="w-full h-full object-cover group-hover/product:scale-105 transition-transform duration-200" />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-gray-300 text-lg">🛍️</div>
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate leading-tight">{p.name}</p>
                                                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                                <span className="text-primary-600 dark:text-primary-400 font-bold text-xs">
                                                                    ₹{p.selling_price?.toLocaleString('en-IN')}
                                                                </span>
                                                                {p.mrp && p.mrp > (p.selling_price || 0) && (
                                                                    <span className="text-gray-400 line-through text-[10px]">
                                                                        ₹{p.mrp.toLocaleString('en-IN')}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {p.rating != null && (
                                                                <div className="flex items-center gap-1 mt-0.5">
                                                                    <span className="text-amber-400 text-[10px]">★</span>
                                                                    <span className="text-gray-500 dark:text-gray-400 text-[10px]">
                                                                        {p.rating.toFixed(1)}{p.review_count ? ` (${p.review_count})` : ''}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </a>
                                                ))}
                                            </div>
                                        )}

                                        <span className={`text-[10px] text-gray-400 dark:text-gray-600 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                                            {formatTime(msg.ts)}
                                        </span>
                                    </div>
                                </motion.div>
                            ))}

                            {/* Typing indicator */}
                            {loading && (
                                <motion.div
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex gap-2 justify-start"
                                >
                                    <div className="w-7 h-7 rounded-xl shrink-0 flex items-center justify-center"
                                        style={{ background: 'linear-gradient(135deg, #4c6ef5, #364fc7)' }}>
                                        <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M12 2L9.19 8.63L2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61z" />
                                        </svg>
                                    </div>
                                    <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                                        <div className="flex items-center gap-1">
                                            {[0, 150, 300].map(delay => (
                                                <span
                                                    key={delay}
                                                    className="w-2 h-2 bg-primary-400 rounded-full animate-bounce"
                                                    style={{ animationDelay: `${delay}ms` }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input area */}
                        <div className="shrink-0 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 px-3 py-3">
                            {handoffTicketId ? (
                                <div className="flex items-center justify-center gap-2 py-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-xl px-3">
                                    <svg className="w-4 h-4 shrink-0 animate-spin" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                    <span>Connecting you to a human agent...</span>
                                </div>
                            ) : (
                                <div className="flex gap-2 items-end">
                                    <div className="flex-1 relative">
                                        <input
                                            ref={inputRef}
                                            type="text"
                                            value={input}
                                            onChange={e => setInput(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                                            placeholder="Ask me anything..."
                                            disabled={loading}
                                            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-all disabled:opacity-60"
                                        />
                                    </div>
                                    <motion.button
                                        onClick={() => sendMessage()}
                                        disabled={loading || !input.trim()}
                                        whileTap={{ scale: 0.92 }}
                                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 disabled:opacity-40 transition-all"
                                        style={{ background: 'linear-gradient(135deg, #4c6ef5, #364fc7)' }}
                                        aria-label="Send message"
                                    >
                                        <svg className="w-4 h-4 text-white translate-x-px" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                                        </svg>
                                    </motion.button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    )
}

