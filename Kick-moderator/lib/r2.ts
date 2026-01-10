import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'

// Cloudflare R2 uses S3-compatible API
// Configure client for R2 endpoint
const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
})

const BUCKET_NAME = process.env.R2_BUCKET || ''

if (!BUCKET_NAME) {
  console.warn('⚠️ R2_BUCKET not configured. R2 operations will fail.')
}

export interface UploadOptions {
  key: string
  body: Buffer | Uint8Array | string
  contentType?: string
  metadata?: Record<string, string>
}

/**
 * Upload a file to R2
 */
export async function uploadToR2(options: UploadOptions): Promise<string> {
  if (!BUCKET_NAME) {
    throw new Error('R2_BUCKET not configured')
  }

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: options.key,
    Body: options.body,
    ContentType: options.contentType || 'application/octet-stream',
    Metadata: options.metadata,
  })

  await r2Client.send(command)
  return options.key
}

/**
 * Get an object from R2
 * Returns the body as a Buffer for easier handling in Next.js
 */
export async function getFromR2(key: string): Promise<{ body: Buffer; contentType?: string; contentLength?: number; etag?: string }> {
  if (!BUCKET_NAME) {
    throw new Error('R2_BUCKET not configured')
  }

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  })

  const response = await r2Client.send(command)

  if (!response.Body) {
    throw new Error(`Object not found: ${key}`)
  }

  // Convert stream to Buffer for Next.js Response
  const chunks: Uint8Array[] = []
  const body = response.Body as any

  // Handle both Node.js Readable and Web ReadableStream
  if (body[Symbol.asyncIterator]) {
    // Node.js Readable stream
    for await (const chunk of body) {
      chunks.push(chunk)
    }
  } else if (body.getReader) {
    // Web ReadableStream
    const reader = body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) chunks.push(value)
    }
  } else {
    throw new Error('Unsupported stream type')
  }

  const buffer = Buffer.concat(chunks)

  return {
    body: buffer,
    contentType: response.ContentType,
    contentLength: response.ContentLength,
    etag: response.ETag,
  }
}

/**
 * Check if an object exists in R2
 */
export async function objectExists(key: string): Promise<boolean> {
  if (!BUCKET_NAME) {
    return false
  }

  try {
    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    })
    await r2Client.send(command)
    return true
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false
    }
    throw error
  }
}

export { r2Client, BUCKET_NAME }
