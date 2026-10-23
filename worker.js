
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const origin = request.headers.get("Origin");
    const allowedOrigin = "https://kerala-marketplace.pages.dev";

    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Vary": "Origin",
      ...(origin === allowedOrigin
        ? { "Access-Control-Allow-Origin": allowedOrigin }
        : {})
    };

    const respond = (data, status = 200) =>
      new Response(JSON.stringify(data), { status, headers });

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
      // Database health check
      if (path === "/api/health" && request.method === "GET") {
        await env.DB.prepare("SELECT 1").first();

        return respond({
          ok: true,
          message: "Nattukaar database connected."
        });
      }

      // List and search active providers
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

        await env.DB.prepare(
          "CREATE TABLE IF NOT EXISTS customer_reviews (" +
          "id INTEGER PRIMARY KEY AUTOINCREMENT, provider_id INTEGER NOT NULL, " +
          "reviewer_name TEXT NOT NULL, rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5), " +
          "review_text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', " +
          "created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
          "FOREIGN KEY (provider_id) REFERENCES providers(id))"
        ).run();

        const sql =
          "SELECT " +
          "p.id, p.business_name, p.contact_name, p.phone, p.email, " +
          "p.district, p.town, p.address, p.description, " +
          "p.years_experience, p.created_at, " +
          "c.name AS category_name, c.slug AS category_slug, " +
          "ROUND(AVG(CASE WHEN r.status = 'published' THEN r.rating END), 1) AS average_rating, " +
          "COUNT(CASE WHEN r.status = 'published' THEN r.id END) AS review_count " +
          "FROM providers p " +
          "LEFT JOIN categories c ON c.id = p.category_id " +
          "LEFT JOIN customer_reviews r ON r.provider_id = p.id " +
          "WHERE " + conditions.join(" AND ") + " " +
          "GROUP BY p.id " +
          "ORDER BY p.created_at DESC " +
          "LIMIT 100";

        const result = await env.DB.prepare(sql)
          .bind(...values)
          .all();

        return respond({
          providers: result.results || []
        });
      }

      // Register a provider for manual review
      if (
        path === "/api/provider-register" &&
        request.method === "POST"
      ) {
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
        const submittedCategory = String(body.category || "").trim();
        const categoryAliases = {
          "taxi": "taxi-transportation",
          "rentals": "item-equipment-rentals",
          "workers": "labour-skilled-workers",
          "home services": "home-business-services"
        };
        const categoryKey = submittedCategory.toLowerCase();
        const categoryValue = categoryAliases[categoryKey] || submittedCategory;

        if (categoryValue) {
          const categorySql =
            "SELECT id FROM categories " +
            "WHERE LOWER(slug) = LOWER(?) " +
            "OR LOWER(name) = LOWER(?) LIMIT 1";

          const categoryRow = await env.DB.prepare(categorySql)
            .bind(categoryValue, categoryValue)
            .first();

          if (categoryRow) {
            categoryId = categoryRow.id;
          }
        }

        const insertSql =
          "INSERT INTO providers (" +
          "business_name, contact_name, phone, email, district, " +
          "town, address, description, years_experience, category_id, status" +
          ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')";

        const result = await env.DB.prepare(insertSql)
          .bind(
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
          )
          .run();

        return respond({
          ok: true,
          message: "Registration submitted for review.",
          provider_id: result.meta.last_row_id,
          status: "pending"
        }, 201);
      }

      // Protected admin: list pending provider registrations
      if (
        path === "/api/admin/providers" &&
        request.method === "GET"
      ) {
        if (!env.ADMIN_API_KEY) {
          return respond({ error: "Admin authentication is not configured." }, 503);
        }
        if (request.headers.get("Authorization") !== `Bearer ${env.ADMIN_API_KEY}`) {
          return respond({ error: "Unauthorized." }, 401);
        }

        const result = await env.DB.prepare(
          "SELECT p.id, p.business_name, p.contact_name, p.phone, p.email, " +
          "p.district, p.town, p.address, p.description, p.years_experience, " +
          "p.created_at, c.name AS category_name, c.slug AS category_slug " +
          "FROM providers p LEFT JOIN categories c ON c.id = p.category_id " +
          "WHERE p.status = 'pending' ORDER BY p.created_at ASC LIMIT 200"
        ).all();

        return respond({ providers: result.results || [] });
      }

      // Protected admin: activate or reject a pending provider
      if (
        path === "/api/admin/provider-status" &&
        request.method === "POST"
      ) {
        if (!env.ADMIN_API_KEY) {
          return respond({ error: "Admin authentication is not configured." }, 503);
        }
        if (request.headers.get("Authorization") !== `Bearer ${env.ADMIN_API_KEY}`) {
          return respond({ error: "Unauthorized." }, 401);
        }

        const body = await request.json();
        const providerId = Number.parseInt(body.provider_id, 10);
        const status = String(body.status || "").trim().toLowerCase();

        if (!Number.isInteger(providerId) || providerId < 1 ||
            !["active", "rejected"].includes(status)) {
          return respond({ error: "Provide a valid provider_id and status (active or rejected)." }, 400);
        }

        const result = await env.DB.prepare(
          "UPDATE providers SET status = ? WHERE id = ? AND status = 'pending'"
        ).bind(status, providerId).run();

        if (!result.meta || result.meta.changes !== 1) {
          return respond({ error: "Pending provider not found or already reviewed." }, 404);
        }

        return respond({
          ok: true,
          provider_id: providerId,
          status,
          message: status === "active" ? "Provider activated and now public." : "Provider rejected."
        });
      }

      // Customer reviews use their own table to avoid changing existing data.
      if (
        (path === "/api/reviews" && request.method === "POST") ||
        (path === "/api/admin/reviews" && request.method === "GET") ||
        (path === "/api/admin/review-status" && request.method === "POST")
      ) {
        await env.DB.prepare(
          "CREATE TABLE IF NOT EXISTS customer_reviews (" +
          "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
          "provider_id INTEGER NOT NULL, reviewer_name TEXT NOT NULL, " +
          "rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5), " +
          "review_text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', " +
          "created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
          "FOREIGN KEY (provider_id) REFERENCES providers(id))"
        ).run();
        await env.DB.prepare(
          "CREATE INDEX IF NOT EXISTS idx_customer_reviews_provider_status " +
          "ON customer_reviews(provider_id, status)"
        ).run();

        if (path === "/api/reviews" && request.method === "POST") {
          const body = await request.json();
          const providerId = Number.parseInt(body.provider_id, 10);
          const reviewerName = String(body.reviewer_name || "").trim().slice(0, 100);
          const rating = Number.parseInt(body.rating, 10);
          const reviewText = String(body.review_text || "").trim().slice(0, 2000);

          if (!Number.isInteger(providerId) || providerId < 1 ||
              !reviewerName || !Number.isInteger(rating) || rating < 1 || rating > 5 ||
              !reviewText) {
            return respond({ error: "Provide a provider, your name, a 1–5 star rating and a written review." }, 400);
          }

          const provider = await env.DB.prepare(
            "SELECT id FROM providers WHERE id = ? AND status = 'active'"
          ).bind(providerId).first();
          if (!provider) return respond({ error: "Active provider not found." }, 404);

          const result = await env.DB.prepare(
            "INSERT INTO customer_reviews (provider_id, reviewer_name, rating, review_text, status) " +
            "VALUES (?, ?, ?, ?, 'pending')"
          ).bind(providerId, reviewerName, rating, reviewText).run();

          return respond({
            ok: true,
            review_id: result.meta.last_row_id,
            status: "pending",
            message: "Review submitted for moderation."
          }, 201);
        }

        if (path === "/api/admin/reviews" && request.method === "GET") {
          if (!env.ADMIN_API_KEY) return respond({ error: "Admin authentication is not configured." }, 503);
          if (request.headers.get("Authorization") !== `Bearer ${env.ADMIN_API_KEY}`) {
            return respond({ error: "Unauthorized." }, 401);
          }

          const result = await env.DB.prepare(
            "SELECT r.id, r.provider_id, r.reviewer_name, r.rating, r.review_text, " +
            "r.status, r.created_at, p.business_name " +
            "FROM customer_reviews r JOIN providers p ON p.id = r.provider_id " +
            "WHERE r.status = 'pending' ORDER BY r.created_at ASC LIMIT 200"
          ).all();
          return respond({ reviews: result.results || [] });
        }

        if (path === "/api/admin/review-status" && request.method === "POST") {
          if (!env.ADMIN_API_KEY) return respond({ error: "Admin authentication is not configured." }, 503);
          if (request.headers.get("Authorization") !== `Bearer ${env.ADMIN_API_KEY}`) {
            return respond({ error: "Unauthorized." }, 401);
          }

          const body = await request.json();
          const reviewId = Number.parseInt(body.review_id, 10);
          const status = String(body.status || "").trim().toLowerCase();
          if (!Number.isInteger(reviewId) || reviewId < 1 ||
              !["published", "rejected"].includes(status)) {
            return respond({ error: "Provide a valid review_id and status (published or rejected)." }, 400);
          }
          const result = await env.DB.prepare(
            "UPDATE customer_reviews SET status = ? WHERE id = ? AND status = 'pending'"
          ).bind(status, reviewId).run();
          if (!result.meta || result.meta.changes !== 1) {
            return respond({ error: "Pending review not found or already reviewed." }, 404);
          }
          return respond({ ok: true, review_id: reviewId, status, message: status === "published" ? "Review published." : "Review rejected." });
        }
      }

      if (path === "/api/provider-reviews" && request.method === "GET") {
        const providerId = Number.parseInt(url.searchParams.get("provider_id"), 10);
        if (!Number.isInteger(providerId) || providerId < 1) {
          return respond({ error: "A valid provider_id is required." }, 400);
        }
        await env.DB.prepare(
          "CREATE TABLE IF NOT EXISTS customer_reviews (" +
          "id INTEGER PRIMARY KEY AUTOINCREMENT, provider_id INTEGER NOT NULL, " +
          "reviewer_name TEXT NOT NULL, rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5), " +
          "review_text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', " +
          "created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
          "FOREIGN KEY (provider_id) REFERENCES providers(id))"
        ).run();
        const result = await env.DB.prepare(
          "SELECT reviewer_name, rating, review_text, created_at FROM customer_reviews " +
          "WHERE provider_id = ? AND status = 'published' ORDER BY created_at DESC LIMIT 50"
        ).bind(providerId).all();
        return respond({ reviews: result.results || [] });
      }

      // Submit a booking request to an active provider
      if (
        path === "/api/booking-requests" &&
        request.method === "POST"
      ) {
        const body = await request.json();

        const providerId = Number.parseInt(body.provider_id, 10);
        const customerName = String(body.customer_name || "").trim();
        const customerPhone = String(body.customer_phone || "").trim();
        const serviceLocation = String(
          body.service_location || ""
        ).trim();

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

        const providerSql =
          "SELECT id FROM providers " +
          "WHERE id = ? AND status = 'active'";

        const provider = await env.DB.prepare(providerSql)
          .bind(providerId)
          .first();

        if (!provider) {
          return respond({
            error: "Active provider not found."
          }, 404);
        }

        const bookingSql =
          "INSERT INTO booking_requests (" +
          "provider_id, customer_name, customer_phone, customer_email, " +
          "service_date, service_location, details" +
          ") VALUES (?, ?, ?, ?, ?, ?, ?)";

        const result = await env.DB.prepare(bookingSql)
          .bind(
            providerId,
            customerName,
            customerPhone,
            String(body.customer_email || "").trim() || null,
            String(body.service_date || "").trim() || null,
            serviceLocation,
            String(body.details || "").trim() || null
          )
          .run();

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
