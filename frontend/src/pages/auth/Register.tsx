import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { authService } from '../../services/auth'
import { useAuthStore } from '../../store/authStore'

interface FormData {
    email: string
    password: string
    full_name: string
    phone?: string
}

export default function Register() {
    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>()
    const { setTokens, setUser } = useAuthStore()
    const navigate = useNavigate()

    const onSubmit = async (data: FormData) => {
        try {
            await authService.register(data)
            const tokens = await authService.login(data.email, data.password)
            setTokens(tokens.access_token, tokens.refresh_token)
            const user = await authService.me()
            setUser(user)
            toast.success('Account created successfully!')
            navigate('/')
        } catch (err: any) {
            toast.error(err.response?.data?.detail || 'Registration failed')
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="w-full max-w-md">
                <div className="card">
                    <div className="text-center mb-6">
                        <h1 className="text-2xl font-bold text-gray-900">Create account</h1>
                        <p className="text-gray-500 text-sm mt-1">Join ShopHere today</p>
                    </div>

                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                        <div>
                            <label className="label">Full Name</label>
                            <input className="input" {...register('full_name', { required: 'Name is required', minLength: { value: 2, message: 'Min 2 characters' } })} />
                            {errors.full_name && <p className="text-red-500 text-xs mt-1">{errors.full_name.message}</p>}
                        </div>

                        <div>
                            <label className="label">Email</label>
                            <input type="email" className="input" {...register('email', { required: 'Email is required' })} />
                            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
                        </div>

                        <div>
                            <label className="label">Phone (optional)</label>
                            <input type="tel" className="input" {...register('phone')} />
                        </div>

                        <div>
                            <label className="label">Password</label>
                            <input
                                type="password"
                                className="input"
                                {...register('password', {
                                    required: 'Password is required',
                                    minLength: { value: 8, message: 'Min 8 characters' },
                                    validate: {
                                        hasUpper: v => /[A-Z]/.test(v) || 'Must contain an uppercase letter',
                                        hasDigit: v => /\d/.test(v) || 'Must contain a number',
                                    },
                                })}
                            />
                            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
                        </div>

                        <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
                            {isSubmitting ? 'Creating account...' : 'Create Account'}
                        </button>
                    </form>

                    <p className="text-center text-sm text-gray-500 mt-6">
                        Already have an account?{' '}
                        <Link to="/login" className="text-blue-600 hover:underline font-medium">Sign in</Link>
                    </p>
                </div>
            </div>
        </div>
    )
}
