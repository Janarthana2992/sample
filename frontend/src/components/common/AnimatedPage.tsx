import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface AnimatedPageProps {
    children: ReactNode
    className?: string
}

const pageVariants = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
}

export function AnimatedPage({ children, className = '' }: AnimatedPageProps) {
    return (
        <motion.div
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className={className}
        >
            {children}
        </motion.div>
    )
}

// Staggered children animation wrapper
export function StaggerContainer({ children, className = '' }: AnimatedPageProps) {
    return (
        <motion.div
            initial="initial"
            animate="animate"
            className={className}
            variants={{
                initial: {},
                animate: { transition: { staggerChildren: 0.06 } },
            }}
        >
            {children}
        </motion.div>
    )
}

export function StaggerItem({ children, className = '' }: AnimatedPageProps) {
    return (
        <motion.div
            className={className}
            variants={{
                initial: { opacity: 0, y: 16 },
                animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
            }}
        >
            {children}
        </motion.div>
    )
}

// Fade in on scroll
export function FadeInView({ children, className = '' }: AnimatedPageProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className={className}
        >
            {children}
        </motion.div>
    )
}
