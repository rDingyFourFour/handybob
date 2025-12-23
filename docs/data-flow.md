AskBob job pipeline (Steps 1-4)
+----------------------+   +-------------------------+   +-----------------------------+
| User Browser         |-->| /jobs/[id] (RSC loader)  |-->| JobAskBobFlow/Container UI   |
+----------------------+   +-------------------------+   +-----------------------------+
                                                         |
                                                         v
                     +-----------------------------------------------------------+
                     | Step 1 Diagnose UI -> server action -> AskBob svc/OpenAI |
                     | writes snapshot -> Supabase; updates flow state           |
                     +-----------------------------------------------------------+
                                                         |
                                                         v
                     +-----------------------------------------------------------+
                     | Step 2 Materials (uses diagnosis) -> action -> OpenAI     |
                     | writes snapshot -> Supabase                               |
                     +-----------------------------------------------------------+
                                                         |
                                                         v
                     +-----------------------------------------------------------+
                     | Step 3 Quote (uses diagnosis+materials) -> action -> AI   |
                     | writes quote candidate -> Supabase                        |
                     +-----------------------------------------------------------+
                                                         |
                                                         v
                     +-----------------------------------------------------------+
                     | Step 4 Follow-up (uses diag+materials+quote presence)     |
                     | action -> AI -> writes follow-up candidate -> Supabase    |
                     +-----------------------------------------------------------+

Calling pipeline (Steps 5-9)
+------------------------------------------------------------+
| Step 5 Call assist: script generation (job.call_script)     |
| uses job+quote+latest call outcome -> action -> OpenAI      |
| writes script/summary -> Supabase                           |
+------------------------------------------------------------+
                                |
                                v
+------------------------------------------------------------+
| Step 6 Call workspace/session view navigation               |
+------------------------------------------------------------+
                                |
                                v
+------------------------------------------------------------+
| Step 7 Call prep refinements (script + plan) -> OpenAI      |
| writes updated plan -> Supabase                             |
+------------------------------------------------------------+
                                |
                                v
+------------------------------------------------------------+
| Step 8 After-call (two sources)                             |
| - job_step_8 (job-only context)                             |
| - call_session (requires callId + readiness)                |
| action -> OpenAI -> writes after-call draft -> Supabase      |
+------------------------------------------------------------+
                                |
                                v
+------------------------------------------------------------+
| Step 9 Automated call                                      |
| UI sends script+voice plan+customer phone                   |
| -> startAskBobAutomatedCall action                          |
| -> create/reuse call_session in Supabase                    |
| -> lib/domain/twilio.server dialer                          |
| -> write twilio_call_sid/status=queued + speech snapshot    |
| UI polls getCallSessionDialStatus action                    |
| UI autosaves notes via saveAutomatedCallNotesAction         |
| -> calls.transcript in Supabase                             |
+------------------------------------------------------------+

Twilio callback loop
+--------------------+   +------------------------------------+   +----------------------+
| Twilio             |-->| /api/twilio/calls/status            |-->| updateCallSession    |
|                    |   | signature validation                |   | Twilio status -> SB   |
+--------------------+   +------------------------------------+   +----------------------+
         |                                                     
         v                                                     
+--------------------+   +------------------------------------+   +----------------------+
| Twilio             |-->| /api/twilio/calls/recording         |-->| updateCallSession    |
|                    |   | signature validation                |   | recording metadata   |
+--------------------+   +------------------------------------+   +----------------------+
         |                                                     
         v                                                     
+--------------------+   +------------------------------------+
| Twilio             |-->| /api/twilio/voice/outbound          |
|                    |   | signature validation -> load plan   |
|                    |   | snapshot -> return TwiML            |
+--------------------+   +------------------------------------+

Terminal -> outcome -> follow-up handoff
+----------------------------+   +------------------------------+   +-------------------------+
| Call status terminal       |-->| Outcome capture enabled      |-->| Outcome saved -> SB      |
| (from Twilio status)       |   | (call session page)          |   | updates readiness fields |
+----------------------------+   +------------------------------+   +-------------------------+
                                                   |
                                                   v
+---------------------------------------------------------------+
| Step 8 uses call_session source -> generate after-call + draft |
+---------------------------------------------------------------+
                                                   |
                                                   v
+---------------------------------------------------------------+
| Draft cached in sessionStorage/messageDraftCache               |
| Optional: Open composer with this draft -> messages UI         |
+---------------------------------------------------------------+
