export function validateEnvVars(requiredVars: string[]) {
  const missingVars = requiredVars.filter((v) => !process.env[v])
  if (missingVars.length > 0) {
    throw new Error(`Missing environment variables: ${missingVars.join(', ')}`)
  }
}
