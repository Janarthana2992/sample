import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { LoadingSpinner } from './components/common/LoadingSpinner'
import { ProtectedRoute } from './components/common/ProtectedRoute'
import { CustomerLayout } from './components/layout/CustomerLayout'
import { AdminLayout } from './components/layout/AdminLayout'
import { StaffLayout } from './components/layout/StaffLayout'

// Auth
const Login = lazy(() => import('./pages/auth/Login'))
const Register = lazy(() => import('./pages/auth/Register'))

// Customer
const Home = lazy(() => import('./pages/customer/Home'))
const ProductList = lazy(() => import('./pages/customer/ProductList'))
const ProductDetail = lazy(() => import('./pages/customer/ProductDetail'))
const Cart = lazy(() => import('./pages/customer/Cart'))
const Checkout = lazy(() => import('./pages/customer/Checkout'))
const CustomerOrders = lazy(() => import('./pages/customer/Orders'))
const CustomerOrderDetail = lazy(() => import('./pages/customer/OrderDetail'))
const CustomerEvents = lazy(() => import('./pages/customer/Events'))
const CustomerWishlist = lazy(() => import('./pages/customer/Wishlist'))
const CustomerAddresses = lazy(() => import('./pages/customer/Addresses'))
const CustomerSupport = lazy(() => import('./pages/customer/Support'))
const CustomerHelpCenter = lazy(() => import('./pages/customer/HelpCenter'))
const CustomerShippingInfo = lazy(() => import('./pages/customer/ShippingInfo'))
const CustomerReturns = lazy(() => import('./pages/customer/Returns'))

// Admin
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'))
const AdminProducts = lazy(() => import('./pages/admin/Products'))
const AdminCategories = lazy(() => import('./pages/admin/Categories'))
const AdminAddProduct = lazy(() => import('./pages/admin/AddProduct'))
const AdminEditProduct = lazy(() => import('./pages/admin/EditProduct'))
const AdminOrders = lazy(() => import('./pages/admin/Orders'))
const AdminReviews = lazy(() => import('./pages/admin/Reviews'))
const AdminDeals = lazy(() => import('./pages/admin/Deals'))
const AdminEvents = lazy(() => import('./pages/admin/Events'))
const AdminStaff = lazy(() => import('./pages/admin/Staff'))
const AdminHandoff = lazy(() => import('./pages/admin/Handoff'))
const AdminReturnRequests = lazy(() => import('./pages/admin/ReturnRequests'))

// Staff
const StaffDashboard = lazy(() => import('./pages/staff/Dashboard'))
const StaffOrders = lazy(() => import('./pages/staff/Orders'))
const StaffReviews = lazy(() => import('./pages/staff/Reviews'))
const StaffStock = lazy(() => import('./pages/staff/Stock'))

function NotFound() {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center">
            <div className="text-center">
                <p className="text-8xl font-extrabold text-gray-200 dark:text-gray-800">404</p>
                <p className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">Page not found</p>
                <p className="mt-2 text-gray-500 dark:text-gray-400">The page you're looking for doesn't exist.</p>
                <a href="/" className="mt-6 inline-block btn-primary">Back to Home</a>
            </div>
        </div>
    )
}

function Unauthorized() {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center">
            <div className="text-center">
                <p className="text-8xl font-extrabold text-gray-200 dark:text-gray-800">403</p>
                <p className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">Access Denied</p>
                <p className="mt-2 text-gray-500 dark:text-gray-400">You don't have permission to access this page.</p>
                <a href="/" className="mt-6 inline-block btn-primary">Back to Home</a>
            </div>
        </div>
    )
}

export default function App() {
    return (
        <BrowserRouter>
            <Toaster position="top-right" toastOptions={{ duration: 3500 }} />
            <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><LoadingSpinner /></div>}>
                <Routes>
                    {/* Public / Customer routes */}
                    <Route element={<CustomerLayout />}>
                        <Route path="/" element={<Home />} />
                        <Route path="/products" element={<ProductList />} />
                        <Route path="/products/:id" element={<ProductDetail />} />
                        <Route path="/events" element={<CustomerEvents />} />
                        <Route path="/cart" element={<Cart />} />
                        <Route path="/wishlist" element={<CustomerWishlist />} />
                        <Route path="/login" element={<Login />} />
                        <Route path="/register" element={<Register />} />
                        <Route path="/support" element={<CustomerSupport />} />
                        <Route path="/help" element={<CustomerHelpCenter />} />
                        <Route path="/shipping" element={<CustomerShippingInfo />} />
                        <Route path="/returns" element={<CustomerReturns />} />

                        {/* Authenticated customer routes */}
                        <Route element={<ProtectedRoute roles={['customer', 'admin', 'staff']} />}>
                            <Route path="/checkout" element={<Checkout />} />
                            <Route path="/orders" element={<CustomerOrders />} />
                            <Route path="/orders/:orderId" element={<CustomerOrderDetail />} />
                            <Route path="/addresses" element={<CustomerAddresses />} />
                        </Route>
                    </Route>

                    {/* Admin routes */}
                    <Route element={<ProtectedRoute roles={['admin']} redirectTo="/unauthorized" />}>
                        <Route element={<AdminLayout />}>
                            <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
                            <Route path="/admin/dashboard" element={<AdminDashboard />} />
                            <Route path="/admin/products" element={<AdminProducts />} />
                            <Route path="/admin/products/add" element={<AdminAddProduct />} />
                            <Route path="/admin/products/:id/edit" element={<AdminEditProduct />} />
                            <Route path="/admin/categories" element={<AdminCategories />} />
                            <Route path="/admin/orders" element={<AdminOrders />} />
                            <Route path="/admin/reviews" element={<AdminReviews />} />
                            <Route path="/admin/deals" element={<AdminDeals />} />
                            <Route path="/admin/events" element={<AdminEvents />} />
                            <Route path="/admin/staff" element={<AdminStaff />} />
                            <Route path="/admin/handoff" element={<AdminHandoff />} />
                            <Route path="/admin/returns" element={<AdminReturnRequests />} />
                        </Route>
                    </Route>

                    {/* Staff routes */}
                    <Route element={<ProtectedRoute roles={['admin', 'staff']} redirectTo="/unauthorized" />}>
                        <Route element={<StaffLayout />}>
                            <Route path="/staff" element={<Navigate to="/staff/dashboard" replace />} />
                            <Route path="/staff/dashboard" element={<StaffDashboard />} />
                            <Route path="/staff/orders" element={<StaffOrders />} />
                            <Route path="/staff/reviews" element={<StaffReviews />} />
                            <Route path="/staff/stock" element={<StaffStock />} />
                            <Route path="/staff/handoff" element={<AdminHandoff />} />
                        </Route>
                    </Route>

                    {/* Misc */}
                    <Route path="/unauthorized" element={<Unauthorized />} />
                    <Route path="*" element={<NotFound />} />
                </Routes>
            </Suspense>
        </BrowserRouter>
    )
}
