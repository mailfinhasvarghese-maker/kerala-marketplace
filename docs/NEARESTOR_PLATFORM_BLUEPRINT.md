# Nearestor — Platform Foundation Blueprint

**Product direction:** One trusted, location-first marketplace for discovering and engaging with nearby businesses and services across Kerala.

**Brand:** Navy #173C69, teal #20B486, white #FFFFFF.

**Current stack:** Cloudflare Pages, Workers, D1 and R2. Existing customer/provider accounts, provider listings, dashboards, admin tools, service booking/quotation flow and reviews are valuable working assets. Extend them; do not replace them wholesale.

## 1. Product principles

1. Nearby first: search by current or selected location, locality, pincode, district and radius. Always allow manual location selection.
2. One account, multiple journeys: customers discover, enquire, book, save and review. Businesses manage multiple listings and branches from one workspace.
3. Request once, receive multiple quotes: a customer posts a service request; eligible nearby providers respond independently; the customer compares offers and selects one.
4. Trust first: business verification, transparent contact details, moderation, review eligibility, report/block tools and clear listing status.
5. English and Malayalam from the foundation. Use stable IDs, translated labels and search aliases. Browser translation alone is not sufficient.
6. Mobile-first, low-bandwidth and accessible. Fast pages, compressed images and progressive enhancement.
7. Free-first: basic listings and organic discovery remain useful without payment. Sponsored results must be labelled and must not silently displace relevance.

## 2. Marketplace divisions

Build one shared platform that can support:
- Shops and shopping: business profiles, product/catalogue listings, availability and enquiries.
- Home and professional services: profiles, request-once/multiple-quote workflow and bookings.
- Transport and rentals: vehicle/service listings and date-based enquiries.
- Food and hospitality: restaurants, menus, accommodation and enquiries.
- Property: rent/sale listings with structured attributes.
- Healthcare and education: provider/institution profiles, services, courses and appointment enquiries.
- Jobs and careers: employer profiles, job posts and applications.
- Local classifieds: moderated item listings and seller contact.

**Launch order:** shops/local businesses, home and professional services, transport/rentals. Keep the taxonomy extensible for the other divisions.

## 3. Information architecture

### Public experience
Home with location selector, universal search, division shortcuts, popular categories and nearby listings. Search results with filters, radius, sorting and pagination. Business profiles with contact, hours, map/address, gallery, products/services, branches and reviews. Listing detail pages with structured attributes and enquiry actions. A request board for multi-provider quotations. Customer area for requests, quotes, bookings, favourites, reviews and notification preferences.

### Business workspace
One business account manages its profile, branches, team members, listings, enquiries, quotations, bookings, reviews and performance. Staff permissions are scoped to the business.

### Administration
Moderation queue; customers, businesses, branches, listings, requests, quotations, bookings, reviews and reports; category/location taxonomy; featured placements; notification templates; roles and audit logs. Destructive actions are restricted and audited.

## 4. Data architecture

Do not create one giant table with hundreds of nullable columns. Use a common listing core plus type-specific detail tables or validated attributes.

**Preserve current entities:** providers, provider_images, user_accounts, user_sessions, categories, booking_requests, customer_reviews, job_roles and staff_access. Existing IDs and relationships must remain valid.

**Additive target model:**
- businesses: canonical business identity and owner relationship.
- business_members: team membership and scoped roles.
- business_branches: branch address, coordinates, phone and hours.
- category_translations/category_aliases: multilingual labels and search terms with stable category IDs.
- listings: owner, branch, category, listing type, title, description, status, locality, coordinates and timestamps.
- listing_media: R2 object key, media type, ordering and alt text.
- listing_attributes: typed/validated category-specific attributes.
- service_requests: customer request, category, description, location, radius, status and expiry.
- service_request_recipients: eligible providers reached by a request.
- quotations: provider response, amount/currency, message, validity and status.
- bookings: confirmed selection and lifecycle, introduced alongside current booking_requests with compatibility tests.
- favourites, notifications, reports, audit_logs, offers and subscriptions as workflows are added.

Use consistent ID strategy, UTC timestamps, explicit statuses, foreign keys, unique constraints and query-driven indexes. Do not use database IDs as authorization.

