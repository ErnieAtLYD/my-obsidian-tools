// Generic type for the item to be processed
export type QueueItem<T> = T

// Generic type for the processed result
export type ProcessedResult<R> = {
  result: R | null
  skipItem: boolean
}

export type QueueKeys = {
  queueKey: string
  notesKey: string
  urlsKey: string
  processedUrlsKey: string
  date: string
}

export function getQueueKeys(queueName: string): QueueKeys {
  const date = new Date().toISOString().split('T')[0]
  const queueKey = `${queueName}_queue_${date}`
  const notesKey = `${queueName}_notes_${date}`
  const urlsKey = `${queueName}_urls_${date}`
  // Include current month in key for automatic rotation
  const currentMonth = new Date().toISOString().slice(0, 7) // Format: YYYY-MM
  const processedUrlsKey = `${queueName}_processed_urls_${currentMonth}`
  return { queueKey, notesKey, urlsKey, processedUrlsKey, date }
}
