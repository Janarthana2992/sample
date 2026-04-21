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
    full_name: string
    phone?: string
}

export default function Register() {
    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>()
    const { setTokens, setUser } = useAuthStore()
    const navigate = useNavigate()

    const [step, setStep] = useState<'form' | 'otp'>('form')
    const [captcha, setCaptcha] = useState<CaptchaChallenge | null>(null)
    const [captchaAnswer, setCaptchaAnswer] = useState('')
    const [captchaRefresh, setCaptchaRefresh] = useState(0)
    const [showPassword, setShowPassword] = useState(false)

    const [otp, setOtp] = useState('')
    const [pendingEmail, setPendingEmail] = useState('')
    const [devOtp, setDevOtp] = useState<string | null>(null)
    const [verifying, setVerifying] = useState(false)

    const onSubmit = async (data: FormData) => {
        if (!captcha || !captchaAnswer.trim()) {
            toast.error('Please solve the captcha')
            return
        }
        try {
            const res = await authService.register({
                ...data,
                captcha_id: captcha.captcha_id,
                captcha_answer: captchaAnswer.trim(),
            })
            setPendingEmail(res.email)
            setDevOtp(res.dev_otp || null)
            setStep('otp')
            toast.success('Verification code sent to your email')
        } catch (err: any) {
            toast.error(err.response?.data?.detail || 'Registration failed')
            setCaptchaRefresh(n => n + 1)
        }
    }

    const verifyOtp = async () => {
        if (!otp.trim()) {
            toast.error('Enter the OTP')
            return
        }
        setVerifying(true)
        try {
            const tokens = await authService.verifyRegistration(pendingEmail, otp.trim())
            setTokens(tokens.access_token, tokens.refresh_token)
            const user = await authService.me()
            setUser(user)
            toast.success('Account verified — welcome!')
            navigate('/')
        } catch (err: any) {
            toast.error(err.response?.data?.detail || 'Verification failed')
        } finally {
            setVerifying(false)
        }
    }

    const resend = async () => {
        try {
            const res = await authService.resendRegisterOtp(pendingEmail)
            setDevOtp(res.dev_otp || null)
            toast.success('A new code has been sent')
        } catch (err: any) {
            toast.error(err.response?.data?.detail || 'Failed to resend OTP')
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
            <div className="w-full max-w-md">
                <div className="card">
                    {step === 'form' ? (
                        <>
                            <div className="text-center mb-6">
                                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Create account</h1>
                                <p className="text-gray-500 text-sm mt-1">We'll email you a code to verify your address</p>
                            </div>

                            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                                <div>
                                    <label className="label">Full Name</label>
                                    <input
                                        className="input"
                                        autoComplete="name"
                                        {...register('full_name', {
                                            required: 'Name is required',
                                            minLength: { value: 2, message: 'Min 2 characters' },
                                            pattern: {
                                                value: /^[A-Za-z][A-Za-z .'\-]{1,254}$/,
                                                message: "Only letters, spaces, . - ' are allowed",
                                            },
                                        })}
                                    />
                                    {errors.full_name && <p className="text-red-500 text-xs mt-1">{errors.full_name.message}</p>}
                                </div>

                                <div>
                                    <label className="label">Email</label>
                                    <input
                                        type="email"
                                        className="input"
                                        autoComplete="email"
                                        {...register('email', {
                                            required: 'Email is required',
                                            pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email' },
                                        })}
                                    />
                                    {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
                                </div>

                                <div>
                                    <label className="label">Phone (optional)</label>
                                    <input
                                        type="tel"
                                        inputMode="numeric"
                                        maxLength={10}
                                        className="input"
                                        autoComplete="tel-national"
                                        {...register('phone', {
                                            pattern: {
                                                value: /^$|^[6-9]\d{9}$/,
                                                message: 'Enter a 10-digit Indian mobile number',
                                            },
                                        })}
                                    />
                                    {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
                                </div>

                                <div>
                                    <label className="label">Password</label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            className="input pr-10"
                                            autoComplete="new-password"
                                            {...register('password', {
                                                required: 'Password is required',
                                                minLength: { value: 8, message: 'Min 8 characters' },
                                                validate: {
                                                    hasUpper: v => /[A-Z]/.test(v) || 'Must contain an uppercase letter',
                                                    hasDigit: v => /\d/.test(v) || 'Must contain a number',
                                                },
                                            })}
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

                                <CaptchaWidget
                                    value={captchaAnswer}
                                    onChange={setCaptchaAnswer}
                                    onChallenge={setCaptcha}
                                    refreshToken={captchaRefresh}
                                />

                                <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
                                    {isSubmitting ? 'Sending code…' : 'Continue'}
                                </button>
                            </form>
                        </>
                    ) : (
                        <>
                            <div className="text-center mb-6">
                                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Verify your email</h1>
                                <p className="text-gray-500 text-sm mt-1">
                                    Enter the 6-digit code we sent to <span className="font-medium">{pendingEmail}</span>
                                </p>
                            </div>

                            {devOtp && (
                                <p className="text-xs mb-3 px-3 py-2 rounded bg-yellow-50 border border-yellow-200 text-yellow-800">
                                    Dev mode: use code <span className="font-mono font-bold">{devOtp}</span>
                                </p>
                            )}

                            <div className="space-y-4">
                                <div>
                                    <label className="label">Verification code</label>
                                    <input
                                        className="input tracking-widest text-center text-lg font-mono"
                                        inputMode="numeric"
                                        maxLength={6}
                                        value={otp}
                                        onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                                        autoFocus
                                    />
                                </div>

                                <button onClick={verifyOtp} disabled={verifying} className="btn-primary w-full">
                                    {verifying ? 'Verifying…' : 'Verify & Create Account'}
                                </button>

                                <div className="flex items-center justify-between text-sm">
                                    <button type="button" onClick={() => setStep('form')} className="text-gray-500 hover:underline">
                                        ← Change details
                                    </button>
                                    <button type="button" onClick={resend} className="text-blue-600 hover:underline">
                                        Resend code
                                    </button>
                                </div>
                            </div>
                        </>
                    )}

                    <p className="text-center text-sm text-gray-500 mt-6">
                        Already have an account?{' '}
                        <Link to="/login" className="text-blue-600 hover:underline font-medium">Sign in</Link>
                    </p>
                </div>
            </div>
        </div>
    )
}
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { motion } from 'framer-motion'
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
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Create account</h1>
                        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Join ShopHere today</p>
                    </div>

                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                        <div>
                            <label className="label">Full Name</label>
                            <input className="input" placeholder="John Doe" {...register('full_name', { required: 'Name is required', minLength: { value: 2, message: 'Min 2 characters' } })} />
                            {errors.full_name && <p className="text-red-500 text-xs mt-1.5">{errors.full_name.message}</p>}
                        </div>

                        <div>
                            <label className="label">Email</label>
                            <input type="email" className="input" placeholder="you@example.com" {...register('email', { required: 'Email is required' })} />
                            {errors.email && <p className="text-red-500 text-xs mt-1.5">{errors.email.message}</p>}
                        </div>

                        <div>
                            <label className="label">Phone (optional)</label>
                            <input type="tel" className="input" placeholder="+91 98765 43210" {...register('phone')} />
                        </div>

                        <div>
                            <label className="label">Password</label>
                            <input
                                type="password"
                                className="input"
                                placeholder="••••••••"
                                {...register('password', {
                                    required: 'Password is required',
                                    minLength: { value: 8, message: 'Min 8 characters' },
                                    validate: {
                                        hasUpper: v => /[A-Z]/.test(v) || 'Must contain an uppercase letter',
                                        hasDigit: v => /\d/.test(v) || 'Must contain a number',
                                    },
                                })}
                            />
                            {errors.password && <p className="text-red-500 text-xs mt-1.5">{errors.password.message}</p>}
                        </div>

                        <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
                            {isSubmitting ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx={12} cy={12} r={10} stroke="currentColor" strokeWidth={4}/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                                    Creating account...
                                </span>
                            ) : 'Create Account'}
                        </button>
                    </form>

                    <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-8">
                        Already have an account?{' '}
                        <Link to="/login" className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-semibold transition-colors">Sign in</Link>
                    </p>
                </div>
            </motion.div>
        </div>
    )
}
