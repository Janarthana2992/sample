import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '../types'

interface AuthState {
    user: User | null
    accessToken: string | null
    refreshToken: string | null
    setUser: (user: User) => void
    setTokens: (access: string, refresh: string) => void
    logout: () => void
    isAuthenticated: boolean
    hasPermission: (module: string) => boolean
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,

            setUser: (user) => set({ user, isAuthenticated: true }),

            setTokens: (access, refresh) =>
                set({ accessToken: access, refreshToken: refresh, isAuthenticated: true }),

            logout: () =>
                set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false }),

            hasPermission: (module: string) => {
                const user = get().user
                if (!user) return false
                if (user.role === 'admin') return true
                return (user.permissions ?? []).some(p => p.module === module)
            },
        }),
        {
            name: 'auth-storage',
            partialize: (state) => ({
                accessToken: state.accessToken,
                refreshToken: state.refreshToken,
                user: state.user,
                isAuthenticated: state.isAuthenticated,
            }),
        }
    )
)
