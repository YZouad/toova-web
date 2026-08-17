# OAuth setup (Google + Facebook)

Toova uses Supabase Auth social login. Secrets stay in the Supabase dashboard / provider consoles — never in frontend code.

## 1. Supabase Auth settings

In **Authentication → URL configuration**:

- **Site URL**: production origin (and local `http://localhost:5173` while developing)
- **Redirect URLs** allowlist:
  - `http://localhost:5173/**`
  - `https://<your-production-domain>/**`

Callback URL for providers (from Supabase → Authentication → Providers):

```text
https://<project-ref>.supabase.co/auth/v1/callback
```

## 2. Google

1. Create a Web application OAuth client in Google Cloud Console.
2. Authorized JavaScript origins: app origins (localhost + production).
3. Authorized redirect URI: the Supabase callback URL above.
4. Paste Client ID + Client Secret into Supabase → Authentication → Providers → Google.
5. Enable the Google provider.

Docs: https://supabase.com/docs/guides/auth/social-login/auth-google

## 3. Facebook

1. Create a Facebook app with Facebook Login.
2. Valid OAuth Redirect URIs: the Supabase callback URL.
3. Paste App ID + App Secret into Supabase → Authentication → Providers → Facebook.
4. Enable the Facebook provider.

Docs: https://supabase.com/docs/guides/auth/social-login/auth-facebook

## 4. App behavior

- Auth page leads with Google / Facebook via `supabase.auth.signInWithOAuth`.
- Email/password remains as a fallback.
- Guests can checklist + design first; Save design stores a local snapshot and opens auth.
- After redirect, App restores the guest snapshot into a new owned room.
