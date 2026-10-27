import { getLocale, getTranslations } from 'next-intl/server'
import {
  loadActivities,
  loadRideProfiles,
} from '@/entities/activity/index.server'
import { Brand } from '@/shared/ui/logo'
import { firstRideBatchIds, rideIdsNewestFirst } from '../model/ride-batch'
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
  const rideProfiles = await loadRideProfiles(
    firstRideBatchIds(rideIdsNewestFirst(activities)),
  )

  return (
    <HomeDeck
      activities={activities}
      missingData={missingData}
      rideProfiles={rideProfiles}
      locale={locale}
      brand={<Brand />}
    />
  )
}
