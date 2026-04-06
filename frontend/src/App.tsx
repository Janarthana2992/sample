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

// Staff
const StaffDashboard = lazy(() => import('./pages/staff/Dashboard'))
const StaffOrders = lazy(() => import('./pages/staff/Orders'))
const StaffReviews = lazy(() => import('./pages/staff/Reviews'))
const StaffStock = lazy(() => import('./pages/staff/Stock'))

function NotFound() {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center text-gray-500">
            <p className="text-6xl font-bold">404</p>
            <p className="mt-2 text-lg">Page not found</p>
            <a href="/" className="mt-4 text-blue-600 hover:underline">Back to Home</a>
        </div>
    )
}

function Unauthorized() {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center text-gray-500">
            <p className="text-6xl font-bold">403</p>
            <p className="mt-2 text-lg">You don't have permission to access this page</p>
            <a href="/" className="mt-4 text-blue-600 hover:underline">Back to Home</a>
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
                        <Route path="/login" element={<Login />} />
                        <Route path="/register" element={<Register />} />

                        {/* Authenticated customer routes */}
                        <Route element={<ProtectedRoute roles={['customer', 'admin', 'staff']} />}>
                            <Route path="/checkout" element={<Checkout />} />
                            <Route path="/orders" element={<CustomerOrders />} />
                            <Route path="/orders/:orderId" element={<CustomerOrderDetail />} />
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
