import { useState, useEffect, useRef, useCallback } from 'react'
import { aiClient } from '../../services/api'
import { useAuthStore } from '../../store/authStore'

interface Ticket {
    ticket_id: string
    user_id: string
    user_name: string
    reason: string
    status: string
    agent_name?: string
    created_at: string
    assigned_at?: string
}

interface ChatMsg {
    sender: string
    sender_name: string
    content: string
    timestamp: number
}

export default function Handoff() {
    const { accessToken } = useAuthStore()
    const [queue, setQueue] = useState<Ticket[]>([])
    const [myTickets, setMyTickets] = useState<Ticket[]>([])
    const [activeTicket, setActiveTicket] = useState<string | null>(null)
    const [messages, setMessages] = useState<ChatMsg[]>([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const wsRef = useRef<WebSocket | null>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const fetchQueue = useCallback(async () => {
        try {
            const res = await aiClient.get('/handoff/queue')
            setQueue(res.data.tickets || [])
        } catch { /* ignore */ }
    }, [])

    const fetchMyTickets = useCallback(async () => {
        try {
            const res = await aiClient.get('/handoff/my-tickets')
            setMyTickets(res.data.tickets || [])
        } catch { /* ignore */ }
    }, [])

    useEffect(() => {
        fetchQueue()
        fetchMyTickets()
        const interval = setInterval(() => {
            fetchQueue()
            fetchMyTickets()
        }, 10000)
        return () => clearInterval(interval)
    }, [fetchQueue, fetchMyTickets])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const connectWs = useCallback((ticketId: string) => {
        if (wsRef.current) {
            wsRef.current.close()
        }

        const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/handoff/${ticketId}?token=${accessToken}`
        const ws = new WebSocket(wsUrl)

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data)
            if (data.type === 'history') {
                setMessages(data.messages || [])
            } else if (data.type === 'message') {
                setMessages(prev => [...prev, data])
            } else if (data.type === 'resolved') {
                setMessages(prev => [...prev, {
                    sender: 'system',
                    sender_name: 'System',
                    content: 'This conversation has been resolved.',
                    timestamp: data.timestamp,
                }])
            } else if (data.type === 'agent_joined') {
                setMessages(prev => [...prev, {
                    sender: 'system',
                    sender_name: 'System',
                    content: `${data.agent_name} has joined the conversation.`,
                    timestamp: data.timestamp,
                }])
            }
        }

        ws.onerror = () => { /* reconnect logic could go here */ }
        ws.onclose = () => { wsRef.current = null }

        wsRef.current = ws
    }, [accessToken])

    const handleAccept = async (ticketId: string) => {
        setLoading(true)
        try {
            await aiClient.post('/handoff/assign', { ticket_id: ticketId })
            await fetchQueue()
            await fetchMyTickets()
            setActiveTicket(ticketId)
            connectWs(ticketId)
        } catch (err) {
            alert('Failed to accept ticket')
        } finally {
            setLoading(false)
        }
    }

    const handleResolve = async (ticketId: string) => {
        try {
            await aiClient.post('/handoff/resolve', { ticket_id: ticketId })
            if (activeTicket === ticketId) {
                setActiveTicket(null)
                setMessages([])
                wsRef.current?.close()
            }
            await fetchMyTickets()
        } catch (err) {
            alert('Failed to resolve ticket')
        }
    }

    const handleOpenChat = (ticketId: string) => {
        setActiveTicket(ticketId)
        setMessages([])
        connectWs(ticketId)
    }

    const sendMessage = () => {
        const text = input.trim()
        if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        wsRef.current.send(JSON.stringify({ type: 'message', content: text }))
        setInput('')
    }

    const formatTime = (ts: string | number) => {
        const d = new Date(typeof ts === 'number' ? ts * 1000 : ts)
        return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    }

    const timeSince = (ts: string) => {
        const secs = Math.floor(Date.now() / 1000 - parseFloat(ts))
        if (secs < 60) return `${secs}s ago`
        if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
        return `${Math.floor(secs / 3600)}h ago`
    }

    return (
        <div className="flex h-[calc(100vh-120px)] gap-4">
            {/* Left panel — Queue + My tickets */}
            <div className="w-80 flex-shrink-0 flex flex-col gap-4 overflow-y-auto">
                {/* Waiting queue */}
                <div className="bg-white dark:bg-surface-800 rounded-2xl shadow p-4">
                    <h2 className="text-lg font-bold text-surface-900 dark:text-white mb-3 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-500" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" /></svg> Waiting Queue
                        {queue.length > 0 && (
                            <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{queue.length}</span>
                        )}
                    </h2>
                    {queue.length === 0 ? (
                        <p className="text-sm text-surface-500 dark:text-surface-400">No customers waiting</p>
                    ) : (
                        <div className="space-y-2">
                            {queue.map(t => (
                                <div key={t.ticket_id} className="border border-surface-200 dark:border-surface-700 rounded-lg p-3">
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium text-sm text-surface-900 dark:text-white">{t.user_name}</span>
                                        <span className="text-xs text-surface-500 dark:text-surface-400">{timeSince(t.created_at)}</span>
                                    </div>
                                    <p className="text-xs text-surface-500 dark:text-surface-400 mt-1 truncate">{t.reason}</p>
                                    <button
                                        onClick={() => handleAccept(t.ticket_id)}
                                        disabled={loading}
                                        className="mt-2 w-full bg-green-600 hover:bg-green-700 text-white text-xs font-medium py-1.5 rounded-lg transition-colors disabled:opacity-50"
                                    >
                                        Accept
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* My active tickets */}
                <div className="bg-white dark:bg-surface-800 rounded-2xl shadow p-4">
                    <h2 className="text-lg font-bold text-surface-900 dark:text-white mb-3">💬 My Conversations</h2>
                    {myTickets.length === 0 ? (
                        <p className="text-sm text-surface-500 dark:text-surface-400">No active conversations</p>
                    ) : (
                        <div className="space-y-2">
                            {myTickets.map(t => (
                                <div
                                    key={t.ticket_id}
                                    className={`border rounded-lg p-3 cursor-pointer transition-colors ${activeTicket === t.ticket_id
                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                        : 'border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800/50'
                                        }`}
                                    onClick={() => handleOpenChat(t.ticket_id)}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium text-sm text-surface-900 dark:text-white">{t.user_name}</span>
                                        <span className={`text-xs px-1.5 py-0.5 rounded ${t.status === 'assigned' ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-surface-100 dark:bg-surface-800 text-surface-800 dark:text-surface-200'
                                            }`}>{t.status}</span>
                                    </div>
                                    {t.status === 'assigned' && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleResolve(t.ticket_id); }}
                                            className="mt-2 w-full bg-gray-600 hover:bg-gray-700 text-white text-xs py-1 rounded-lg"
                                        >
                                            Resolve
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Right panel — Chat */}
            <div className="flex-1 bg-white dark:bg-surface-800 rounded-2xl shadow flex flex-col">
                {!activeTicket ? (
                    <div className="flex-1 flex items-center justify-center text-surface-400 dark:text-surface-500">
                        <div className="text-center">
                            <p className="text-4xl mb-2">💬</p>
                            <p className="text-lg font-medium">Select a conversation</p>
                            <p className="text-sm">Accept a ticket from the queue or open an existing conversation</p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Chat messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {messages.map((msg, i) => (
                                <div key={i} className={`flex ${msg.sender === 'agent' ? 'justify-end' : msg.sender === 'system' ? 'justify-center' : 'justify-start'}`}>
                                    {msg.sender === 'system' ? (
                                        <div className="bg-surface-100 dark:bg-surface-700 text-surface-500 dark:text-surface-400 text-xs px-3 py-1 rounded-full">
                                            {msg.content}
                                        </div>
                                    ) : (
                                        <div className={`max-w-[70%] rounded-2xl px-4 py-2 ${msg.sender === 'agent'
                                            ? 'bg-blue-600 text-white rounded-br-md'
                                            : 'bg-surface-100 dark:bg-surface-700 text-surface-900 dark:text-surface-100 rounded-bl-md'
                                            }`}>
                                            <div className="text-xs opacity-70 mb-0.5">{msg.sender_name}</div>
                                            <div className="text-sm">{msg.content}</div>
                                            <div className="text-xs opacity-50 mt-0.5 text-right">{formatTime(msg.timestamp)}</div>
                                        </div>
                                    )}
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input */}
                        <div className="p-4 border-t border-surface-200 dark:border-surface-700">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && sendMessage()}
                                    placeholder="Type your message..."
                                    className="flex-1 rounded-xl border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-surface-200"
                                />
                                <button
                                    onClick={sendMessage}
                                    disabled={!input.trim()}
                                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl px-4 py-2 text-sm font-medium"
                                >
                                    Send
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
