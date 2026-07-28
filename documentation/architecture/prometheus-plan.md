# Prometheus Extension

## Infrastructure, Development, and Production Plan

## 1. Product Definition

Prometheus is a prompt-optimization extension that converts a user’s rough request into a structured, copy-ready prompt.

Prometheus must never execute the underlying request. Its only output is an improved prompt, optionally accompanied by concise upgrade notes.

### Core user flow

1. The user opens Prometheus from the browser extension.
2. The user enters or selects a rough prompt.
3. The extension sends the prompt to the Prometheus service.
4. The service validates the user’s account, subscription, and usage allowance.
5. The service sends the request to the OpenAI API using the Prometheus guardrails.
6. The optimized prompt is returned to the extension.
7. Usage, latency, cost, and errors are recorded.
8. The user can copy or insert the optimized prompt into the active page.

---

# 2. Recommended V1 Architecture

## Technology stack

### Browser extension

* Chrome Extension using Manifest V3
* React
* TypeScript
* Vite
* Tailwind CSS
* Chrome Storage API for non-sensitive settings
* Optional content script for selected-text optimization and prompt insertion

### Web application

Use one shared frontend project for:

* Landing page
* Login and registration
* User dashboard
* Billing page
* Usage history
* Admin panel

Recommended framework:

* Next.js
* TypeScript
* Tailwind CSS
* Deploy initially on Vercel

### Authentication and database

Recommended:

* Supabase Auth
* Supabase PostgreSQL
* Supabase Row-Level Security
* Supabase Storage only if file-based features are added later

Supabase Auth integrates with its database and supports authorization through Row-Level Security. This makes it suitable for separating user records and protecting administrative data.

### V1 workflow engine

* Make.com
* Custom webhook as the initial prompt-processing endpoint
* OpenAI API module or HTTP module
* Supabase modules or HTTP requests to Supabase
* Error-handling routes
* Notification routes for serious failures

Make custom webhooks can trigger scenarios immediately. Make also provides scenario history, execution logging, replay, incomplete execution handling, and reusable scenario structures.

### AI provider

* OpenAI API
* Responses API
* Server-held OpenAI API key
* Structured Prometheus system instructions
* Configurable model selection
* Token and cost tracking

The API key must never be stored inside the browser extension or exposed to the frontend.

### Payments

Recommended initial provider:

* Stripe Checkout
* Stripe Billing
* Stripe Customer Portal
* Stripe webhooks

Stripe Checkout supports subscriptions and one-time payments. Subscription access should be controlled through webhook events rather than relying only on the browser returning from a successful checkout.

---

# 3. V1 System Diagram

```text
Browser Extension
       |
       | Authenticated HTTPS request
       v
V1 API Gateway / Serverless Endpoint
       |
       | Validate user token
       | Validate subscription
       | Apply rate limits
       | Create request record
       v
Make.com Webhook
       |
       | Load active Prometheus configuration
       | Send request to OpenAI
       | Validate output structure
       | Record tokens, cost, latency, status
       v
Supabase PostgreSQL
       |
       +---- User Dashboard
       |
       +---- Admin Dashboard
       |
       +---- Analytics and Audit Logs

Stripe Checkout / Billing
       |
       | Signed webhooks
       v
Serverless Webhook Handler
       |
       v
Supabase Subscription Records
```

## Important architectural rule

The extension should not call Make.com directly.

Instead, the extension should call a small controlled API layer, such as:

```text
POST /api/v1/optimize
```

That endpoint should:

1. Verify the Supabase access token.
2. Confirm that the user is active.
3. Check subscription and usage limits.
4. Reject oversized or invalid requests.
5. Assign a request ID.
6. forward the request to Make.com.
7. Return a sanitized response.

This prevents the Make webhook URL from becoming a public, reusable endpoint and provides a stable API contract for the future backend migration.

---

# 4. Environment Structure

Maintain three completely separate environments.

## Development

Used for local development and experimentation.