## 5. Location and discovery

Model state → district → local body/town → locality/pincode, with optional landmark. Store latitude/longitude separately from user-entered address. First release: indexed district/locality filtering plus a bounded coordinate box and exact distance calculation in the Worker. Require a maximum radius and result cap. Add indexes for status/category/location and common sort keys; use cursor pagination. Do not present approximate IP location as exact. Browser geolocation is optional and manual selection is always available. Map display is progressive enhancement; search must work without a map provider.

## 6. Search and language

Search business name, listing title, category, description, locality and curated aliases. Maintain Malayalam and English labels and aliases. Normalize Unicode and whitespace without destructive transliteration. Start with indexed D1 queries and curated aliases; add a dedicated search service only when measured scale/relevance justifies it. Centralize translations for validation, empty states, dashboards, emails and admin screens. User-generated content remains in its original language; translated UI labels are separate.

## 7. API and security standards

- Keep current Worker API compatible; add versioned, additive endpoints.
- Validate request bodies and query parameters; allowlist sort/filter fields; cap page size, text lengths, image sizes and request fan-out.
- Enforce ownership and business-member permissions server-side on every read/write.
- Rate-limit registration, login, enquiry, quote and review endpoints.
- Use generic public auth errors; never return raw exception details.
- Use secure expiring sessions, hash tokens at rest, rotate/revoke sessions, and review password hashing and CSRF/origin protections.
- Authorize R2 uploads, validate size/type and generate object keys; never trust user-supplied object paths.
- Keep secrets in Cloudflare secrets, never source code. Admin bootstrap must be one-time, protected and auditable.
- Add request IDs and structured logs without passwords, tokens or unnecessary personal data.

## 8. Performance and resilience

Compress/resize images, use responsive formats and lazy loading. Paginate every growing collection and avoid N+1 queries. Cache public taxonomy and safe public reads with explicit invalidation; never publicly cache private dashboards. Add health checks, migration checks, error monitoring and backup/export procedures. Optimize for slow mobile networks and older Android devices.

## 9. Monetisation — later

Optional labelled featured placement; business tiers for branches, staff, analytics and catalogue capacity; qualified lead packages after lead quality and consent controls are proven; booking commission only where the platform genuinely handles transactions. Never sell personal contact data or make unverified provider-quality claims.

## 10. Delivery roadmap

### Phase 0 — Stabilise and protect
Review open colour and multilingual work; confirm production/preview health, schema and customer/provider journeys; establish repeatable migrations, backups and rollback; add smoke tests for registration, login, listing, customer request, provider quote, booking and review.

### Phase 1 — Universal marketplace foundation
Additive schema for business/listing/location; category/subcategory taxonomy; validated listing CRUD APIs and ownership checks; radius-aware search, filters, cursor pagination and language aliases; compatibility adapters for existing provider cards and booking APIs.

### Phase 2 — Multi-provider request and quotation
One request can reach multiple eligible providers. Providers quote independently; customers compare/select. Add expiry, anti-spam limits, notifications and auditable state transitions.

### Phase 3 — Business workspace and catalogue
Profiles, branches, products/services, gallery, hours, offers, team permissions, favourites, enquiry history and analytics.

### Phase 4 — Additional divisions
Transport/rentals, food/hospitality, property, healthcare/education, jobs and classifieds through category-specific attributes and workflows.

### Phase 5 — Scale and monetisation
Search tuning, PWA enhancements, notification queues, featured listings, subscriptions and reporting based on measured demand.

## 11. Release gates

Do not merge to production until existing registration/login/provider dashboard/customer booking journeys pass; new endpoints have validation, authorization, pagination and safe errors; migrations are additive, repeatable and have backup/rollback instructions; English and Malayalam coverage is checked; mobile and slow-network behaviour is checked; Cloudflare preview build/deploy and smoke tests pass; and no feature branch triggers a production database migration or deployment.

## Immediate engineering task

Implement Phase 0 verification and Phase 1 as small reviewable PRs. First code change should be the additive schema/migration foundation and tests—not a full rewrite of worker.js or the homepage.
