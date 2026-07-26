# Cloudflare edge rules

Do not enable a hostname-wide challenge for `example.com`. Public HTML, assets, feeds, search, and crawlers must remain reachable without JavaScript solving a challenge.

The preferred fix is to delete the hostname-wide Managed Challenge. If another Cloudflare product still injects a challenge, create a higher-priority **Skip** rule for every non-admin request:

```text
(http.host eq "example.com" and not (
  http.request.uri.path eq "/admin" or
  starts_with(http.request.uri.path, "/admin/")
))
```

Configure the Skip action only for the rule or Cloudflare security product that creates the challenge; do not disable TLS or DDoS protection. Keep a separate **Managed Challenge** or Cloudflare Access rule for `/admin` and `/admin/*`. The Skip expression intentionally includes `/oauth`, `/oauth/callback`, `/deploy/github`, and `/healthz`; those endpoints perform their own state, signature, account, or health checks at the origin.

After publishing a rule, run `pnpm production:smoke` from a client that is not bypassing Cloudflare. It verifies `/`, `/projects/`, `/posts/`, public metadata and assets, admin protection, the OAuth redirect, webhook rejection, and `/healthz`.

Never store Cloudflare API tokens in this repository. Revoke any token pasted into chat and create a replacement with only the zone permissions needed for rule management.