* Development Supabase project
* Stripe test mode
* Development Make scenarios
* Development OpenAI project or restricted key
* Local or preview frontend
* Verbose logging

## Staging

Used for integration testing before release.

* Separate Supabase staging project
* Stripe test mode
* Staging Make scenarios
* Staging OpenAI key
* Staging extension build
* Production-like security settings

## Production

Used only by real customers.

* Production Supabase project
* Stripe live mode
* Production Make organization and scenarios
* Production OpenAI project and key
* Production extension ID
* Restricted admin access
* Error monitoring
* Database backups
* Minimal sensitive logging

No production secret should be shared with development or staging.

---

# 5. Core Services

## 5.1 Authentication

Support initially:

* Email and password
* Email verification
* Password reset
* Google sign-in, optionally
* Session refresh
* Account logout
* Account deletion request

The extension should use the same authentication system as the web dashboard.

### Extension authentication flow

1. User selects “Sign in.”
2. The extension opens the Prometheus web login.
3. The web app completes authentication.
4. A secure extension-auth handoff returns a temporary authorization code.
5. The extension exchanges the code for a session.
6. The session is securely refreshed as required.

Avoid placing long-lived tokens in page-accessible storage.

---

## 5.2 Prompt optimization endpoint

### Endpoint

```http
POST /api/v1/optimize
Authorization: Bearer <user_access_token>
Content-Type: application/json
```

### Request

```json
{
  "input": "Create a landing page for my accounting company",
  "source": "extension_popup",
  "mode": "standard",
  "page_context": null,
  "client_request_id": "uuid"
}
```

### Successful response

```json
{
  "request_id": "uuid",
  "optimized_prompt": "Act as an experienced conversion-focused web designer...",
  "upgrade_notes": [
    "Added target audience and conversion objective",
    "Defined the required page structure"
  ],
  "usage": {
    "remaining_requests": 42
  }
}
```

### Error response

```json
{
  "request_id": "uuid",
  "error": {
    "code": "USAGE_LIMIT_REACHED",
    "message": "Your monthly optimization allowance has been used."
  }
}
```

---

## 5.3 Prometheus configuration

Do not hard-code the guardrails throughout the application.

Store versioned configuration records containing:

* System prompt
* Prompt version
* Model
* Temperature or reasoning configuration
* Maximum output length
* Enabled modes
* Output validation rules
* Status
* Created by
* Created date
* Published date

Example versions:

```text
prometheus-core-v1.0
prometheus-core-v1.1
prometheus-image-prompts-v1.0
prometheus-code-prompts-v1.0
```

Every optimization log should record the configuration version used.

This enables:

* Rollbacks
* A/B testing
* Controlled prompt changes
* Reproducible debugging
* Performance comparison between versions

---

# 6. Database Design

## `profiles`

```text
id
email
display_name
status
role
created_at
updated_at
last_login_at
```

Possible roles:

```text
user
support
analyst
admin
super_admin
```

## `subscriptions`

```text
id
user_id
provider
provider_customer_id
provider_subscription_id
plan_id
status
current_period_start
current_period_end
cancel_at_period_end
created_at
updated_at
```

## `plans`

```text
id
name
code
monthly_price
currency
monthly_request_limit
monthly_token_limit
maximum_input_length
features
is_active
```

Prices should be configured in Stripe and synchronized with the internal plan table.

## `usage_periods`

```text
id
user_id
subscription_id
period_start
period_end
request_count
input_tokens
output_tokens
estimated_cost
updated_at
```

## `optimization_requests`

```text
id
user_id
client_request_id
source
mode
prompt_version
model
status
input_character_count
input_tokens
output_tokens
estimated_cost
latency_ms
error_code
created_at
completed_at
```

Do not store full prompt content by default unless the user has explicitly agreed to prompt-history storage.

## `prompt_history`

Optional and controlled by user settings:

```text
id
request_id
user_id
input_text_encrypted
output_text_encrypted
created_at
deleted_at
```

