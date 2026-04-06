import axios from 'axios'
import { useAuthStore } from '../store/authStore'

const AUTH_URL = import.meta.env.VITE_AUTH_SERVICE_URL || 'http://localhost:8001'
const PRODUCT_URL = import.meta.env.VITE_PRODUCT_SERVICE_URL || 'http://localhost:8002'
const CART_URL = import.meta.env.VITE_CART_SERVICE_URL || 'http://localhost:8003'
const ORDER_URL = import.meta.env.VITE_ORDER_SERVICE_URL || 'http://localhost:8004'
const AI_URL = import.meta.env.VITE_AI_SERVICE_URL || 'http://localhost:8005'

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
