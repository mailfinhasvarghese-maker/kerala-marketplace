

const encoder = new TextEncoder();
function tokenText(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return tokenText(bytes);
}
async function hashText(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return tokenText(new Uint8Array(digest));
}
async function derivePassword(password, salt) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({name:"PBKDF2",salt:encoder.encode(salt),iterations:210000,hash:"SHA-256"},key,256);
  return tokenText(new Uint8Array(bits));
}
async function ensureSchema(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS user_accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE COLLATE NOCASE, display_name TEXT NOT NULL, password_salt TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('customer','provider')), provider_id INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS user_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(account_id) REFERENCES user_accounts(id))").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry ON user_sessions(expires_at)").run();
  const additions = {booking_requests:[["customer_account_id","INTEGER"],["provider_response_at","TEXT"],["completed_at","TEXT"]],customer_reviews:[["booking_request_id","INTEGER"],["customer_account_id","INTEGER"]]};
  for (const [table, columns] of Object.entries(additions)) {
    const info = await db.prepare("PRAGMA table_info("+table+")").all();
    const names = new Set((info.results||[]).map(x=>x.name));
    for (const [name,type] of columns) if (!names.has(name)) await db.prepare("ALTER TABLE "+table+" ADD COLUMN "+name+" "+type).run();
  }
  await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_booking_unique ON customer_reviews(booking_request_id) WHERE booking_request_id IS NOT NULL").run();
}
async function getAccount(request, db) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;
  return await db.prepare("SELECT a.id,a.email,a.display_name,a.role,a.provider_id FROM user_sessions s JOIN user_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>datetime('now')").bind(await hashText(token)).first();
}
async function issueSession(accountId, db) {
  const token = randomToken();
  await db.prepare("INSERT INTO user_sessions (account_id,token_hash,expires_at) VALUES (?,?,datetime('now','+14 days'))").bind(accountId,await hashText(token)).run();
  return token;
}

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
      await ensureSchema(env.DB);
      // Protected schema inspection for safe, non-destructive upgrades.
      if (path === "/api/admin/schema" && request.method === "GET") {
        if (!env.ADMIN_API_KEY) {
          return respond({ error: "Admin authentication is not configured." }, 503);
        }
        if (request.headers.get("Authorization") !== `Bearer ${env.ADMIN_API_KEY}`) {
          return respond({ error: "Unauthorized." }, 401);
        }
        const tables = ["providers", "categories", "booking_requests", "customer_reviews"];
        const schema = {};
        for (const table of tables) {
          const exists = await env.DB.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
          ).bind(table).first();
          schema[table] = exists
            ? (await env.DB.prepare("PRAGMA table_info(" + table + ")").all()).results
            : [];
        }
        return respond({ schema });
      }

      // Database health check
      if (path === "/api/health" && request.method === "GET") {
        await env.DB.prepare("SELECT 1").first();

        return respond({
          ok: true,
          message: "Nattukaar database connected."
        });
      }

      if (path === "/api/auth/register" && request.method === "POST") {
        const body = await request.json();
        const email = String(body.email || "").trim().toLowerCase();
        const displayName = String(body.display_name || "").trim().slice(0,100);
        const password = String(body.password || "");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !displayName || password.length < 10 || password.length > 200) return respond({error:"Enter a valid email, your name, and a password of at least 10 characters."},400);
        if (await env.DB.prepare("SELECT id FROM user_accounts WHERE email=?").bind(email).first()) return respond({error:"An account with this email already exists. Please sign in."},409);
        const salt = randomToken();
        const passwordDigest = await derivePassword(password,salt);
        const result = await env.DB.prepare("INSERT INTO user_accounts (email,display_name,password_salt,password_hash,role) VALUES (?,?,?,?,'customer')").bind(email,displayName,salt,passwordDigest).run();
        const token = await issueSession(result.meta.last_row_id,env.DB);
        return respond({ok:true,token,account:{id:result.meta.last_row_id,email,display_name:displayName,role:"customer"}},201);
      }
      if (path === "/api/auth/login" && request.method === "POST") {
        const body = await request.json();
        const email = String(body.email||"").trim().toLowerCase();
        const password = String(body.password||"");
        const account = await env.DB.prepare("SELECT id,email,display_name,password_salt,password_hash,role,provider_id FROM user_accounts WHERE email=?").bind(email).first();
        if (!account || await derivePassword(password,account.password_salt) !== account.password_hash) return respond({error:"Email or password is incorrect."},401);
        const token = await issueSession(account.id,env.DB);
        return respond({ok:true,token,account:{id:account.id,email:account.email,display_name:account.display_name,role:account.role,provider_id:account.provider_id}});
      }
      if (path === "/api/auth/me" && request.method === "GET") {
        const account = await getAccount(request,env.DB);
        return account ? respond({account}) : respond({error:"Please sign in."},401);
      }
      if (path === "/api/auth/logout" && request.method === "POST") {
        const auth = request.headers.get("Authorization")||"";
        const token = auth.startsWith("Bearer ")?auth.slice(7).trim():"";
        if(token) await env.DB.prepare("DELETE FROM user_sessions WHERE token_hash=?").bind(await hashText(token)).run();
        return respond({ok:true,message:"Signed out."});
      }
      if (path === "/api/customer/bookings" && request.method === "GET") {
        const account = await getAccount(request,env.DB);
        if(!account || account.role!=="customer") return respond({error:"Sign in with a customer account."},401);
        const result = await env.DB.prepare("SELECT b.id,b.provider_id,p.business_name,b.service_date,b.service_location,b.details,b.status,b.created_at,CASE WHEN r.id IS NULL THEN 0 ELSE 1 END AS has_review FROM booking_requests b JOIN providers p ON p.id=b.provider_id LEFT JOIN customer_reviews r ON r.booking_request_id=b.id WHERE b.customer_account_id=? ORDER BY b.created_at DESC LIMIT 200").bind(account.id).all();
        return respond({bookings:result.results||[]});
      }
      if (path === "/api/provider/bookings" && request.method === "GET") {
        const account = await getAccount(request,env.DB);
        if(!account || account.role!=="provider" || !account.provider_id) return respond({error:"Sign in with a provider account."},401);
        const result = await env.DB.prepare("SELECT id,customer_name,customer_phone,customer_email,service_date,service_location,details,status,created_at FROM booking_requests WHERE provider_id=? ORDER BY created_at DESC LIMIT 200").bind(account.provider_id).all();
        return respond({bookings:result.results||[]});
      }
      if (path === "/api/provider/booking-status" && request.method === "POST") {
        const account = await getAccount(request,env.DB);
        if(!account || account.role!=="provider" || !account.provider_id) return respond({error:"Sign in with a provider account."},401);
        const body = await request.json();
        const id = Number.parseInt(body.booking_request_id,10);
        const status = String(body.status||"").toLowerCase();
        if(!Number.isInteger(id)||id<1||!["accepted","rejected","completed"].includes(status)) return respond({error:"Provide a booking and valid status."},400);
        const booking = await env.DB.prepare("SELECT id,status FROM booking_requests WHERE id=? AND provider_id=?").bind(id,account.provider_id).first();
        if(!booking) return respond({error:"Booking not found for this provider."},404);
        const current = String(booking.status||"").toLowerCase();
        if((["accepted","rejected"].includes(status)&&current!=="pending")||(status==="completed"&&current!=="accepted")) return respond({error:status==="completed"?"Only accepted bookings can be marked completed.":"Only pending bookings can be accepted or rejected."},409);
        await env.DB.prepare("UPDATE booking_requests SET status=?,provider_response_at=CASE WHEN ? IN ('accepted','rejected') THEN CURRENT_TIMESTAMP ELSE provider_response_at END,completed_at=CASE WHEN ?='completed' THEN CURRENT_TIMESTAMP ELSE completed_at END WHERE id=? AND provider_id=?").bind(status,status,status,id,account.provider_id).run();
        return respond({ok:true,booking_request_id:id,status});
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
          const account = await getAccount(request,env.DB);
          if(!account || account.role!=="customer") return respond({error:"Sign in with a customer account to rate a completed booking."},401);
          const body = await request.json();
          const bookingId = Number.parseInt(body.booking_request_id,10);
          const rating = Number.parseInt(body.rating,10);
          const reviewText = String(body.review_text||"").trim().slice(0,2000);
          if(!Number.isInteger(bookingId)||bookingId<1||!Number.isInteger(rating)||rating<1||rating>5||!reviewText) return respond({error:"Provide a completed booking, a 1–5 star rating and a written review."},400);
          const booking = await env.DB.prepare("SELECT id,provider_id,status,customer_account_id FROM booking_requests WHERE id=?").bind(bookingId).first();
          if(!booking || Number(booking.customer_account_id)!==Number(account.id)) return respond({error:"This booking does not belong to your account."},403);
          if(String(booking.status).toLowerCase()!=="completed") return respond({error:"You can rate only after the provider marks the booking completed."},409);
          if(await env.DB.prepare("SELECT id FROM customer_reviews WHERE booking_request_id=?").bind(bookingId).first()) return respond({error:"This booking has already been rated."},409);
          const result=await env.DB.prepare("INSERT INTO customer_reviews (provider_id,reviewer_name,rating,review_text,status,booking_request_id,customer_account_id) VALUES (?,?,?,?,'pending',?,?)").bind(booking.provider_id,account.display_name,rating,reviewText,bookingId,account.id).run();
          return respond({ok:true,review_id:result.meta.last_row_id,status:"pending",message:"Review submitted for moderation."},201);
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

      if (path === "/api/booking-requests" && request.method === "POST") {
        const account = await getAccount(request,env.DB);
        if(!account || account.role!=="customer") return respond({error:"Create a customer account or sign in before requesting a service."},401);
        const body=await request.json();
        const providerId=Number.parseInt(body.provider_id,10);
        const customerName=String(body.customer_name||account.display_name).trim().slice(0,100);
        const customerPhone=String(body.customer_phone||"").trim().slice(0,60);
        const serviceLocation=String(body.service_location||"").trim().slice(0,300);
        if(!Number.isInteger(providerId)||providerId<1||!customerName||!customerPhone||!serviceLocation) return respond({error:"A valid provider, customer name, phone and service location are required."},400);
        const provider=await env.DB.prepare("SELECT id FROM providers WHERE id=? AND status='active'").bind(providerId).first();
        if(!provider) return respond({error:"Active provider not found."},404);
        const result=await env.DB.prepare("INSERT INTO booking_requests (provider_id,customer_name,customer_phone,customer_email,service_date,service_location,details,status,customer_account_id) VALUES (?,?,?,?,?,?,?,'pending',?)").bind(providerId,customerName,customerPhone,account.email,String(body.service_date||"").trim()||null,serviceLocation,String(body.details||"").trim()||null,account.id).run();
        return respond({ok:true,message:"Booking request submitted.",booking_request_id:result.meta.last_row_id,status:"pending"},201);
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