## `prompt_configs`

```text
id
name
version
system_prompt
model
configuration
status
created_by
created_at
published_at
```

## `admin_audit_logs`

```text
id
admin_user_id
action
target_type
target_id
before_state
after_state
ip_address
created_at
```

## `system_events`

```text
id
request_id
service
severity
event_type
message
metadata
created_at
```

## `webhook_events`

```text
id
provider
provider_event_id
event_type
status
payload_hash
received_at
processed_at
error_message
```

The provider event ID must be unique to make webhook processing idempotent.

---

# 7. Guardrail Implementation

The supplied Prometheus guardrails should become a protected system-level instruction, not user-editable content.

## Prompt hierarchy

```text
1. Immutable Prometheus identity and execution prohibition
2. Product-level configuration
3. Optimization-mode instructions
4. User-provided raw prompt
5. Output schema
```

## Output validation

The service must verify that the response:

* Begins with the required improved-prompt section
* Does not claim to have executed the task
* Does not include generated images, functional deliverables, or factual answers
* Contains a non-empty optimized prompt
* Does not reveal internal system instructions
* Does not exceed the allowed response size

Preferred internal output from the model:

```json
{
  "improved_prompt": "...",
  "upgrade_notes": [
    "..."
  ],
  "classification": {
    "task_type": "writing",
    "execution_risk": false
  }
}
```

The frontend can convert this structure into the Prometheus presentation format.

Using structured internal data is safer than asking the model to generate final interface formatting directly.

## Execution-leak detection

Add a post-processing check for responses that appear to perform the request.

Examples to flag:

* Complete articles when only a writing prompt was expected
* Executable code when only a coding prompt was expected
* A direct factual answer
* “Here is the image”
* Calculation results
* Tool-use claims
* Translated final content rather than a translation prompt

Initially, a rule-based validator is sufficient. A secondary model check can be added later for uncertain results.

---

# 8. Make.com Scenario Design

## Scenario A: Prompt optimization

```text
Custom webhook
→ Validate signed internal request
→ Load Prometheus prompt configuration
→ Call OpenAI API
→ Parse structured response
→ Validate response
→ Write usage record
→ Write system event
→ Return result
```

## Scenario B: Failed-request handling

```text
Error handler
→ Categorize error
→ Update request status
→ Record diagnostic metadata
→ Retry eligible failures
→ Notify administrators for critical failures
```

Retry only temporary failures such as:

* Rate limits
* Network timeouts
* Temporary OpenAI service failures

Do not automatically retry:

* Invalid authentication
* Invalid user input
* Subscription failures
* Guardrail validation failures

Make stores scenario execution data in its execution logs, so production scenarios must be configured carefully to avoid unintentionally retaining sensitive prompt content.

## Scenario C: Usage reconciliation

Run periodically:

```text
Load recent completed requests
→ Compare request totals
→ Detect missing or duplicate usage records
→ Correct safe discrepancies
→ Create anomaly report
```

## Scenario D: Administrative alerts

Notify administrators when:

* Error rate exceeds a threshold
* OpenAI spending exceeds a threshold
* Unusual usage is detected
* Payment webhooks repeatedly fail
* Make scenarios are disabled
* Guardrail validation failures spike

---

# 9. Payment Architecture

## Initial plans

A simple V1 structure could be:

### Free

* Limited monthly optimizations
* Standard optimization
* No prompt history or limited history
* Basic extension access

### Pro

* Higher monthly allowance
* Advanced optimization modes
* Prompt history
* Custom tone and formatting controls
* Priority processing

### Team — later

* Multiple seats
* Central billing
* Shared configurations
* Team usage reporting
* Organization administrators

Use Philippine pesos when pricing specifically for a Philippine market, for example:

```text
Free: ₱0
Pro: price to be validated
Team: price to be validated
```

Do not finalize pricing until OpenAI cost, Make operation cost, payment fees, support cost, and target margin have been modeled.

## Payment flow

