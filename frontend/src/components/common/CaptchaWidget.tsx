import { useCallback, useEffect, useState } from 'react'
import { authService, type CaptchaChallenge } from '../../services/auth'

interface Props {
    value: string
    onChange: (answer: string) => void
    onChallenge: (challenge: CaptchaChallenge) => void
    /** Bump this number to force a refresh from the parent after a failure. */
    refreshToken?: number
}

/** Simple math captcha widget. Fetches a fresh challenge from the backend. */
export function CaptchaWidget({ value, onChange, onChallenge, refreshToken = 0 }: Props) {
    const [challenge, setChallenge] = useState<CaptchaChallenge | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const refresh = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const c = await authService.getCaptcha()
            setChallenge(c)
            onChallenge(c)
            onChange('')
        } catch {
            setError('Could not load captcha — please retry.')
        } finally {
            setLoading(false)
        }
    }, [onChallenge, onChange])

    useEffect(() => {
        refresh()
    }, [refresh, refreshToken])

    return (
        <div>
            <label className="label">Captcha</label>
            <div className="flex items-center gap-2">
                <div className="px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm font-mono min-w-[8rem] text-center select-none">
                    {loading ? '…' : challenge?.question || '—'}
                </div>
                <input
                    className="input flex-1"
                    inputMode="numeric"
                    maxLength={3}
                    placeholder="Answer"
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    autoComplete="off"
                />
                <button
                    type="button"
                    className="text-sm text-blue-600 hover:underline"
                    onClick={refresh}
                    title="Get a new captcha"
                >
                    ↻
                </button>
            </div>
            {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
        </div>
    )
}
