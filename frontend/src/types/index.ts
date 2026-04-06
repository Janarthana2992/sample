// ─── Auth ────────────────────────────────────────────────────
export interface User {
    user_id: string
    email: string
    full_name: string
    phone?: string
    role: 'admin' | 'staff' | 'customer'
    is_active: boolean
    created_at: string
}

export interface TokenResponse {
    access_token: string
    refresh_token: string
    token_type: string
}

export interface StaffPermission {
    permission_id: string
    module: string
    granted_at: string
}

export interface StaffUser extends User {
    permissions: StaffPermission[]
}

// ─── Products ───────────────────────────────────────────────
export interface ProductImage {
    image_id: string
    url: string
    sort_order: number
}

export interface Product {
    product_id: string
    sku: string
    name: string
    description: string
    mrp: number
    selling_price: number
    stock_quantity: number
    stock_status: 'in_stock' | 'low_stock' | 'out_of_stock'
    tags?: string[]
    is_active: boolean
    is_featured: boolean
    is_promoted: boolean
    promotion_priority: number
    promotion_badge?: string
    sales_count: number
    images: ProductImage[]
    created_at: string
}

export interface Category {
    category_id: string
    name: string
    slug: string
    parent_id?: string
    is_active: boolean
}

export interface Deal {
    deal_id: string
    name: string
    deal_type: string
    applies_to: string
    discount_value?: number
    min_cart_value?: number
    start_datetime: string
    end_datetime: string
    max_uses?: number
    current_uses: number
    is_active: boolean
    staff_visible: boolean
    created_at: string
    category_ids?: string[]
    product_ids?: string[]
}

export interface Event {
    event_id: string
    title: string
    description: string
    image_url?: string
    register_url: string
    event_date?: string
    is_active: boolean
    created_at: string
}

export interface Review {
    review_id: string
    product_id: string
    user_id: string
    order_id: string
    rating: number
    review_text?: string
    is_flagged: boolean
    created_at: string
    updated_at?: string
    reply?: ReviewReply
}

export interface ReviewReply {
    reply_id: string
    reply_text: string
    is_retracted: boolean
    created_at: string
    updated_at?: string
}

// ─── Product Variants ────────────────────────────────────────
export interface ProductVariant {
    variant_id: string
    product_id: string
    sku: string
    color?: string
    size?: string
    stock_quantity: number
    stock_status: 'in_stock' | 'low_stock' | 'out_of_stock'
    price_adjustment: number
    is_active: boolean
    created_at: string
    updated_at?: string
}

// ─── Cart ────────────────────────────────────────────────────
export interface CartLine {
    product_id: string
    product_name: string
    quantity: number
    unit_price: number
    current_price: number
    price_stale: boolean
    image_url?: string
    line_total: number
}

export interface Cart {
    user_id: string
    items: CartLine[]
    subtotal: number
    item_count: number
}

// ─── Orders ─────────────────────────────────────────────────
export interface Address {
    address_id: string
    full_name: string
    phone: string
    address_line1: string
    address_line2?: string
    city: string
    state: string
    pincode: string
    country: string
    is_default: boolean
}

export interface OrderItem {
    order_item_id: string
    product_id: string
    product_name?: string
    quantity: number
    unit_price: number
}

export interface Order {
    order_id: string
    user_id: string
    total_price: number
    deal_discount: number
    status: string
    payment_method?: string
    payment_status: string
    tracking_number?: string
    estimated_delivery?: string
    items: OrderItem[]
    shipping_address?: Address
    status_history: StatusHistory[]
    created_at: string
}

export interface StatusHistory {
    from_status?: string
    to_status: string
    changed_at: string
    note?: string
}

// ─── Pagination ──────────────────────────────────────────────
export interface Paginated<T> {
    items: T[]
    total: number
    page: number
    size: number
}

// ─── Search ─────────────────────────────────────────────────
export interface SearchHit {
    product_id: string
    name: string
    sku: string
    mrp: number
    selling_price: number
    stock_status: string
    rating?: number
    image_url?: string
    score: number
}

export interface SearchResponse {
    total: number
    page: number
    size: number
    hits: SearchHit[]
    suggestion?: string
}
