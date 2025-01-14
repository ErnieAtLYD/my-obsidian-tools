import { NextRequest } from 'next/server'

export const validateAuthToken = (request: NextRequest) => {
  if (
    request.headers.get('Authorization') !==
      `Bearer ${process.env.CRON_SECRET}` &&
    process.env.NODE_ENV !== 'development'
  ) {
    throw new Error('Unauthorized')
  }
}
