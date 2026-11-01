# Database reliability

**Symptom seen in testing:** occasionally a Neon WebSocket connection dies silently ("Network connection lost"). The pending query never settles, so the request hangs, and an abandoned transaction can keep row locks that make other requests wait for minutes.

**What the Worker does about it** (`workers/api/src/db.ts`):
- connecting is retried up to 3 times with a 6 s limit each (safe: nothing has been sent yet);
- every database operation has a hard 25 s deadline enforced by a timer, because the driver's own `query_timeout` does not catch a dead socket;
- a dropped connection's error event is handled so it is not an uncaught exception.
On a deadline the API returns a generic 500 and logs `database timeout: ...` (no data). The app then shows "Not saved… try again". Creating an episode is idempotent (`clientRequestId`), so a retry cannot duplicate it; other writes could, rarely, apply twice if the first attempt completes after the deadline.

**Recommended database-side limits** (stops an abandoned transaction from blocking others for minutes). Run as the owner, once per Neon branch/project:
```sql
ALTER ROLE app_worker SET lock_timeout = '8s';
ALTER ROLE app_worker SET idle_in_transaction_session_timeout = '15s';
ALTER ROLE app_worker SET statement_timeout = '30s';
```
These apply to new connections. To undo: `ALTER ROLE app_worker RESET lock_timeout;` (and likewise for the others).

**Diagnosing:** `wrangler tail` and look for `database timeout`. Frequent ones point to Neon or network trouble.
