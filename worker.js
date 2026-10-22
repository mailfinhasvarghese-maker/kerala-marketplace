```javascript
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS configuration
    const origin = request.headers.get("Origin");
    const allowedOrigin = "https://kerala-marketplace.pages.dev";

    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
      ...(origin === allowedOrigin
        ? { "Access-Control-Allow-Origin": allowedOrigin }
        : {})
    };

    const respond = (data, status = 200) =>
      new Response(JSON.stringify(data), { status, headers });

    // Handle browser CORS preflight requests before checking the database.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (!env.DB) {
      return respond(
        { error: "Database binding DB is not configured." },
        500
      );
    }

    try {
      // Check database connectivity.
      if (path === "/api/health" && request.method === "GET") {
        await env.DB.prepare("SELECT 1").first();

        return respond({
          ok: true,
          message: "Nattukaar database connected."
        });
      }

      // List active providers.
      if (path === "/api/providers" && request.method === "GET") {
        const conditions = ["p.status = 'active'"];
        const values = [];

        const district = url.searchParams.get("district");
        const category = url.searchParams.get("category");
        const search = url.searchParams.get("q");

        if (district) {
          conditions.push("LOWER(p.district) = LOWER(?)");
          values.push(district);
        }

        if (category) {
          conditions.push(
            "(LOWER(c.slug) = LOWER(?) OR LOWER(c.name) = LOWER(?))"
          );
          values.push(category, category);
        }

        if (search) {
          conditions.push(
            "(p.business_name LIKE ? OR p.description LIKE ? OR p.town LIKE ? OR p.district LIKE ?)"
          );

          const term = "%" + search + "%";
          values.push(term, term, term, term);
        }

        const result = await env.DB.prepare(`
          SELECT
            p.id,
            p.business_name,
            p.contact_name,
            p.phone,
            p.email,
            p.district,
            p.town,
            p.address,
            p.description,
            p.years_experience,
            p.created_at,
            c.name AS category_name,
            c.slug AS category_slug,
            ROUND(
              AVG(CASE WHEN r.status = 'published' THEN r.rating END),
              1
            ) AS average_rating,
            COUNT(
              CASE WHEN r.status = 'published' THEN r.id END
            ) AS review_count
          FROM providers p
          LEFT JOIN categories c ON c.id = p.category_id
          LEFT JOIN reviews r ON r.provider_id = p.id
          WHERE ${conditions.join(" AND ")}
          GROUP BY p.id
          ORDER BY p.created_at DESC
          LIMIT 100
        `).bind(...values).all();

        return respond({
          providers: result.results || []
        });
      }

      // Register a provider for manual review.
      if (path === "/api/provider-register" && request.method === "POST") {
        const body = await request.json();

        const businessName = String(body.business_name || "").trim();
        const contactName = String(body.contact_name || "").trim();
        const phone = String(body.phone || "").trim();
        const district = String(body.district || "").trim();

        if (!businessName || !contactName || !phone || !district) {
          return respond({
            error:
              "Business name, contact name, phone and district are required."
          }, 400);
        }

        let categoryId = null;
        const categoryValue = String(body.category || "").trim();

        if (categoryValue) {
          const categoryRow = await env.DB.prepare(`
            SELECT id
            FROM categories
            WHERE LOWER(slug) = LOWER(?)
               OR LOWER(name) = LOWER(?)
            LIMIT 1
          `).bind(categoryValue, categoryValue).first();

          if (categoryRow) {
            categoryId = categoryRow.id;
          }
        }

        const result = await env.DB.prepare(`
          INSERT INTO providers (
            business_name,
            contact_name,
            phone,
            email,
            district,
            town,
            address,
            description,
            years_experience,
            category_id,
            status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `).bind(
          businessName,
          contactName,
          phone,
          String(body.email || "").trim() || null,
          district,
          String(body.town || "").trim() || null,
          String(body.address || "").trim() || null,
          String(body.description || "").trim() || null,
          Math.max(
            0,
            Number.parseInt(body.years_experience, 10) || 0
          ),
          categoryId
        ).run();

        return respond({
          ok: true,
          message: "Registration submitted for review.",
          provider_id: result.meta.last_row_id,
          status: "pending"
        }, 201);
      }

      // Submit a booking request to an active provider.
      if (
        path === "/api/booking-requests" &&
        request.method === "POST"
      ) {
        const body = await request.json();

        const providerId = Number.parseInt(body.provider_id, 10);
        const customerName = String(body.customer_name || "").trim();
        const customerPhone = String(body.customer_phone || "").trim();
        const serviceLocation = String(body.service_location || "").trim();

        if (
          !Number.isInteger(providerId) ||
          providerId < 1 ||
          !customerName ||
          !customerPhone ||
          !serviceLocation
        ) {
          return respond({
            error:
              "A valid provider, customer name, phone and service location are required."
          }, 400);
        }

        const provider = await env.DB.prepare(`
          SELECT id
          FROM providers
          WHERE id = ? AND status = 'active'
        `).bind(providerId).first();

        if (!provider) {
          return respond({
            error: "Active provider not found."
          }, 404);
        }

        const result = await env.DB.prepare(`
          INSERT INTO booking_requests (
            provider_id,
            customer_name,
            customer_phone,
            customer_email,
            service_date,
            service_location,
            details
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          providerId,
          customerName,
          customerPhone,
          String(body.customer_email || "").trim() || null,
          String(body.service_date || "").trim() || null,
          serviceLocation,
          String(body.details || "").trim() || null
        ).run();

        return respond({
          ok: true,
          message: "Booking request submitted.",
          booking_request_id: result.meta.last_row_id,
          status: "pending"
        }, 201);
      }

      return respond({
        error: "API endpoint not found."
      }, 404);

    } catch (error) {
      return respond({
        error: "The request could not be completed.",
        detail: error.message
      }, 500);
    }
  }
};
```
