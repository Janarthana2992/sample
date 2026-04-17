import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatedPage } from '../../components/common/AnimatedPage'

const FAQS = [
    {
        q: 'How do I track my order?',
        a: 'Go to My Orders and click on your order to see real-time status. If your order has been dispatched, the tracking number will be shown there.',
    },
    {
        q: 'Can I change my delivery address after placing an order?',
        a: 'Address changes are only possible before the order is confirmed. Please contact support immediately if you need to update your address.',
    },
    {
        q: 'What payment methods do you accept?',
        a: 'We accept UPI, credit/debit cards (Visa, Mastercard, RuPay), net banking, wallets (Paytm, PhonePe), and Cash on Delivery. EMI is available on orders above ₹3,000.',
    },
    {
        q: 'How do I cancel my order?',
        a: 'Orders can be cancelled before they are dispatched. Open the order from My Orders and click "Cancel Order". Once dispatched, you will need to wait for delivery and then raise a return.',
    },
    {
        q: 'How do I return an item?',
        a: 'After your order is delivered, go to the order detail page and click "Request Return". Our team will arrange a pickup within 2 business days.',
    },
    {
        q: 'When will I get my refund?',
        a: 'Refunds for cancelled orders are processed within 3–5 business days. Returns are refunded within 5–7 business days after successful pickup.',
    },
    {
        q: 'Is my payment information secure?',
        a: 'Yes. All payments are secured with 256-bit SSL encryption. We do not store card details — payments are processed by Razorpay.',
    },
    {
        q: 'How do I apply a deal or coupon?',
        a: 'Active deals are applied automatically at checkout based on the products in your cart. No manual coupon entry is required.',
    },
]

function FAQ({ q, a }: { q: string; a: string }) {
    const [open, setOpen] = useState(false)
    return (
        <div className="border border-surface-200 dark:border-surface-700 rounded-xl overflow-hidden">
            <button
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center justify-between px-5 py-4 text-left bg-white dark:bg-surface-800 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
            >
                <span className="font-medium text-surface-900 dark:text-white text-sm">{q}</span>
                <svg
                    className={`w-4 h-4 text-surface-400 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {open && (
                <div className="px-5 py-4 text-sm text-surface-600 dark:text-surface-400 bg-surface-50 dark:bg-surface-800/50 border-t border-surface-100 dark:border-surface-700">
                    {a}
                </div>
            )}
        </div>
    )
}

export default function HelpCenter() {
    return (
        <AnimatedPage>
            <div className="max-w-2xl mx-auto space-y-8 py-6">
                <div>
                    <h1 className="text-3xl font-bold text-surface-900 dark:text-white">Help Center</h1>
                    <p className="text-surface-500 dark:text-surface-400 mt-2">Find answers to the most common questions.</p>
                </div>

                <div className="space-y-2">
                    {FAQS.map((faq, i) => (
                        <FAQ key={i} q={faq.q} a={faq.a} />
                    ))}
                </div>

                <div className="card bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800/40 text-center space-y-3">
                    <p className="font-semibold text-surface-900 dark:text-white">Still have questions?</p>
                    <p className="text-sm text-surface-500 dark:text-surface-400">Our support team is ready to help you.</p>
                    <Link to="/support" className="btn-primary inline-block">Contact Support</Link>
                </div>
            </div>
        </AnimatedPage>
    )
}
