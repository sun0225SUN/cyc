import { getLocale, getTranslations } from 'next-intl/server'
import {
  loadActivities,
  loadRideSpeedProfiles,
} from '@/entities/activity/index.server'
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
  const [activities, speedProfiles] = await Promise.all([
    loadActivities(),
    loadRideSpeedProfiles(),
  ])

  return (
    <HomeDeck
      activities={activities}
      speedProfiles={speedProfiles}
      locale={locale}
      brand={<Brand />}
    />
  )
}
