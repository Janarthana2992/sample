import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { authService } from '../../services/auth'
import { useAuthStore } from '../../store/authStore'

interface FormData {
    email: string
    password: string
}

export default function Login() {
    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>()
    const { setTokens, setUser } = useAuthStore()
    const navigate = useNavigate()

    const onSubmit = async (data: FormData) => {
        try {
            const tokens = await authService.login(data.email, data.password)
            setTokens(tokens.access_token, tokens.refresh_token)
            const user = await authService.me()
            setUser(user)
            if (user.role === 'admin') navigate('/admin')
            else if (user.role === 'staff') navigate('/staff')
            else navigate('/')
        } catch (err: any) {
            toast.error(err.response?.data?.detail || 'Login failed')
        }
    }

    return (
        <div className="min-h-[80vh] flex items-center justify-center">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="w-full max-w-md"
            >
                <div className="card p-8">
                    <div className="text-center mb-8">
                        <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-glow">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Welcome back</h1>
                        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Sign in to your account</p>
                    </div>

                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                        <div>
                            <label className="label">Email</label>
                            <input
                                type="email"
                                className="input"
                                placeholder="you@example.com"
                                {...register('email', { required: 'Email is required' })}
                            />
                            {errors.email && <p className="text-red-500 text-xs mt-1.5">{errors.email.message}</p>}
                        </div>

                        <div>
                            <label className="label">Password</label>
                            <input
                                type="password"
                                className="input"
                                placeholder="••••••••"
                                {...register('password', { required: 'Password is required' })}
                            />
                            {errors.password && <p className="text-red-500 text-xs mt-1.5">{errors.password.message}</p>}
                        </div>

                        <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
                            {isSubmitting ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx={12} cy={12} r={10} stroke="currentColor" strokeWidth={4}/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                                    Signing in...
                                </span>
                            ) : 'Sign In'}
                        </button>
                    </form>

                    <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-8">
                        Don't have an account?{' '}
                        <Link to="/register" className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-semibold transition-colors">Sign up</Link>
                    </p>
                </div>
            </motion.div>
        </div>
    )
}
