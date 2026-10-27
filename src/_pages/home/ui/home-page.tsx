import { getLocale, getTranslations } from 'next-intl/server'
import { loadActivities } from '@/entities/activity/index.server'
import { Brand } from '@/shared/ui/logo'
import { HomeDeck } from './home-deck'

export async function generateMetadata() {
  const t = await getTranslations('site')
  return {
    title: t('title'),
    description: t('description'),
  }
}

export async function HomePage() {
  const locale = await getLocale()
  const { activities, missingData } = await loadActivities()

  return (
    <HomeDeck
      activities={activities}
      missingData={missingData}
      locale={locale}
      brand={<Brand />}
    />
  )
}
