import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
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
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="w-full max-w-md">
                <div className="card">
                    <div className="text-center mb-6">
                        <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
                        <p className="text-gray-500 text-sm mt-1">Sign in to your account</p>
                    </div>

                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                        <div>
                            <label className="label">Email</label>
                            <input
                                type="email"
                                className="input"
                                {...register('email', { required: 'Email is required' })}
                            />
                            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
                        </div>

                        <div>
                            <label className="label">Password</label>
                            <input
                                type="password"
                                className="input"
                                {...register('password', { required: 'Password is required' })}
                            />
                            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
                        </div>

                        <div className="text-right">
                            <Link to="/forgot-password" className="text-sm text-blue-600 hover:underline">
                                Forgot password?
                            </Link>
                        </div>

                        <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
                            {isSubmitting ? 'Signing in...' : 'Sign In'}
                        </button>
                    </form>

                    <p className="text-center text-sm text-gray-500 mt-6">
                        Don't have an account?{' '}
                        <Link to="/register" className="text-blue-600 hover:underline font-medium">Sign up</Link>
                    </p>
                </div>
            </div>
        </div>
    )
}
