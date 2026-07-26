/**
 * Resolve a public asset path against the configured base path.
 *
 * - External (`http(s)://`), protocol-relative (`//`) and `data:` URLs pass
 *   through untouched.
 * - Paths that already start with the normalized `BASE_URL` are returned as-is
 *   (built `ImageMetadata.src` values already include the base — prefixing
 *   again would double it).
 * - Everything else is prefixed with `BASE_URL`, normalized to exactly one
 *   trailing slash.
 */
export function assetPath(path: string): string {
  if (/^(https?:)?\/\//.test(path) || path.startsWith('data:')) return path;
  const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
  if (path.startsWith(base)) return path;
  return `${base}${path.replace(/^\/+/, '')}`;
}
