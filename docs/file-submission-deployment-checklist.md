# File Submission Module Deployment & Production Checklist

## 1. Cloudflare R2 Prerequisites & Credentials
- [ ] Create an R2 bucket (e.g. `lms-submissions`).
- [ ] Generate R2 API Token with **Object Read & Write** permissions scoped to the bucket.
- [ ] Note down:
  - Account ID
  - Access Key ID
  - Secret Access Key

## 2. Supabase Edge Function Secrets
Set the following secrets in your Supabase project dashboard or via CLI:

```bash
supabase secrets set R2_ACCOUNT_ID="<YOUR_R2_ACCOUNT_ID>"
supabase secrets set R2_ACCESS_KEY_ID="<YOUR_R2_ACCESS_KEY_ID>"
supabase secrets set R2_SECRET_ACCESS_KEY="<YOUR_R2_SECRET_ACCESS_KEY>"
supabase secrets set R2_BUCKET_NAME="lms-submissions"
supabase secrets set APP_JWT_SECRET="<YOUR_EXPRESS_JWT_SECRET>"
```

> [!IMPORTANT]
> `APP_JWT_SECRET` must match the exact value of `JWT_SECRET` used by the Express backend.

## 3. Database Migration
Run the schema migration against production Postgres / Supabase:
- Migration file: `supabase/migrations/016_file_submissions.sql` (or `backend/src/database/migrations/014_file_submissions.sql`).

## 4. Deploy Supabase Edge Functions
Deploy all four Edge Functions with `--no-verify-jwt` so our HMAC verification in `_shared/appJwt.ts` validates the Express JWT:

```bash
supabase functions deploy get-upload-url --no-verify-jwt
supabase functions deploy confirm-submission --no-verify-jwt
supabase functions deploy get-download-url --no-verify-jwt
supabase functions deploy grade-submission --no-verify-jwt
```

## 5. Frontend Environment Configuration
Ensure your production `.env` or build environment includes:

```dotenv
VITE_API_URL=https://your-api-domain.com
VITE_SUPABASE_URL=https://sfanqrirgbxpgrhcamit.supabase.co
```

Build the frontend:
```bash
cd frontend
npm run build
```

## 6. Security Audit Verification
- Direct R2 uploads use short-lived presigned PUT URLs (expires in 300s).
- Direct R2 downloads use short-lived presigned GET URLs (expires in 900s).
- Object keys and R2 credentials are never exposed to the frontend.
- Standard autograding (Python, SQL, HTML) behavior remains 100% untouched.
