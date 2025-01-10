import getUrls from 'get-urls'
import { z } from 'zod'

import { openai } from '@/utils/ai'
import { redis } from '@/utils/redis'

interface RecentFiles {
  files: { body: string }[]
  diffs: { diff: string }[]
}

interface QueueKeys {
  processedUrlsKey: string
}

const UsefulUrlsSchema = z.object({
  usefulUrls: z.array(z.string()),
})

export async function processNewUrls(
  recentFiles: RecentFiles,
  keys: QueueKeys,
) {
  const urls = extractUrls(recentFiles)
  const processedUrls = await redis.smembers(keys.processedUrlsKey)
  const newUrls = urls.filter((url) => !processedUrls.includes(url))

  if (newUrls.length === 0) {
    return []
  }

  const usefulUrls = await filterUsefulUrls(newUrls)
  await redis.sadd(keys.processedUrlsKey, usefulUrls)

  return usefulUrls
}

function extractUrls(recentFiles: RecentFiles): string[] {
  const urls: string[] = []

  recentFiles.files.forEach((file) => {
    getUrls(file.body).forEach((url) => urls.push(url))
  })

  recentFiles.diffs.forEach((diff) => {
    getUrls(diff.diff).forEach((url) => urls.push(url))
  })

  return Array.from(new Set(urls))
}

async function filterUsefulUrls(urls: string[]): Promise<string[]> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          'You will be given an array of URLs. Your job is to return the urls that represent valuable content, not the ones that are generic (like google.com, yahoo.com, nytimes.com, cnn.com, etc.), redirects, generic, shortened, and otherwise not useful. Return urls in this JSON format: {usefulUrls: string[]}',
      },
      {
        role: 'user',
        content: `URLs: ${JSON.stringify(urls)}}\nUseful URLs:`,
      },
    ],
    response_format: { type: 'json_object' },
  })

  const content = response.choices[0].message.content
  if (!content) {
    return []
  }

  try {
    const parsed = UsefulUrlsSchema.parse(JSON.parse(content))
    return parsed.usefulUrls
  } catch (error) {
    console.error('Error parsing response:', error)
    return []
  }
}

// Helper functions...