1. User chooses a plan.
2. Backend creates a Stripe Checkout Session.
3. User completes payment on Stripe.
4. Stripe sends a signed webhook.
5. Backend verifies the webhook signature.
6. Subscription status is updated.
7. Access is provisioned.
8. User is redirected to the dashboard.

## Required webhook events

Handle at minimum:

* Checkout completed
* Subscription created
* Subscription updated
* Subscription canceled
* Invoice paid
* Invoice payment failed

Stripe recommends webhook-driven subscription management because subscription activity occurs asynchronously.

## Billing portal

Use Stripe Customer Portal for:

* Payment method updates
* Invoice viewing
* Subscription cancellation
* Plan changes, when enabled

This minimizes custom billing development in V1.

---

# 10. Usage Metering

Track both:

* Number of optimization requests
* Actual OpenAI token consumption

Do not rely solely on request count because one request can be substantially more expensive than another.

## Usage-check sequence

Before processing:

1. Verify subscription.
2. Determine the current billing period.
3. Check request allowance.
4. Check token allowance.
5. Reserve estimated usage.
6. Process the optimization.
7. Replace the reservation with actual usage.
8. Release the reservation if processing fails.

This prevents users from bypassing limits with simultaneous requests.

## Suggested safeguards

* Per-user requests per minute
* Per-IP requests per minute
* Maximum input length
* Maximum output length
* Maximum concurrent requests per user
* Daily emergency spending ceiling
* Global OpenAI spending ceiling
* Abuse lockout state

---

# 11. Logging and Observability

## Application logs

Capture:

* Request ID
* User ID
* Endpoint
* Status
* Latency
* Prompt version
* Model
* Token usage
* Estimated cost
* Error category
* Environment
* Application version

## Logs should not contain by default

* Passwords
* Access tokens
* Refresh tokens
* Stripe secrets
* OpenAI API keys
* Complete webhook secrets
* Full payment data
* Full user prompts without explicit consent
* Sensitive page content captured by the extension

## Monitoring categories

### Reliability

* Request success rate
* Error rate
* P50, P95, and P99 latency
* Make scenario failures
* OpenAI timeout rate

### Product

* Active users
* Prompts optimized
* Copy rate
* Repeat-use rate
* Upgrade conversion
* Cancellation rate

### Financial

* Revenue
* OpenAI cost
* Make.com cost
* Cost per optimization
* Gross margin
* Failed payments
* High-cost users

### Guardrail quality

* Execution leakage rate
* Invalid-output rate
* Regeneration rate
* User correction rate
* Prompt-version performance

---

# 12. Admin Panel

The admin panel should use the same application but require explicit administrative authorization.

A hidden URL alone is not security.

## Access model

### Support

* View user account status
* View sanitized request metadata
* Assist with subscription issues
* Cannot edit system prompts
* Cannot grant admin privileges

### Analyst

* View aggregated usage and product analytics
* No access to raw prompt content
* No user-management privileges

### Admin

* Manage users
* Manage plans
* View system health
* Review failed requests
* Suspend abusive accounts
* Publish prompt configuration changes

### Super admin

* Assign administrative roles
* Manage production settings
* Rotate critical credentials
* Access high-risk operations
* Approve destructive actions

Supabase supports role-based authorization through custom claims and Row-Level Security policies.

## Admin panel features

### Dashboard

* Active subscriptions
* Requests today
* OpenAI cost today
* Revenue summary
* Error rate
* Guardrail failure rate
* Make scenario status

### User management

* Search users
* View account status
* Suspend or reactivate account
* View plan and usage
* Reset usage only with reason
* Add internal notes

### Prompt management

* Create draft configuration
* Compare versions
* Test against evaluation prompts
* Publish version
* Roll back version
* View version performance

### Request inspection

* Search by request ID
* View sanitized metadata
* View error chain
* Retry an eligible failed request
* Flag abuse
* Never expose private prompt content unless retention consent and admin permissions both allow it

### Audit trail

