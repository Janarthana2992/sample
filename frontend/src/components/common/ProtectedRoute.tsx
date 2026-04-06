import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

type Role = 'admin' | 'staff' | 'customer'

interface Props {
    children?: React.ReactNode
    /** Accepted roles. If omitted, any authenticated user is allowed. */
    roles?: Role | Role[]
    /** Where to redirect if the role check fails. Defaults to "/unauthorized". */
    redirectTo?: string
    /** Legacy single-role prop (kept for backward compat) */
    role?: Role | Role[]
}

export function ProtectedRoute({ children, roles, role, redirectTo = '/unauthorized' }: Props) {
    const { isAuthenticated, user } = useAuthStore()
    const location = useLocation()

    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />
    }

    const allowedRoles = roles ?? role
    if (allowedRoles) {
        const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]
        if (!user || !allowed.includes(user.role as Role)) {
            return <Navigate to={redirectTo} replace />
        }
    }

    return <>{children ?? <Outlet />}</>
}
