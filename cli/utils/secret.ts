/**
 * Mask the secret query parameter in a URL for safe logging.
 */
export function maskSecret(url: string): string {
  return url.replace(/([?&])secret=[^&]+/, "$1secret=***");
}

/**
 * Append a secret query parameter to a URL.
 */
export function appendSecret(url: string, secret: string | null): string {
  return secret ? `${url}?secret=${secret}` : url;
}