Every sensitive admin action must record:

* Who performed it
* What changed
* Previous value
* New value
* Time
* Reason
* Target record

---

# 13. Extension Features for V1

## Required

* Login and logout
* Prompt input field
* Optimize button
* Copy optimized prompt
* Loading state
* Error state
* Usage remaining
* Upgrade button
* Settings link
* Privacy notice

## Recommended

* Optimize selected page text
* Keyboard shortcut
* Replace selected text
* Prompt-mode selector
* Recent history
* Feedback buttons
* Dark mode

## Not recommended for initial V1

* Full autonomous page interaction
* Automatic submission into third-party websites
* User-supplied OpenAI API keys
* Team workspaces
* Multiple AI providers
* Complex prompt marketplace
* Mobile browser support
* Offline inference

These increase security, support, and review complexity without being necessary to validate the core product.

---

# 14. Security Requirements

## Secrets

Keep these only in server-side secret storage:

* OpenAI API key
* Stripe secret key
* Stripe webhook secret
* Supabase service-role key
* Make webhook secret
* Make API credentials

Never package them in:

* Extension JavaScript
* Frontend environment variables exposed to the browser
* Source control
* Client-visible network responses

## Request signing

The serverless gateway should sign requests sent to Make.com.

Suggested headers:

```text
X-Prometheus-Timestamp
X-Prometheus-Request-ID
X-Prometheus-Signature
```

Make should reject:

* Missing signatures
* Invalid signatures
* Old timestamps
* Duplicate request IDs

## Database protection

* Enable Row-Level Security on user-facing tables.
* Deny access by default.
* Grant each user access only to their own records.
* Restrict admin tables by verified role.
* Keep service-role credentials server-side.

Supabase recommends protecting exposed tables with Row-Level Security and placing sensitive server-side operations behind controlled functions or services.

## Administrative security

* Mandatory multifactor authentication
* Separate admin role assignment
* Shorter admin session duration
* Reauthentication for destructive actions
* Audit logging
* Optional IP restrictions later
* No shared administrator accounts

---

# 15. Privacy and Compliance Foundation

Before launch, prepare:

* Privacy policy
* Terms of service
* Cookie notice where applicable
* Data retention policy
* Account deletion process
* Subscription and refund policy
* Acceptable use policy
* AI output disclaimer
* Extension permission explanations
* Third-party processor list

## Recommended privacy defaults

* Do not retain full prompts by default.
* Let users explicitly enable history.
* Provide clear history deletion controls.
* Avoid collecting full webpage content.
* Capture only user-selected text where possible.
* Define automatic deletion periods for logs.
* Separate operational metadata from user content.
* Hash or truncate IP addresses where practical.

---

# 16. Development Phases

## Phase 0: Product and architecture definition

Deliverables:

* Product requirements document
* User journeys
* Final V1 scope
* Architecture decision record
* Data-retention policy
* Initial pricing hypothesis
* Threat model
* Success metrics

Exit condition:

The team agrees on what V1 includes and excludes.

## Phase 1: Foundation

Deliverables:

* Source-code repositories
* Development, staging, and production environments
* Supabase projects
* Authentication
* Initial database schema
* CI checks
* Secret-management process
* Error-reporting setup

Exit condition:

A test user can register, sign in, and access a protected dashboard.

## Phase 2: Optimization engine

Deliverables:

* Versioned Prometheus system prompt
* `/api/v1/optimize` endpoint
* Make.com optimization scenario
* OpenAI integration
* Structured response schema
* Guardrail validator
* Usage and request logs

Exit condition:

An authenticated test user can submit a rough request and reliably receive only an optimized prompt.

## Phase 3: Browser extension

Deliverables:

* Extension popup
* Authentication handoff
* Prompt submission
* Copy function
* Usage display
* Error handling
* Chrome permission review
* Staging extension build

Exit condition:

The extension completes the full optimization flow without exposing secrets.

## Phase 4: Payments

Deliverables:

