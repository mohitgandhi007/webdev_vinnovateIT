import { ssrfGuard } from './ssrf-guard.js';
import { config } from '../config/env.js';

export const ssrfValidator = {
  validateUrlSyntax(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') {
      return { valid: false, error: 'URL must be a non-empty string.' };
    }

    let urlToParse = rawUrl.trim();
    if (!/^https?:\/\//i.test(urlToParse)) {
      urlToParse = `https://${urlToParse}`;
    }

    let parsed;
    try {
      parsed = new URL(urlToParse);
    } catch (err) {
      return { valid: false, error: 'Invalid URL format.' };
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: `Protocol '${parsed.protocol}' is not allowed. Only http: and https: are supported.` };
    }

    if (!parsed.hostname || parsed.hostname.length === 0) {
      return { valid: false, error: 'URL must contain a valid hostname.' };
    }

    const allowLocalFixtures = process.env.ALLOW_LOCAL_FIXTURES === 'true';
    const hostCheck = ssrfGuard.isProhibitedHostname(parsed.hostname, { allowLocalFixtures });
    if (hostCheck.prohibited) {
      return { valid: false, error: `Restricted hostname: ${hostCheck.reason}` };
    }

    const ipCheck = ssrfGuard.isProhibitedIp(parsed.hostname.replace(/^\[|\]$/g, ''), { allowLocalFixtures });
    if (ipCheck.restricted && !ipCheck.reason.includes('Unrecognized')) {
      return { valid: false, error: `Restricted destination IP: ${ipCheck.reason}` };
    }

    return { valid: true, url: parsed.toString(), hostname: parsed.hostname };
  },

  isPrivateIp(ip) {
    const check = ssrfGuard.isProhibitedIp(ip, {
      allowLocalFixtures: process.env.ALLOW_LOCAL_FIXTURES === 'true'
    });
    return check.restricted;
  },

  async resolveAndCheckDns(hostname) {
    const allowLocalFixtures = process.env.ALLOW_LOCAL_FIXTURES === 'true';
    const check = await ssrfGuard.resolveAndVerifyDns(hostname, { allowLocalFixtures });
    if (!check.safe) {
      return { safe: false, error: check.reason };
    }
    return { safe: true, addresses: check.addresses };
  }
};

/**
 * Validates syntax, protocol, hostname, and resolves DNS to ensure the URL target is not on internal/private networks
 */
export async function validateSafeUrl(url) {
  const allowLocalFixtures = process.env.ALLOW_LOCAL_FIXTURES === 'true';
  const check = await ssrfGuard.validateRequestUrl(url, { allowLocalFixtures });
  if (!check.safe) {
    return { valid: false, reason: check.reason };
  }
  return { valid: true, url: check.url };
}

export { ssrfGuard };
