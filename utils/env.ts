export function validateEnv() {
  const requiredEnvVars = [
    'CRON_SECRET',
    'YOUR_NAME',
    'OPENAI_API_KEY',
    'GITHUB_USERNAME',
    'GITHUB_REPO',
  ] as const

  const missingVars = requiredEnvVars.filter((envVar) => !process.env[envVar])

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}`,
    )
  }
}
