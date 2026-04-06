import { orderClient } from './api'
import type { Address, Order, Paginated } from '../types'

export const orderService = {
    // Addresses
    listAddresses: () => orderClient.get<Address[]>('/addresses').then(r => r.data),
    createAddress: (data: object) => orderClient.post<Address>('/addresses', data).then(r => r.data),

    // Orders
    listOrders: (params?: Record<string, unknown>) =>
        orderClient.get<Paginated<Order>>('/orders', { params }).then(r => r.data),

    getOrder: (id: string) => orderClient.get<Order>(`/orders/${id}`).then(r => r.data),

    checkout: (address_id: string, payment_method: string) =>
        orderClient.post<Order>('/orders', { address_id, payment_method }).then(r => r.data),

    updateStatus: (orderId: string, data: object) =>
        orderClient.patch<Order>(`/orders/${orderId}/status`, data).then(r => r.data),

    // Admin analytics
    getDashboardKPIs: () => orderClient.get('/admin/dashboard/kpis').then(r => r.data),
    getAdminKpis: () => orderClient.get('/admin/dashboard/kpis').then(r => r.data),
    getTopProducts: (period: string) =>
        orderClient.get('/admin/dashboard/top-products', { params: { period } }).then(r => r.data),
    getPincodeMap: () => orderClient.get('/admin/dashboard/pincode-map').then(r => r.data),
}
