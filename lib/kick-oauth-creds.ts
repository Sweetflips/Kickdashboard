/**
 * Kick OAuth credentials helper.
 *
 * We keep two separate OAuth apps:
 * - User app: normal users signing into Kickdashboard
 * - Bot app: Sweetflipsbot authorization (moderation scopes)
 *
 * Backwards compatible with older env vars (KICK_CLIENT_ID/SECRET).
 */

export type KickOAuthClientKind = 'user' | 'bot'

function requirePair(clientId: string | undefined, clientSecret: string | undefined, hint: string) {
  if (!clientId || !clientSecret) {
    throw new Error(hint)
  }
  return { clientId, clientSecret }
}

export function getKickUserCredentials(): { clientId: string; clientSecret: string } {
  const userId = process.env.KICK_USER_CLIENT_ID || process.env.KICK_CLIENT_ID
  const userSecret = process.env.KICK_USER_CLIENT_SECRET || process.env.KICK_CLIENT_SECRET
  return requirePair(
    userId,
    userSecret,
    'Missing Kick USER OAuth credentials. Set KICK_USER_CLIENT_ID and KICK_USER_CLIENT_SECRET (or legacy KICK_CLIENT_ID/KICK_CLIENT_SECRET).'
  )
}

export function getKickBotCredentials(): { clientId: string; clientSecret: string } {
  const botId = process.env.KICK_BOT_CLIENT_ID || process.env.KICK_CLIENT_ID
  const botSecret = process.env.KICK_BOT_CLIENT_SECRET || process.env.KICK_CLIENT_SECRET
  return requirePair(
    botId,
    botSecret,
    'Missing Kick BOT OAuth credentials. Set KICK_BOT_CLIENT_ID and KICK_BOT_CLIENT_SECRET (or legacy KICK_CLIENT_ID/KICK_CLIENT_SECRET).'
  )
}


