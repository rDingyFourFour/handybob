# Public lead/booking flow (HandyBob)

This is the canonical flow for public lead intake. Keep code and product behavior aligned with this doc.

1) Entry point: visitor opens the workspace public URL  
   - Path: `/public/booking/{slug}` (shareable + embeddable; legacy `/public/workspaces/{slug}/lead` still works if kept)  
   - Slug + enable flag live on `workspaces.slug` and `workspaces.public_lead_form_enabled`.

2) Form fields (visitor sees)  
   - Name (required)  
   - Email (recommended), Phone (recommended)  
   - Address (optional/partial)  
   - Free-text job description (required)  
   - Desired timing (flexible, this_week, emergency/today, optional date text)  
   - Honeypot field for spam bots (hidden)

3) Submit handling (`POST /api/public/leads`)  
   - Validate workspace by slug and check `public_lead_form_enabled`.  
   - Spam/abuse protections: honeypot, link filter, rate limit by hashed IP, submission log (`lead_form_submissions`).  
   - Upsert customer within workspace (match email/phone).  
   - Upsert/create job with `status='lead'`, `source='public_form'`, workspace/customer linkage, timing + contact details folded into description.  
   - Log submission for review/abuse tracking.

4) Post-processing  
   - Run AI classification + urgency tagging (existing helper).  
   - If AI marks urgency as emergency, run automations (email/SMS alerts per workspace settings).  
   - Write audit log for lead creation.

5) Outputs  
   - New/updated customer row (scoped to workspace).  
   - Lead job row with AI/attention fields populated.  
   - Submission log row for rate limiting/spam review.  
   - Optional automation events if urgent.
