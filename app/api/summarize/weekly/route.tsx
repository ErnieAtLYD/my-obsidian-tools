import { TextBlock } from '@anthropic-ai/sdk/resources/messages.mjs'
import dayjs from 'dayjs'
import timezonePlugin from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { NextRequest } from 'next/server'

import {
  getWeeklySummarySystemPrompt,
  WeeklySummaryFormat,
} from '@/prompts/summarize/weekly-summary-user'
import { RouteMessageMap } from '@/types/upstash'
import { anthropic, extractJson } from '@/utils/ai'
import { createOrUpdateFile, getDailySummaries } from '@/utils/github'
import { publishToUpstash, verifyUpstashSignature } from '@/utils/upstash'
export const dynamic = 'force-dynamic'
export const maxDuration = 300
// export const maxDuration = 60
dayjs.extend(utc)
dayjs.extend(timezonePlugin)

const dayToNumber = (day: string): number => {
  const days = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ]
  return days.indexOf(day.toLowerCase())
}

export async function POST(req: NextRequest) {
  console.log('POST /api/summarize/weekly started')
  
  try {
    const body: RouteMessageMap['/api/summarize/weekly'] =
      await verifyUpstashSignature(req)
    console.log('Request signature verified')
    
    console.log('Fetching daily summaries')
    const dailySummaries = await getDailySummaries(
      process.env.GITHUB_USERNAME!,
      process.env.GITHUB_REPO!,
    )
    console.log(`Found ${dailySummaries.length} daily summaries`)
  const weekly_prompt = getWeeklySummarySystemPrompt({
    dailySummaries,
    weekEndDate: body.weekEndDate,
    weekStartDate: body.weekStartDate,
  })
  console.info('Generated weekly prompt:', { weekly_prompt })

  const response = await anthropic.messages.create({
    max_tokens: 4000,
    model: 'claude-3-5-sonnet-20240620',
    messages: [
      {
        role: 'user',
        content: weekly_prompt,
      },
    ],
  })
  const responseText = (response.content[0] as TextBlock).text
  const parsed = await (async () => {
    try {
      return WeeklySummaryFormat.parse(JSON.parse(responseText))
    } catch (error) {
      console.error('Error parsing response:', error)
      console.info('Response:', { responseText })
      return await extractJson(responseText, WeeklySummaryFormat)
    }
  })()
  const responseContent = `# Weekly Summary for ${body.weekStartDate} - ${body.weekEndDate}\n## Overall Summary\n${parsed.executiveSummary}\n## Strategic Implications\n- ${parsed.strategicInsights.join('\n- ')}\n## Challenges & Opportunities\n### Challenges\n- ${parsed.challengesAndOpportunities.challenges.join('\n- ')}\n### Opportunities\n- ${parsed.challengesAndOpportunities.opportunities.join('\n- ')}\n## Key Developments & Trends\n- ${parsed.keyDevelopmentsAndTrends.join('\n- ')}\n## Long Term Implications\n- ${parsed.longTermImplications.join('\n- ')}\n## Goals for Next Week\n- ${parsed.goalsForNextWeek.join('\n- ')}`
  const filename = `${process.env.WEEKLY_SUMMARY_NAME} ${dayjs().format('YYYY-MM-DD')}${process.env.NODE_ENV === 'development' ? `-DEV` : ''}.md`

  await createOrUpdateFile({
    filename,
    content: responseContent,
    path: process.env.WEEKLY_SUMMARY_FOLDER,
    inbox: true,
  })
  console.info('Weekly summary written to GitHub: ', { filename })
  return new Response('ok', { status: 200 })
}

export async function GET(req: NextRequest) {
  console.log('GET /api/summarize/weekly started')
  console.log('Auth header:', req.headers.get('Authorization')?.slice(0,10) + '...')
  console.log('CRON_SECRET matches:', req.headers.get('Authorization') === `Bearer ${process.env.CRON_SECRET}`)
  console.log('NODE_ENV:', process.env.NODE_ENV)

  if (
    req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}` &&
    process.env.NODE_ENV !== 'development'
  ) {
    console.log('Unauthorized request rejected')
    return new Response('Unauthorized', { status: 401 })
  }

  // Check required env vars
  const requiredEnvVars = [
    'YOUR_NAME',
    'OPENAI_API_KEY',
    'GITHUB_USERNAME',
    'GITHUB_REPO',
    'WEEKLY_SUMMARY_NAME',
    'WEEKLY_SUMMARY_FOLDER',
    'QSTASH_URL',
    'QSTASH_TOKEN'
  ]
  
  const missingVars = requiredEnvVars.filter(v => !process.env[v])
  if (missingVars.length > 0) {
    console.log('Missing required environment variables:', missingVars)
    return new Response(`Missing environment variables: ${missingVars.join(', ')}`, { status: 200 })
  }

  console.log('All environment variables present')
  const now = dayjs().tz('UTC')
  const weekStartDate = now.subtract(6, 'days').format('MMMM D, YYYY')
  const weekEndDate = now.format('MMMM D, YYYY')
  
  await publishToUpstash('/api/summarize/weekly', {
    weekEndDate,
    weekStartDate,
  })
  return new Response('Weekly summary executed', { status: 200 })
}
