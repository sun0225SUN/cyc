import { Monoton } from 'next/font/google'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/shared/i18n/navigation'
import { cn } from '@/shared/lib/cn'
import { LogoMark } from './logo-mark'

const brandFont = Monoton({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
})

export async function Brand() {
  const t = await getTranslations('site')

  return (
    <Link
      href='/'
      className='text-foreground pointer-events-auto flex items-center gap-2 rounded-full bg-white/20 px-3 py-2 shadow-lg backdrop-blur-md dark:bg-black/20'
    >
      <LogoMark className='size-10' />
      <span
        className={cn(
          brandFont.className,
          'text-3xl leading-none tracking-wide',
        )}
      >
        {t('name')}
      </span>
    </Link>
  )
}