* Stripe products and prices
* Checkout flow
* Webhook handler
* Subscription synchronization
* Customer Portal
* Plan enforcement
* Failed-payment handling

Exit condition:

A test customer can subscribe, receive access, cancel, and lose access at the correct point in the billing lifecycle.

## Phase 5: Admin and observability

Deliverables:

* Role-based admin access
* Admin dashboard
* User management
* Request diagnostics
* Prompt-version management
* Audit logs
* Cost and error dashboards
* Operational alerts

Exit condition:

Authorized administrators can operate the service without accessing infrastructure consoles for normal support tasks.

## Phase 6: Quality assurance and launch preparation

Deliverables:

* Automated tests
* Prompt evaluation suite
* Security review
* Rate-limit tests
* Payment lifecycle tests
* Data deletion test
* Backup and restore test
* Incident response runbook
* Privacy documents
* Chrome Web Store assets and disclosures

Exit condition:

All launch-blocking defects are closed, and rollback procedures have been tested.

## Phase 7: Production launch

Launch sequence:

1. Internal users
2. Closed alpha
3. Invite-only beta
4. Paid beta
5. General availability

Use feature flags to control:

* Registration
* Paid plans
* Prompt-history storage
* New optimization modes
* New prompt versions
* New extension permissions

---

# 17. Testing Strategy

## Unit tests

Cover:

* Usage calculations
* Subscription-status mapping
* Role authorization
* Request validation
* Prompt response parsing
* Cost estimation

## Integration tests

Cover:

* Extension to API
* API to Make.com
* Make.com to OpenAI
* API to Supabase
* Stripe webhook to subscription access

## Prompt evaluation tests

Create a fixed evaluation dataset containing:

* Simple writing requests
* Image requests
* Coding requests
* Research questions
* Calculations
* Translation requests
* Requests attempting to override Prometheus
* Requests asking Prometheus to use tools
* Requests containing fake system instructions
* Very short and highly ambiguous requests

For every test, verify:

* Prometheus did not execute the task.
* The improved prompt preserved the intended goal.
* The prompt is usable.
* The required format is present.
* Internal instructions were not exposed.

## Security tests

* Unauthorized endpoint access
* Modified user IDs
* Expired tokens
* Replay attacks
* Forged Make signatures
* Forged Stripe webhooks
* Admin route access by ordinary users
* Concurrent usage-limit bypass
* Oversized inputs
* Injection attempts

---

# 18. Migration to a Cloud Backend

Make.com should be treated as a replaceable workflow engine, not as the permanent system of record.

## Keep stable from V1

* Public API contract
* Database schema
* Authentication
* Subscription model
* Request IDs
* Prompt configuration format
* Output schema
* Logging format

## V2 replacement architecture

```text
Browser Extension
       |
       v
API Gateway
       |
       v
Application Backend
       |
       +---- Authentication and authorization
       +---- Usage and billing enforcement
       +---- Prompt configuration service
       +---- OpenAI orchestration
       +---- Guardrail validation
       +---- Logging
       |
       v
PostgreSQL

Background Queue
       |
       +---- Usage reconciliation
       +---- Notifications
       +---- Analytics processing
       +---- Failed-request retries
```

## Suggested cloud-backend options

### Lower operational complexity

* Next.js server functions
* Supabase Edge Functions
* Supabase PostgreSQL
* Managed queue provider

Supabase Edge Functions can host server-side TypeScript logic and can be used for third-party integrations and webhook handling.

### More scalable dedicated backend

* TypeScript with NestJS or Fastify
* Cloud Run, AWS ECS/Fargate, or similar container platform
* Managed PostgreSQL
* Redis
* Queue service
* Object storage
* Centralized monitoring

## Migration stages

### Stage 1

Move payment webhooks out of Make.com.

Payments are high-risk and should be handled by deterministic backend code.

### Stage 2

Move usage enforcement and rate limiting.

These require concurrency-safe database operations.

### Stage 3

