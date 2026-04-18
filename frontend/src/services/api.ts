import axios from 'axios'
import { useAuthStore } from '../store/authStore'

// In production (Docker/any server), Nginx proxies /api/* to the correct service.
// In local dev (npm run dev), Vite's proxy (vite.config.ts) handles /api/* — no hardcoded host needed.
// VITE_* env vars are only read as an escape hatch (e.g. pointing at a remote dev server).
const AUTH_URL = import.meta.env.VITE_AUTH_SERVICE_URL || '/api/auth'
const PRODUCT_URL = import.meta.env.VITE_PRODUCT_SERVICE_URL || '/api/products'
const CART_URL = import.meta.env.VITE_CART_SERVICE_URL || '/api/cart'
const ORDER_URL = import.meta.env.VITE_ORDER_SERVICE_URL || '/api/orders'
const AI_URL = import.meta.env.VITE_AI_SERVICE_URL || '/api/ai'

function createClient(baseURL: string) {
    const client = axios.create({ baseURL })

    client.interceptors.request.use((config) => {
        const token = useAuthStore.getState().accessToken
        if (token) {
            config.headers.Authorization = `Bearer ${token}`
        }
        return config
    })

    client.interceptors.response.use(
        (res) => res,
        async (err) => {
            const original = err.config
            if (err.response?.status === 401 && !original._retry) {
                original._retry = true
                const refreshToken = useAuthStore.getState().refreshToken
                if (refreshToken) {
                    try {
                        const res = await axios.post(`${AUTH_URL}/auth/refresh`, { refresh_token: refreshToken })
                        const { access_token, refresh_token } = res.data
                        useAuthStore.getState().setTokens(access_token, refresh_token)
                        original.headers.Authorization = `Bearer ${access_token}`
                        return client(original)
                    } catch {
                        useAuthStore.getState().logout()
                    }
                } else {
                    useAuthStore.getState().logout()
                }
            }
            return Promise.reject(err)
        }
    )

    return client
}

export const authClient = createClient(AUTH_URL)
export const productClient = createClient(PRODUCT_URL)
export const cartClient = createClient(CART_URL)
export const orderClient = createClient(ORDER_URL)
export const aiClient = createClient(AI_URL)
