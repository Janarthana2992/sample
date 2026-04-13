/// <reference types="vite/client" />

interface Window {
    google?: typeof google
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void }
}
