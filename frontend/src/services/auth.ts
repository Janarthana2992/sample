import { authClient } from './api'
import type { TokenResponse, User, StaffUser } from '../types'

export const authService = {
    register: (data: { email: string; password: string; full_name: string; phone?: string }) =>
        authClient.post<User>('/auth/register', data).then(r => r.data),

    login: (email: string, password: string) =>
        authClient.post<TokenResponse>('/auth/login', { email, password }).then(r => r.data),

    me: () => authClient.get<User>('/auth/me').then(r => r.data),

    updateMe: (data: { full_name?: string; phone?: string }) =>
        authClient.patch<User>('/auth/me', data).then(r => r.data),

    changePassword: (current_password: string, new_password: string) =>
        authClient.post('/auth/me/change-password', { current_password, new_password }),

    requestPasswordReset: (email: string) =>
        authClient.post('/auth/password-reset/request', { email }),

    confirmPasswordReset: (token: string, new_password: string) =>
        authClient.post('/auth/password-reset/confirm', { token, new_password }),

    // Staff management
    createStaff: (data: object) => authClient.post<StaffUser>('/staff', data).then(r => r.data),
    listStaff: () => authClient.get<StaffUser[]>('/staff').then(r => r.data),
    getStaff: (id: string) => authClient.get<StaffUser>(`/staff/${id}`).then(r => r.data),
    updateStaffPermissions: (id: string, permissions: string[]) =>
        authClient.patch<StaffUser>(`/staff/${id}/permissions`, { permissions }).then(r => r.data),
    toggleSuspend: (id: string) =>
        authClient.patch<StaffUser>(`/staff/${id}/suspend`).then(r => r.data),
}
