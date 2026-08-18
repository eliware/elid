const defaultHosts = ['auth.purinton.us', 'auth.eliware.org'];

function configuredHosts() {
  const value = process.env.OAUTH_AUTHORITY_HOSTS || defaultHosts.join(',');
  return [...new Set(value.split(',').map(x => x.trim().toLowerCase()).filter(Boolean))];
}

export function authorityOrigin(req) {
  const configuredIssuer = process.env.OAUTH_ISSUER;
  const host = String(req?.get?.('host') || req?.headers?.host || '').trim().toLowerCase();
  const hostname = host.replace(/:\d+$/, '');
  if (host && configuredHosts().includes(hostname)) {
    const forwarded = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
    const protocol = forwarded === 'http' && process.env.NODE_ENV !== 'production' ? 'http' : 'https';
    return `${protocol}://${host}`;
  }
  return configuredIssuer || 'https://auth.eliware.org';
}

export function authorityIssuer() {
  return process.env.OAUTH_ISSUER || 'https://auth.eliware.org';
}
