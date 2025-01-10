import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function generateSummary(content: string) {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful assistant that summarizes content concisely.',
        },
        {
          role: 'user',
          content: `Please summarize the following content: ${content}`,
        },
      ],
    })

    return completion.choices[0]?.message?.content || ''
  } catch (error) {
    console.error('Error generating summary:', error)
    throw error
  }
}
