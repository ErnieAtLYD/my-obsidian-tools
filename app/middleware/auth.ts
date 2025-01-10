import { NextRequest } from 'next/server'

export function validateAuthToken(req: NextRequest) {
  if (
    req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}` &&
    process.env.NODE_ENV !== 'development'
  ) {
    throw new Error('Unauthorized')
  }
}
