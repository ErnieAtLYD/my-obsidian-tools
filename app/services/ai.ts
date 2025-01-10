import { TextBlock } from '@anthropic-ai/sdk/resources/messages.mjs'
import { anthropic, openai } from '@/utils/ai'

export class AiService {
  static async generateDailySummary(prompt: string) {
    const response = await anthropic.messages.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 4000,
    })
    
    const content = response.content[0]
    if (!('text' in content)) {
      throw new Error('Unexpected response format')
    }
    return (content as TextBlock).text
  }

  static async filterUrls(urls: string[]) {
    return openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You will be given an array of URLs. Your job is to return the urls that represent valuable content, not the ones that are generic (like google.com, yahoo.com, nytimes.com, cnn.com, etc.), redirects, generic, shortened, and otherwise not useful. Return urls in this JSON format: {usefulUrls: string[]}'
        },
        {
          role: 'user',
          content: `URLs: ${JSON.stringify(urls)}\nUseful URLs:`
        }
      ],
      response_format: { type: 'json_object' }
    })
  }

  static async summarizeNote(filename: string, body: string) {
    return openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'user',
          content: `Please summarize this note:\nFilename: ${filename}\nContent: ${body}`
        }
      ]
    })
  }
}
