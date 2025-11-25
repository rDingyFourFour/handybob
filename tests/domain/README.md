# Domain Test Coverage

- ✅ `automation` (tests/domain/automation.test.ts)
- ✅ `calls` (tests/domain/calls.test.ts)
- ✅ `invoices` (tests/domain/invoices.test.ts)
- ✅ `jobs` (tests/domain/jobs.test.ts)
- ✅ `payments` (tests/domain/payments.test.ts)
- ✅ `quotes` (tests/domain/quotes.test.ts)
- ✅ `sms` (tests/domain/sms.test.ts)
- ✅ `attention` (new tests/domain/attention.test.ts)
- ⚠️ `customers` (timeline payload helpers currently untested)
- ⚠️ `workspaces` (membership resolution/slug generation needs dedicated coverage)

Other suites:
- `tests/publicBooking.test.ts` exercises the public booking workflow.
- `tests/voice` covers Twilio webhook helpers tied to `lib/domain/calls`.

