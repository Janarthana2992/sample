import { orderClient } from './api'
import type { Address, Order, Paginated } from '../types'

export const orderService = {
    // Addresses
    listAddresses: () => orderClient.get<Address[]>('/addresses').then(r => r.data),
    createAddress: (data: object) => orderClient.post<Address>('/addresses', data).then(r => r.data),
    deleteAddress: (id: string) => orderClient.delete(`/addresses/${id}`).then(r => r.data),
    lookupPincode: (pincode: string) =>
        orderClient
            .get<{ pincode: string; valid: boolean; city: string | null; state: string | null; district: string | null }>(
                `/pincode/${pincode}`,
            )
            .then(r => r.data),

    // Orders
    listOrders: (params?: Record<string, unknown>) =>
        orderClient.get<Paginated<Order>>('/orders', { params }).then(r => r.data),

    getOrder: (id: string) => orderClient.get<Order>(`/orders/${id}`).then(r => r.data),

    checkout: (address_id: string, payment_method: string, product_ids?: string[]) =>
        orderClient.post<Order>('/orders', { address_id, payment_method, ...(product_ids ? { product_ids } : {}) }).then(r => r.data),

    verifyPayment: (orderId: string, data: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
        orderClient.post<Order>(`/orders/${orderId}/verify-payment`, data).then(r => r.data),

    getPaymentConfig: () =>
        orderClient.get<{ razorpay_key_id: string | null; payment_enabled: boolean }>('/payment/config').then(r => r.data),

    updateStatus: (orderId: string, data: object) =>
        orderClient.patch<Order>(`/orders/${orderId}/status`, data).then(r => r.data),

    cancelOrder: (orderId: string, reason: string) =>
        orderClient.post<Order>(`/orders/${orderId}/cancel`, { reason }).then(r => r.data),

    returnOrder: (orderId: string, reason: string) =>
        orderClient.post<Order>(`/orders/${orderId}/return`, { reason }).then(r => r.data),

    approveReturn: (orderId: string, approved: boolean, note?: string) =>
        orderClient.post<Order>(`/orders/${orderId}/approve-return`, { approved, note }).then(r => r.data),

    // Admin analytics
    getDashboardKPIs: () => orderClient.get('/admin/dashboard/kpis').then(r => r.data),
    getAdminKpis: () => orderClient.get('/admin/dashboard/kpis').then(r => r.data),
    getTopProducts: (period: string) =>
        orderClient.get('/admin/dashboard/top-products', { params: { period } }).then(r => r.data),
    getPincodeMap: () => orderClient.get('/admin/dashboard/pincode-map').then(r => r.data),
}