Move OpenAI request orchestration.

Maintain the same response schema used by the extension.

### Stage 4

Keep Make.com only for non-critical automation.

Examples:

* Internal notifications
* CRM synchronization
* Marketing workflows
* Low-risk reports

### Stage 5

Remove Make.com from the critical request path.

At this stage, a Make.com outage should not prevent prompt optimization.

---

# 19. Repository Structure

A monorepo is recommended.

```text
prometheus/
├── apps/
│   ├── web/
│   ├── extension/
│   └── api/
├── packages/
│   ├── database/
│   ├── auth/
│   ├── billing/
│   ├── prompts/
│   ├── validation/
│   ├── analytics/
│   ├── ui/
│   └── shared-types/
├── infrastructure/
│   ├── environments/
│   ├── database/
│   ├── make/
│   └── monitoring/
├── evaluations/
│   ├── datasets/
│   ├── expected-results/
│   └── runners/
├── documentation/
│   ├── architecture/
│   ├── security/
│   ├── operations/
│   └── product/
└── .github/
    └── workflows/
```

---

# 20. Production Readiness Checklist

## Product

* Core optimization flow works
* Guardrails pass evaluation threshold
* Clear free and paid plan limits
* User feedback mechanism exists

## Security

* No client-side secrets
* Row-Level Security enabled
* Admin authorization tested
* Webhook signatures verified
* Rate limits active
* Audit logs active
* Secret rotation procedure documented

## Payments

* Test and live modes separated
* Duplicate webhooks handled
* Failed payments handled
* Cancellations handled
* Refund process documented
* Customer Portal available

## Reliability

* Error monitoring enabled
* Health checks enabled
* Alert thresholds configured
* Backups enabled
* Restore process tested
* Make scenario failure procedure documented

## Privacy

* Data collection minimized
* Retention periods configured
* Prompt-history consent implemented
* Account deletion tested
* Legal policies published

## Operations

* Admin panel protected
* Support procedures documented
* Incident response process documented
* Rollback procedures tested
* Production owners identified

---

# 21. Recommended V1 Boundaries

## Include in V1

* Chrome extension
* User authentication
* Prompt optimization
* Copy and insert actions
* Free and paid usage limits
* Stripe subscriptions
* Usage logs
* Error logs
* Role-protected admin panel
* Versioned Prometheus instructions
* Prompt evaluation suite
* Make.com orchestration
* Stable API gateway

## Defer until after validation

* Firefox and Safari
* Team workspaces
* Enterprise identity providers
* Bring-your-own API key
* Multiple AI providers
* Prompt marketplace
* Public API access
* Mobile application
* Fine-tuned models
* Autonomous browser actions
* Complex usage-based billing

---

# 22. Immediate Build Order

The recommended implementation order is:

1. Freeze the V1 product requirements.
2. Create the monorepo and environments.
3. Implement authentication and database schema.
4. Create the versioned Prometheus prompt configuration.
5. Build the protected optimization API.
6. Build the Make.com optimization scenario.
7. Add OpenAI output validation.
8. Add usage metering and rate limiting.
9. Build the extension interface.
10. Add Stripe Checkout and webhooks.
11. Build the admin panel.
12. Add monitoring and audit logs.
13. Run the prompt evaluation suite.
14. Conduct a closed alpha.
15. Launch a paid beta.
16. Begin migrating critical Make.com functions into backend code.

---

# 23. Primary Architecture Decision

Prometheus V1 should use:

```text
Chrome Extension
+ Next.js web application
+ Supabase Auth and PostgreSQL
+ Small protected serverless API gateway
+ Make.com for AI orchestration
+ OpenAI Responses API
+ Stripe Checkout and Billing
+ Role-protected admin panel
```

The most important design decision is to place a stable Prometheus API between the browser extension and Make.com.

That API boundary allows the team to launch with low-code infrastructure while later replacing Make.com with a cloud backend without rebuilding the extension, authentication system, billing system, or user-facing API.
