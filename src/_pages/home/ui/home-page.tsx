import { getLocale, getTranslations } from 'next-intl/server'
import { loadActivities } from '@/entities/activity/index.server'
import { mapboxToken } from '@/shared/config/mapbox'
import { Brand } from '@/shared/ui/logo'
import { RideMap } from '@/widgets/ride-map'

export async function generateMetadata() {
  const t = await getTranslations('site')
  return { title: t('name') }
}

export async function HomePage() {
  const locale = await getLocale()
  const activities = await loadActivities()

  return (
    <main className='relative h-svh'>
      <RideMap activities={activities} locale={locale} token={mapboxToken()} />
      <div className='pointer-events-none absolute top-4 left-4 z-10'>
        <Brand />
      </div>
    </main>
  )
}
