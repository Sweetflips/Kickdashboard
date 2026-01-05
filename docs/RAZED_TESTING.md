# Razed Module Testing Guide

This guide explains how to test each module of the Razed account verification system locally.

## Prerequisites

1. **Database Setup**: Make sure your database is running and migrations are applied:
   ```bash
   npx prisma migrate dev
   ```

2. **Environment Variables**: Ensure your `.env` file has:
   - `DATABASE_URL` - PostgreSQL connection string
   - `NEXT_PUBLIC_BASE_URL` - Base URL for API tests (defaults to `http://localhost:3000`)

3. **Dependencies**: Install all dependencies:
   ```bash
   npm install
   ```

## Test Scripts

### 1. Test Verification Code Generation

Tests the verification code generation and validation logic.

```bash
npm run test:razed:verification
# or
npx tsx scripts/test-razed-verification.ts
```

**What it tests:**
- Code format validation
- Code extraction from messages
- Expiration logic
- Code uniqueness

**Expected output:**
```
✅ Code generation produces valid format
✅ Valid codes pass validation
✅ Invalid codes fail validation
✅ Extract code from exact match
...
✅ ALL TESTS PASSED!
```

---

### 2. Test Database Operations

Tests database schema and CRUD operations.

```bash
npm run test:razed:db
# or
npx tsx scripts/test-razed-db.ts
```

**What it tests:**
- `RazedVerification` table exists
- User model has Razed fields
- Create verification record
- Query verification record
- Update verification status
- Update user Razed connection

**Expected output:**
```
✅ RazedVerification table exists
✅ User model has razed_connected field
✅ Create verification record
✅ Query verification by code
✅ Update verification status
✅ Update user Razed connection
...
✅ ALL TESTS PASSED!
```

**Note:** This test creates and cleans up a test verification record with `kick_user_id: 999999999`.

---

### 3. Test Razed Worker WebSocket

Tests the WebSocket connection to Razed chat and message reception.

```bash
npm run test:razed:worker
# or
npx tsx scripts/test-razed-worker.ts
```

**What it tests:**
- WebSocket connection to Razed
- Socket.IO protocol parsing
- Chat message reception
- Event handling

**Expected output:**
```
[TEST] ✅ WebSocket connected successfully
[TEST] Sent connect packet (40)
[TEST] ✅ Received connection acknowledgment
[TEST] 📨 Message #1:
       Username: SomeUser
       Text: Hello chat!...
       Channel ID: 3
       Player ID: 12345
...
✅ SUCCESS: Worker is receiving chat messages correctly!
```

**Note:** This test runs for 30 seconds. If chat is quiet, you may not see messages, which is normal.

---

### 4. Test API Endpoints

Tests the Razed API endpoints (requires running Next.js server).

**First, start your Next.js dev server:**
```bash
npm run dev
```

**Then in another terminal:**
```bash
npm run test:razed:api <kick_user_id> <razed_username>
# or
npx tsx scripts/test-razed-api.ts <kick_user_id> <razed_username>
```

**Example:**
```bash
npx tsx scripts/test-razed-api.ts 123456 testuser
```

**What it tests:**
- `/api/oauth/razed/connect` - Create verification
- `/api/oauth/razed/status` - Check verification status
- Rate limiting (429 error on rapid requests)

**Expected output:**
```
✅ SUCCESS: Verification created
   Verification Code: verify-apple-1234
   Expires At: 2026-01-05T10:30:00.000Z

✅ SUCCESS: Status retrieved
   Status: pending
```

**Full Integration Test:**
1. Run the API test to create a verification code
2. Send the verification code in Razed chat (as the specified username)
3. Run the worker test or check status again to verify it was processed

---

### 5. Run All Tests

Run verification and database tests together:

```bash
npm run test:razed:all
```

This runs:
- Verification code tests
- Database operation tests

---

## Manual Integration Testing

### Complete Flow Test

1. **Start Next.js server:**
   ```bash
   npm run dev
   ```

2. **Start Razed worker:**
   ```bash
   npm run start:worker
   ```

3. **Create verification via API:**
   ```bash
   curl -X POST http://localhost:3000/api/oauth/razed/connect \
     -H "Content-Type: application/json" \
     -d '{"kick_user_id": "123456", "razed_username": "yourusername"}'
   ```

4. **Send verification code in Razed chat:**
   - Go to Razed chat
   - Send the verification code you received (e.g., `verify-apple-1234`)

5. **Check verification status:**
   ```bash
   curl http://localhost:3000/api/oauth/razed/status?code=verify-apple-1234
   ```

6. **Verify account is connected:**
   ```bash
   curl http://localhost:3000/api/connected-accounts?kick_user_id=123456
   ```

### Testing via Frontend

1. Start Next.js dev server: `npm run dev`
2. Start Razed worker: `npm run start:worker`
3. Navigate to `/profile?tab=connected`
4. Click "Connect Razed"
5. Enter your Razed username
6. Copy the verification code
7. Send it in Razed chat
8. Watch the modal update to show "verified"

---

## Troubleshooting

### Database Tests Fail

**Error:** `RazedVerification table exists` fails

**Solution:** Run migrations:
```bash
npx prisma migrate dev
npx prisma generate
```

### Worker Test Shows No Messages

**Issue:** No chat messages received during test

**Solution:** This is normal if chat is quiet. The test verifies the connection works. Try:
- Running the test during active chat hours
- Checking Razed chat is actually active
- Verifying WebSocket connection succeeded (you'll see connection messages)

### API Tests Fail with Connection Error

**Error:** `ECONNREFUSED` or connection timeout

**Solution:** 
- Make sure Next.js dev server is running (`npm run dev`)
- Check `NEXT_PUBLIC_BASE_URL` matches your server URL
- Default is `http://localhost:3000`

### Worker Can't Connect to Razed

**Error:** WebSocket connection fails

**Solution:**
- Check internet connection
- Verify Razed WebSocket URL is accessible
- Check if Razed has changed their WebSocket endpoint
- Review worker logs for specific error messages

---

## Test Coverage Summary

| Module | Test Script | Coverage |
|--------|-------------|----------|
| Verification Code Generation | `test-razed-verification.ts` | ✅ Format, validation, extraction, expiration |
| Database Operations | `test-razed-db.ts` | ✅ Schema, CRUD, user updates |
| WebSocket Worker | `test-razed-worker.ts` | ✅ Connection, parsing, message reception |
| API Endpoints | `test-razed-api.ts` | ✅ Connect, status, rate limiting |

---

## Next Steps

After running all tests successfully:

1. **Deploy database migrations** to production
2. **Deploy worker** with Razed worker enabled
3. **Test in production** with real users
4. **Monitor logs** for any issues

For production deployment, ensure:
- Worker service includes Razed worker
- Database migrations are applied
- Environment variables are set correctly

