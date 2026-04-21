import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { authService, type CaptchaChallenge } from '../../services/auth'
import { useAuthStore } from '../../store/authStore'
import { CaptchaWidget } from '../../components/common/CaptchaWidget'

interface FormData {
    email: string
    password: string
}

export default function Login() {
    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>()
    const { setTokens, setUser } = useAuthStore()
    const navigate = useNavigate()

    const [showPassword, setShowPassword] = useState(false)
    const [captchaRequired, setCaptchaRequired] = useState(false)
    const [captcha, setCaptcha] = useState<CaptchaChallenge | null>(null)
    const [captchaAnswer, setCaptchaAnswer] = useState('')
    const [captchaRefresh, setCaptchaRefresh] = useState(0)

    const onSubmit = async (data: FormData) => {
        try {
            const tokens = await authService.login(
                data.email,
                data.password,
                captchaRequired && captcha && captchaAnswer
                    ? { captcha_id: captcha.captcha_id, captcha_answer: captchaAnswer.trim() }
                    : undefined,
            )
            setTokens(tokens.access_token, tokens.refresh_token)
            const user = await authService.me()
            setUser(user)
            if (user.role === 'admin') navigate('/admin')
            else if (user.role === 'staff') navigate('/staff')
            else navigate('/')
        } catch (err: any) {
            toast.error(err.response?.data?.detail || 'Login failed')
            // Backend signals that captcha is required for subsequent tries.
            if (err.response?.headers?.['x-captcha-required'] === '1') {
                setCaptchaRequired(true)
                setCaptchaRefresh(n => n + 1)
                setCaptchaAnswer('')
            } else if (captchaRequired) {
                setCaptchaRefresh(n => n + 1)
                setCaptchaAnswer('')
            }
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
            <div className="w-full max-w-md">
                <div className="card">
                    <div className="text-center mb-6">
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Welcome back</h1>
                        <p className="text-gray-500 text-sm mt-1">Sign in to your account</p>
                    </div>

                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                        <div>
                            <label className="label">Email</label>
                            <input
                                type="email"
                                className="input"
                                autoComplete="email"
                                {...register('email', { required: 'Email is required' })}
                            />
                            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
                        </div>

                        <div>
                            <label className="label">Password</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    className="input pr-10"
                                    autoComplete="current-password"
                                    {...register('password', { required: 'Password is required' })}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(v => !v)}
                                    className="absolute inset-y-0 right-0 px-3 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    tabIndex={-1}
                                >
                                    {showPassword ? '🙈' : '👁'}
                                </button>
                            </div>
                            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
                        </div>

                        {captchaRequired && (
                            <CaptchaWidget
                                value={captchaAnswer}
                                onChange={setCaptchaAnswer}
                                onChallenge={setCaptcha}
                                refreshToken={captchaRefresh}
                            />
                        )}

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
