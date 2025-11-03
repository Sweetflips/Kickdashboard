# Supabase Storage Setup

## Environment Variables

Add these to your `.env` file (and Railway environment variables):

```env
NEXT_PUBLIC_SUPABASE_URL=https://qzdxgtegacnkmeninxww.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

## Supabase Storage Bucket Setup

1. **Create Storage Bucket** (if not already created):
   - Go to Supabase Dashboard → Storage
   - Create bucket named `emotes` (or update the bucket name in code)
   - Make it **public** (for public avatar access)

2. **Bucket Policies**:
   - Public read access for avatars
   - Service role can upload/delete
   - Users can upload their own avatars (optional, if you want client-side uploads)

## Storage Structure

```
emotes/
  └── avatars/
      └── {userId}-{timestamp}.{ext}
```

## Usage

- Profile picture uploads go to Supabase Storage instead of base64 in database
- Images are served directly from Supabase CDN
- Old images are automatically deleted when new ones are uploaded

## Benefits

- ✅ Faster loading (CDN)
- ✅ Reduced database size (no base64 blobs)
- ✅ Better scalability
- ✅ Automatic CDN caching
