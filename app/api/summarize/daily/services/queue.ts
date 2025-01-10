import { RecentFiles } from '@/types/github'
import { QueueKeys } from '@/utils/redis-queue'
import { publishToUpstash } from '@/utils/upstash'

export const queueUrlProcessing = async (urls: string[], keys: QueueKeys) => {
  for (const url of urls) {
    await publishToUpstash('/api/summarize/urls/scrape', { url, keys })
  }
}

export const queueNoteProcessing = async (
  recentFiles: RecentFiles,
  keys: QueueKeys,
) => {
  for (const file of recentFiles.files) {
    await publishToUpstash('/api/notes/summarize', { note: file, keys })
  }
}

export const queueDailySummary = async (keys: QueueKeys) => {
  await publishToUpstash('/api/summarize/daily', keys)
}
