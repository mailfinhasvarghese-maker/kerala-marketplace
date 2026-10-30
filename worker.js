

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
  const bits = await crypto.subtle.deriveBits({name:"PBKDF2",salt:encoder.encode(salt),iterations:100000,hash:"SHA-256"},key,256);
  return tokenText(new Uint8Array(bits));
}
async function ensureSchema(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS provider_images (id INTEGER PRIMARY KEY AUTOINCREMENT, provider_id INTEGER NOT NULL, object_key TEXT NOT NULL UNIQUE, content_type TEXT NOT NULL DEFAULT 'image/jpeg', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(provider_id) REFERENCES providers(id))").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS user_accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE COLLATE NOCASE, display_name TEXT NOT NULL, password_salt TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('customer','provider')), provider_id INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS user_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(account_id) REFERENCES user_accounts(id))").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry ON user_sessions(expires_at)").run();
  const additions = {providers:[["latitude","REAL"],["longitude","REAL"]],booking_requests:[["customer_account_id","INTEGER"],["provider_response_at","TEXT"],["completed_at","TEXT"],["provider_quote","REAL"],["provider_quote_note","TEXT"],["customer_counter_offer","REAL"],["customer_counter_note","TEXT"]],customer_reviews:[["booking_request_id","INTEGER"],["customer_account_id","INTEGER"]]};
  for (const [table, columns] of Object.entries(additions)) {
    const info = await db.prepare("PRAGMA table_info("+table+")").all();
    const names = new Set((info.results||[]).map(x=>x.name));
    for (const [name,type] of columns) if (!names.has(name)) await db.prepare("ALTER TABLE "+table+" ADD COLUMN "+name+" "+type).run();
  }
  await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_booking_unique ON customer_reviews(booking_request_id) WHERE booking_request_id IS NOT NULL").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS job_roles (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE, description TEXT, permissions_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS staff_access (account_id INTEGER PRIMARY KEY, job_role_id INTEGER, is_main_admin INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(account_id) REFERENCES user_accounts(id), FOREIGN KEY(job_role_id) REFERENCES job_roles(id))").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE, slug TEXT NOT NULL UNIQUE COLLATE NOCASE, description TEXT, icon TEXT DEFAULT 'grid', active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 100, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  const catInfo = await db.prepare("PRAGMA table_info(categories)").all();
  const catCols = new Set((catInfo.results || []).map(x => x.name));
  for (const [n,t] of [["description","TEXT"],["name_ml","TEXT"],["icon","TEXT DEFAULT 'grid'"],["active","INTEGER NOT NULL DEFAULT 1"],["sort_order","INTEGER NOT NULL DEFAULT 100"]]) if (!catCols.has(n)) await db.prepare("ALTER TABLE categories ADD COLUMN "+n+" "+t).run();
}
async function getAccount(request, db) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;
  return await db.prepare("SELECT a.id,a.email,a.display_name,CASE WHEN sa.is_main_admin=1 THEN 'admin' WHEN sa.account_id IS NOT NULL THEN 'staff' ELSE a.role END AS role,a.provider_id,sa.job_role_id,COALESCE(jr.name,CASE WHEN sa.is_main_admin=1 THEN 'Main Admin' END) AS job_title,COALESCE(jr.permissions_json,CASE WHEN sa.is_main_admin=1 THEN '[\"*\"]' ELSE '[]' END) AS permissions_json,COALESCE(sa.is_main_admin,0) AS is_main_admin FROM user_sessions s JOIN user_accounts a ON a.id=s.account_id LEFT JOIN staff_access sa ON sa.account_id=a.id LEFT JOIN job_roles jr ON jr.id=sa.job_role_id WHERE s.token_hash=? AND s.expires_at>datetime('now')").bind(await hashText(token)).first();
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
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
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
        const tables = ["providers", "categories", "booking_requests", "customer_reviews", "user_accounts", "user_sessions"];
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
        const account = await env.DB.prepare("SELECT a.id,a.email,a.display_name,a.password_salt,a.password_hash,CASE WHEN sa.is_main_admin=1 THEN 'admin' WHEN sa.account_id IS NOT NULL THEN 'staff' ELSE a.role END AS role,a.provider_id,sa.job_role_id,COALESCE(jr.name,CASE WHEN sa.is_main_admin=1 THEN 'Main Admin' END) AS job_title,COALESCE(jr.permissions_json,CASE WHEN sa.is_main_admin=1 THEN '[\"*\"]' ELSE '[]' END) AS permissions_json,COALESCE(sa.is_main_admin,0) AS is_main_admin FROM user_accounts a LEFT JOIN staff_access sa ON sa.account_id=a.id LEFT JOIN job_roles jr ON jr.id=sa.job_role_id WHERE a.email=?").bind(email).first();
        if (!account || await derivePassword(password,account.password_salt) !== account.password_hash) return respond({error:"Email or password is incorrect."},401);
        const token = await issueSession(account.id,env.DB);
        return respond({ok:true,token,account:{id:account.id,email:account.email,display_name:account.display_name,role:account.role,provider_id:account.provider_id,job_role_id:account.job_role_id||null,job_title:account.job_title||null,permissions_json:account.permissions_json||"[]",is_main_admin:Number(account.is_main_admin||0)===1}});
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
        const result = await env.DB.prepare("SELECT b.id,b.provider_id,p.business_name,b.service_date,b.service_location,b.details,b.status,b.created_at,b.provider_quote,b.provider_quote_note,b.customer_counter_offer,b.customer_counter_note,CASE WHEN r.id IS NULL THEN 0 ELSE 1 END AS has_review FROM booking_requests b JOIN providers p ON p.id=b.provider_id LEFT JOIN customer_reviews r ON r.booking_request_id=b.id WHERE b.customer_account_id=? ORDER BY b.created_at DESC LIMIT 200").bind(account.id).all();
        return respond({bookings:result.results||[]});
      }
      // Provider-owned profile: retrieve and edit public business details and map pin.
      if (path === "/api/provider/profile" && request.method === "GET") {
        const account = await getAccount(request, env.DB);
        if (!account || account.role !== "provider" || !account.provider_id) return respond({error:"Sign in with a provider account."},401);
        const profile = await env.DB.prepare(
          "SELECT p.id,p.business_name,p.contact_name,p.phone,p.email,p.district,p.town,p.address,p.description,p.years_experience,p.latitude,p.longitude,p.status,c.name AS category_name,c.slug AS category_slug FROM providers p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=?"
        ).bind(account.provider_id).first();
        if (!profile) return respond({error:"Provider profile not found."},404);
        return respond({profile});
      }

      if (path === "/api/provider/profile" && request.method === "POST") {
        const account = await getAccount(request, env.DB);
        if (!account || account.role !== "provider" || !account.provider_id) return respond({error:"Sign in with a provider account."},401);
        const body = await request.json();
        const businessName = String(body.business_name||"").trim().slice(0,160);
        const contactName = String(body.contact_name||"").trim().slice(0,100);
        const phone = String(body.phone||"").trim().slice(0,60);
        const email = String(body.email||"").trim().toLowerCase().slice(0,200);
        const district = String(body.district||"").trim().slice(0,100);
        const town = String(body.town||"").trim().slice(0,120);
        const address = String(body.address||"").trim().slice(0,300);
        const description = String(body.description||"").trim().slice(0,2000);
        const years = Number.parseInt(body.years_experience,10);
        const lat = body.latitude === "" || body.latitude === null || body.latitude === undefined ? null : Number(body.latitude);
        const lng = body.longitude === "" || body.longitude === null || body.longitude === undefined ? null : Number(body.longitude);
        if (!businessName || !contactName || !phone || !district) return respond({error:"Business name, contact name, phone and district are required."},400);
        if ((lat !== null && (!Number.isFinite(lat)||lat < -90||lat > 90)) || (lng !== null && (!Number.isFinite(lng)||lng < -180||lng > 180)) || ((lat === null) !== (lng === null))) return respond({error:"Choose a valid map location, or clear both coordinates."},400);
        let categoryId = null;
        const category = String(body.category||"").trim();
        const aliases = {"taxi":"taxi-transportation","rentals":"item-equipment-rentals","workers":"labour-skilled-workers","home services":"home-business-services"};
        const categoryValue = aliases[category.toLowerCase()] || category;
        if (categoryValue) {
          const row = await env.DB.prepare("SELECT id FROM categories WHERE LOWER(slug)=LOWER(?) OR LOWER(name)=LOWER(?) LIMIT 1").bind(categoryValue,categoryValue).first();
          if (row) categoryId = row.id;
        }
        const current = await env.DB.prepare("SELECT status FROM providers WHERE id=?").bind(account.provider_id).first();
        if (!current) return respond({error:"Provider profile not found."},404);
        await env.DB.prepare(
          "UPDATE providers SET business_name=?,contact_name=?,phone=?,email=?,district=?,town=?,address=?,description=?,years_experience=?,category_id=?,latitude=?,longitude=? WHERE id=?"
        ).bind(businessName,contactName,phone,email||null,district,town||null,address||null,description||null,Number.isFinite(years)?Math.max(0,Math.min(80,years)):0,categoryId,lat,lng,account.provider_id).run();
        return respond({ok:true,message:"Provider profile saved. Public map and search details are updated.",status:current.status});
      }

      if (path === "/api/provider/images" && request.method === "GET") {
        const account = await getAccount(request, env.DB);
        if (!account || account.role !== "provider" || !account.provider_id) return respond({error:"Sign in with a provider account."},401);
        const rows = await env.DB.prepare("SELECT id, object_key, content_type, created_at FROM provider_images WHERE provider_id=? ORDER BY id").bind(account.provider_id).all();
        const images = [];
        for (const row of (rows.results||[])) {
          const object = await env.IMAGES?.get(row.object_key);
          if (!object) { images.push({id:row.id,url:"/api/provider-image?id="+row.id,created_at:row.created_at,available:false}); continue; }
          const bytes = new Uint8Array(await object.arrayBuffer());
          let binary = "";
          for (let i=0;i<bytes.length;i++) binary += String.fromCharCode(bytes[i]);
          images.push({id:row.id,url:"/api/provider-image?id="+row.id,data_url:"data:"+(row.content_type||"image/jpeg")+";base64,"+btoa(binary),created_at:row.created_at,available:true});
        }
        return respond({images});
      }

      if (path === "/api/provider/images" && request.method === "POST") {
        const account = await getAccount(request, env.DB);
        if (!account || account.role !== "provider" || !account.provider_id) return respond({error:"Sign in with a provider account."},401);
        if (!env.IMAGES) return respond({error:"Image storage is not configured. Please contact support."},503);
        const body = await request.json();
        const images = Array.isArray(body.images) ? body.images : [];
        const existingRows = await env.DB.prepare("SELECT id, object_key FROM provider_images WHERE provider_id=? ORDER BY id").bind(account.provider_id).all();
        const existing = existingRows.results || [];
        if (existing.length + images.length > 5) return respond({error:"You already have " + existing.length + " photo(s). You can add " + Math.max(0,5-existing.length) + " more. Delete a photo first if you want to replace it."},400);
        const prepared = [];
        for (const item of images) {
          const value = String(item && item.data_url || "");
          const match = value.match(/^data:image\/(?:jpeg|jpg|png|webp|gif|bmp|avif);base64,([A-Za-z0-9+/=]+)$/i);
          if (!match) return respond({error:"Each photo must be an image converted to JPEG before upload."},400);
          const binary = atob(match[1]);
          if (binary.length > 200 * 1024) return respond({error:"Each compressed photo must be 200 KB or smaller."},400);
          const bytes = new Uint8Array(binary.length);
          for (let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
          prepared.push(bytes);
        }
        const saved = [];
        for (const bytes of prepared) {
          const key = "providers/" + account.provider_id + "/" + crypto.randomUUID() + ".jpg";
          await env.IMAGES.put(key, bytes, {httpMetadata:{contentType:"image/jpeg"}});
          const row = await env.DB.prepare("INSERT INTO provider_images (provider_id,object_key,content_type) VALUES (?,?,'image/jpeg')").bind(account.provider_id,key).run();
          saved.push({id:row.meta.last_row_id,url:"/api/provider-image?id="+row.meta.last_row_id});
        }
        return respond({ok:true,message:"Photo(s) added successfully.",images:saved});
      }

      if (path === "/api/provider/images" && request.method === "DELETE") {
        const account = await getAccount(request, env.DB);
        if (!account || account.role !== "provider" || !account.provider_id) return respond({error:"Sign in with a provider account."},401);
        if (!env.IMAGES) return respond({error:"Image storage is not configured. Please contact support."},503);
        const imageId = Number.parseInt(url.searchParams.get("id"),10);
        if (!Number.isInteger(imageId) || imageId < 1) return respond({error:"Choose a valid photo to delete."},400);
        const image = await env.DB.prepare("SELECT id,object_key FROM provider_images WHERE id=? AND provider_id=?").bind(imageId,account.provider_id).first();
        if (!image) return respond({error:"Photo not found for this account."},404);
        await env.IMAGES.delete(image.object_key);
        await env.DB.prepare("DELETE FROM provider_images WHERE id=? AND provider_id=?").bind(imageId,account.provider_id).run();
        return respond({ok:true,message:"Photo deleted."});
      }

      if (path === "/api/provider/bookings" && request.method === "GET") {
        const account = await getAccount(request,env.DB);
        if(!account || account.role!=="provider" || !account.provider_id) return respond({error:"Sign in with a provider account."},401);
        const result = await env.DB.prepare("SELECT id,customer_name,customer_phone,customer_email,service_date,service_location,details,status,created_at,provider_quote,provider_quote_note,customer_counter_offer,customer_counter_note FROM booking_requests WHERE provider_id=? ORDER BY created_at DESC LIMIT 200").bind(account.provider_id).all();
        return respond({bookings:result.results||[]});
      }
      if (path === "/api/provider/booking-quote" && request.method === "POST") {
        const account = await getAccount(request,env.DB);
        if(!account || account.role!=="provider" || !account.provider_id) return respond({error:"Sign in with a provider account."},401);
        const body = await request.json();
        const id = Number.parseInt(body.booking_request_id,10);
        const quote = Number(body.quote);
        const note = String(body.note||"").trim().slice(0,1000);
        if(!Number.isInteger(id)||id<1||!Number.isFinite(quote)||quote<0||quote>100000000) return respond({error:"Enter a valid payment amount."},400);
        const booking = await env.DB.prepare("SELECT id,status FROM booking_requests WHERE id=? AND provider_id=?").bind(id,account.provider_id).first();
        if(!booking) return respond({error:"Booking not found for this provider."},404);
        if(!["pending","accepted"].includes(String(booking.status).toLowerCase())) return respond({error:"A quote can be sent only for pending or accepted bookings."},409);
        await env.DB.prepare("UPDATE booking_requests SET provider_quote=?,provider_quote_note=? WHERE id=? AND provider_id=?").bind(quote,note||null,id,account.provider_id).run();
        return respond({ok:true,booking_request_id:id,provider_quote:quote,provider_quote_note:note});
      }
      if (path === "/api/customer/booking-counter-offer" && request.method === "POST") {
        const account = await getAccount(request,env.DB);
        if(!account || account.role!=="customer") return respond({error:"Sign in with a customer account."},401);
        const body = await request.json();
        const id = Number.parseInt(body.booking_request_id,10);
        const offer = Number(body.offer);
        const note = String(body.note||"").trim().slice(0,1000);
        if(!Number.isInteger(id)||id<1||!Number.isFinite(offer)||offer<0||offer>100000000) return respond({error:"Enter a valid counter-offer amount."},400);
        const booking = await env.DB.prepare("SELECT id,status FROM booking_requests WHERE id=? AND customer_account_id=?").bind(id,account.id).first();
        if(!booking) return respond({error:"Booking not found for this customer account."},404);
        if(!["pending","accepted"].includes(String(booking.status).toLowerCase())) return respond({error:"A counter-offer can be sent only for pending or accepted bookings."},409);
        await env.DB.prepare("UPDATE booking_requests SET customer_counter_offer=?,customer_counter_note=? WHERE id=? AND customer_account_id=?").bind(offer,note||null,id,account.id).run();
        return respond({ok:true,booking_request_id:id,customer_counter_offer:offer,customer_counter_note:note});
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
      if (path === "/api/provider-image" && request.method === "GET") {
        const imageId = Number.parseInt(url.searchParams.get("id"), 10);
        if (!Number.isInteger(imageId) || imageId < 1 || !env.IMAGES) {
          return new Response("Image not found.", { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
        }
        const imageAccount = await getAccount(request, env.DB);
        const imagePermissions = (()=>{try{return JSON.parse(imageAccount?.permissions_json||"[]")}catch{return []}})();
        const imageCanReview = !!imageAccount && ((imageAccount.role==="admin" && Number(imageAccount.is_main_admin)===1) || (imageAccount.role==="staff" && imagePermissions.includes("review_providers")));
        const imageRow = await env.DB.prepare(
          "SELECT i.object_key, i.content_type, i.provider_id, p.status FROM provider_images i JOIN providers p ON p.id=i.provider_id WHERE i.id=?"
        ).bind(imageId).first();
        const isOwner = !!imageAccount && imageAccount.role==="provider" && Number(imageAccount.provider_id)===Number(imageRow?.provider_id);
        const isPublic = String(imageRow?.status||"").toLowerCase()==="active";
        if (!imageRow || (!imageCanReview && !isOwner && !isPublic)) {
          return new Response("Image not found.", { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
        }
        const object = await env.IMAGES.get(imageRow.object_key);
        if (!object) return new Response("Image not found.", { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
        return new Response(object.body, { status: 200, headers: {
          "Content-Type": imageRow.content_type || "image/jpeg",
          "Cache-Control": "public, max-age=86400",
          "X-Content-Type-Options": "nosniff"
        }});
      }

      if (path === "/api/categories" && request.method === "GET") {
        const result = await env.DB.prepare("SELECT id,name,name_ml,slug,description,icon,sort_order FROM categories WHERE active=1 ORDER BY sort_order,name").all();
        return respond({categories:result.results||[]});
      }
      if (path === "/api/admin/bootstrap" && request.method === "POST") {
        if (!env.ADMIN_API_KEY || request.headers.get("Authorization") !== "Bearer "+env.ADMIN_API_KEY) return respond({error:"Unauthorized."},401);
        if (await env.DB.prepare("SELECT account_id FROM staff_access WHERE is_main_admin=1 LIMIT 1").first()) return respond({error:"Main admin already exists."},409);
        const body=await request.json();
        const email=String(body.email||"").trim().toLowerCase(), displayName=String(body.display_name||"").trim().slice(0,100), password=String(body.password||"");
        if(!email.includes("@")||!displayName||password.length<10||password.length>200) return respond({error:"Enter a valid email, name and password of at least 10 characters."},400);
        if(await env.DB.prepare("SELECT id FROM user_accounts WHERE email=?").bind(email).first()) return respond({error:"That email already belongs to an account. Use another email."},409);
        const salt=randomToken(), digest=await derivePassword(password,salt);
        const account=await env.DB.prepare("INSERT INTO user_accounts (email,display_name,password_salt,password_hash,role) VALUES (?,?,?,?,?)").bind(email,displayName,salt,digest,"customer").run();
        await env.DB.prepare("INSERT INTO staff_access (account_id,job_role_id,is_main_admin) VALUES (?,NULL,1)").bind(account.meta.last_row_id).run();
        return respond({ok:true,message:"Main admin created. Sign in using these account credentials."},201);
      }
      const sessionAccount = await getAccount(request,env.DB);
      const sessionPermissions = (()=>{try{return JSON.parse(sessionAccount?.permissions_json||"[]")}catch{return []}})();
      const isMainAdmin = !!sessionAccount && sessionAccount.role==="admin" && Number(sessionAccount.is_main_admin)===1;
      const canManageCategories = isMainAdmin || (!!sessionAccount && sessionAccount.role==="staff" && sessionPermissions.includes("manage_categories"));
      const canManageRoles = isMainAdmin || (!!sessionAccount && sessionAccount.role==="staff" && sessionPermissions.includes("manage_roles"));
      const canManageStaff = isMainAdmin || (!!sessionAccount && sessionAccount.role==="staff" && sessionPermissions.includes("manage_staff"));
      const canReviewProviders = isMainAdmin || (!!sessionAccount && sessionAccount.role==="staff" && sessionPermissions.includes("review_providers"));
      if (path === "/api/admin/categories" && request.method === "GET") {
        if(!canManageCategories)return respond({error:"You do not have permission to manage categories."},403);
        const result=await env.DB.prepare("SELECT id,name,name_ml,slug,description,icon,active,sort_order FROM categories ORDER BY sort_order,name").all();
        return respond({categories:result.results||[]});
      }
      if (path === "/api/admin/categories" && request.method === "POST") {
        if(!canManageCategories)return respond({error:"You do not have permission to manage categories."},403);
        const body=await request.json();
        const id=Number.parseInt(body.id,10)||0, name=String(body.name||"").trim().slice(0,100), nameMl=String(body.name_ml||"").trim().slice(0,100), description=String(body.description||"").trim().slice(0,300), icon=String(body.icon||"grid").trim(), active=body.active===false?0:1, sortOrder=Number.parseInt(body.sort_order,10)||100;
        if(icon!=="grid"&&(!icon.startsWith("data:image/png;base64,")||icon.length>82000||!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(icon)))return respond({error:"Category icon must be a PNG image no larger than 60 KB."},400);
        const slug=String(body.slug||name).trim().toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,100);
        if(!name||!slug)return respond({error:"Category name is required."},400);
        try { if(id>0) await env.DB.prepare("UPDATE categories SET name=?,name_ml=?,slug=?,description=?,icon=?,active=?,sort_order=? WHERE id=?").bind(name,nameMl||null,slug,description,icon,active,sortOrder,id).run(); else await env.DB.prepare("INSERT INTO categories (name,name_ml,slug,description,icon,active,sort_order) VALUES (?,?,?,?,?,?,?)").bind(name,nameMl||null,slug,description,icon,active,sortOrder).run(); return respond({ok:true,message:id>0?"Category updated.":"Category created."}); } catch(error) { if(String(error.message||"").includes("UNIQUE"))return respond({error:"Category name or slug already exists."},409); throw error; }
      }
      if (path === "/api/admin/categories" && request.method === "DELETE") {
        if(!isMainAdmin)return respond({error:"Only the super admin can permanently delete categories."},403);
        const id=Number.parseInt(url.searchParams.get("id"),10);
        if(!Number.isInteger(id)||id<1)return respond({error:"A valid category ID is required."},400);
        const linked=await env.DB.prepare("SELECT COUNT(*) AS total FROM providers WHERE category_id=?").bind(id).first();
        if(Number(linked?.total||0)>0)return respond({error:"This category is assigned to "+linked.total+" provider(s). Reassign those providers or deactivate the category instead."},409);
        const deleted=await env.DB.prepare("DELETE FROM categories WHERE id=?").bind(id).run();
        if(!deleted.meta?.changes)return respond({error:"Category not found."},404);
        return respond({ok:true,message:"Category deleted."});
      }
      if (path === "/api/admin/providers" && request.method === "GET") {
        if(!canReviewProviders)return respond({error:"You do not have permission to review provider applications."},403);
        const result=await env.DB.prepare("SELECT p.id,p.business_name,p.contact_name,p.phone,p.email,p.district,p.town,p.address,p.description,p.years_experience,p.category_id,p.latitude,p.longitude,p.status,p.created_at,c.name AS category_name FROM providers p LEFT JOIN categories c ON c.id=p.category_id ORDER BY p.created_at DESC LIMIT 500").all();
        const providers=result.results||[];
        if(providers.length){
          const ids=providers.map(p=>p.id), placeholders=ids.map(()=>"?").join(",");
          const images=await env.DB.prepare("SELECT id,provider_id,object_key,content_type,created_at FROM provider_images WHERE provider_id IN ("+placeholders+") ORDER BY id").bind(...ids).all();
          const grouped=new Map();
          for(const image of (images.results||[])){
            if(!grouped.has(image.provider_id))grouped.set(image.provider_id,[]);
            const object=await env.IMAGES?.get(image.object_key);
            let dataUrl=null;
            if(object){const bytes=new Uint8Array(await object.arrayBuffer());let binary="";for(let i=0;i<bytes.length;i++)binary+=String.fromCharCode(bytes[i]);dataUrl="data:"+(image.content_type||"image/jpeg")+";base64,"+btoa(binary);}
            grouped.get(image.provider_id).push({id:image.id,url:"/api/provider-image?id="+image.id,data_url:dataUrl,created_at:image.created_at,available:!!object});
          }
          for(const provider of providers)provider.images=grouped.get(provider.id)||[];
        }else{}
        return respond({providers});
      }
      if (path === "/api/admin/providers" && request.method === "PATCH") {
        if(!canReviewProviders)return respond({error:"You do not have permission to review provider applications."},403);
        const b=await request.json(),id=Number.parseInt(b.id,10);
        if(!isMainAdmin){
          const status=String(b.status||"");
          if(!["active","rejected"].includes(status))return respond({error:"Reviewers may only approve/publish or reject provider applications."},400);
          const updated=await env.DB.prepare("UPDATE providers SET status=? WHERE id=? AND status='pending'").bind(status,id).run();
          if(!updated.meta?.changes)return respond({error:"Pending provider not found or already reviewed."},404);
          return respond({ok:true,message:status==="active"?"Provider approved and published.":"Provider rejected and kept hidden."});
        }
        if(!Number.isInteger(id)||id<1)return respond({error:"A valid provider ID is required."},400);
        const business=String(b.business_name||"").trim().slice(0,160),contact=String(b.contact_name||"").trim().slice(0,120),phone=String(b.phone||"").trim().slice(0,40),email=String(b.email||"").trim().toLowerCase().slice(0,254),district=String(b.district||"").trim().slice(0,100),town=String(b.town||"").trim().slice(0,100),address=String(b.address||"").trim().slice(0,300),description=String(b.description||"").trim().slice(0,2000),years=Number.parseInt(b.years_experience,10)||0,status=String(b.status||"pending"),categoryId=Number.parseInt(b.category_id,10)||null,lat=b.latitude===""||b.latitude==null?null:Number(b.latitude),lng=b.longitude===""||b.longitude==null?null:Number(b.longitude);
        if(!business||!contact||!phone||!email)return respond({error:"Business name, contact name, phone and email are required."},400);
        if(!["pending","active","rejected"].includes(status))return respond({error:"Invalid provider status."},400);
        if((lat!==null&&!Number.isFinite(lat))||(lng!==null&&!Number.isFinite(lng))||(lat!==null&&(lat < -90||lat>90))||(lng!==null&&(lng < -180||lng>180)))return respond({error:"Enter valid latitude and longitude coordinates."},400);
        if(categoryId!==null){const category=await env.DB.prepare("SELECT id FROM categories WHERE id=?").bind(categoryId).first();if(!category)return respond({error:"Selected category was not found."},400);}
        const updated=await env.DB.prepare("UPDATE providers SET business_name=?,contact_name=?,phone=?,email=?,district=?,town=?,address=?,description=?,years_experience=?,category_id=?,latitude=?,longitude=?,status=? WHERE id=?").bind(business,contact,phone,email,district,town,address,description,years,categoryId,lat,lng,status,id).run();
        if(!updated.meta?.changes)return respond({error:"Provider not found or no changes were made."},404);
        return respond({ok:true,message:"Provider updated."});
      }
      if (path === "/api/admin/providers" && request.method === "DELETE") {
        if(!isMainAdmin)return respond({error:"Only the super admin can delete providers."},403);
        const id=Number.parseInt(url.searchParams.get("id"),10);
        if(!Number.isInteger(id)||id<1)return respond({error:"A valid provider ID is required."},400);
        const exists=await env.DB.prepare("SELECT id FROM providers WHERE id=?").bind(id).first();
        if(!exists)return respond({error:"Provider not found."},404);
        const bookings=await env.DB.prepare("SELECT COUNT(*) AS total FROM booking_requests WHERE provider_id=?").bind(id).first();
        const reviews=await env.DB.prepare("SELECT COUNT(*) AS total FROM customer_reviews WHERE provider_id=?").bind(id).first();
        if(Number(bookings?.total||0)>0||Number(reviews?.total||0)>0)return respond({error:"This provider has booking or review history. Change the provider status to rejected to remove them from public listings while preserving records."},409);
        await env.DB.prepare("DELETE FROM provider_images WHERE provider_id=?").bind(id).run();
        await env.DB.prepare("UPDATE user_accounts SET provider_id=NULL,role='customer' WHERE provider_id=?").bind(id).run();
        await env.DB.prepare("DELETE FROM providers WHERE id=?").bind(id).run();
        return respond({ok:true,message:"Provider deleted."});
      }
      if (path === "/api/admin/job-roles" && request.method === "GET") {
        if(!canManageRoles)return respond({error:"You do not have permission to manage job roles."},403);
        const result=await env.DB.prepare("SELECT id,name,description,permissions_json,created_at FROM job_roles ORDER BY name").all();
        return respond({roles:(result.results||[]).map(x=>({...x,permissions:(()=>{try{return JSON.parse(x.permissions_json)}catch{return []}})()}))});
      }
      if (path === "/api/admin/job-roles" && request.method === "POST") {
        if(!canManageRoles)return respond({error:"You do not have permission to manage job roles."},403);
        const body=await request.json(), name=String(body.name||"").trim().slice(0,100), description=String(body.description||"").trim().slice(0,300);
        const allowed=["manage_categories","manage_roles","manage_staff","review_providers","moderate_reviews","view_bookings"];
        const permissions=Array.isArray(body.permissions)?[...new Set(body.permissions.filter(x=>allowed.includes(x)))]:[];
        if(!name)return respond({error:"Job role name is required."},400);
        try { await env.DB.prepare("INSERT INTO job_roles (name,description,permissions_json) VALUES (?,?,?)").bind(name,description,JSON.stringify(permissions)).run(); return respond({ok:true,message:"Job role created."},201); } catch(error) { if(String(error.message||"").includes("UNIQUE"))return respond({error:"A job role with that name already exists."},409); throw error; }
      }
      if (path === "/api/admin/staff" && request.method === "POST") {
        if(!canManageStaff)return respond({error:"You do not have permission to manage staff accounts."},403);
        const body=await request.json(), email=String(body.email||"").trim().toLowerCase(), displayName=String(body.display_name||"").trim().slice(0,100), password=String(body.password||""), roleId=Number.parseInt(body.job_role_id,10);
        if(!email.includes("@")||!displayName||password.length<10||password.length>200||!Number.isInteger(roleId))return respond({error:"Enter a valid email, name, password of 10+ characters and job role."},400);
        if(await env.DB.prepare("SELECT id FROM user_accounts WHERE email=?").bind(email).first())return respond({error:"An account with this email already exists."},409);
        if(!await env.DB.prepare("SELECT id FROM job_roles WHERE id=?").bind(roleId).first())return respond({error:"Choose an existing job role."},400);
        const salt=randomToken(), digest=await derivePassword(password,salt);
        const account=await env.DB.prepare("INSERT INTO user_accounts (email,display_name,password_salt,password_hash,role) VALUES (?,?,?,?,?)").bind(email,displayName,salt,digest,"customer").run();
        await env.DB.prepare("INSERT INTO staff_access (account_id,job_role_id,is_main_admin) VALUES (?,?,0)").bind(account.meta.last_row_id,roleId).run();
        return respond({ok:true,message:"Staff account created."},201);
      }
      if (path === "/api/admin/job-roles" && request.method === "PATCH") {
        if(!canManageRoles)return respond({error:"You do not have permission to manage job roles."},403);
        const body=await request.json(), id=Number.parseInt(body.id,10), name=String(body.name||"").trim().slice(0,100), description=String(body.description||"").trim().slice(0,300), allowed=["manage_categories","manage_roles","manage_staff","review_providers","moderate_reviews","view_bookings"], permissions=Array.isArray(body.permissions)?[...new Set(body.permissions.filter(x=>allowed.includes(x)))]:[];
        if(!Number.isInteger(id)||id<1||!name)return respond({error:"Role ID and name are required."},400);
        await env.DB.prepare("UPDATE job_roles SET name=?,description=?,permissions_json=? WHERE id=?").bind(name,description,JSON.stringify(permissions),id).run();
        return respond({ok:true,message:"Job role updated."});
      }
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
          "p.district, p.town, p.address, p.description, p.latitude, p.longitude, " +
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

        const providers = result.results || [];
        if (providers.length) {
          const ids = providers.map(p => p.id);
          const placeholders = ids.map(() => "?").join(",");
          const imageRows = await env.DB.prepare(
            "SELECT id, provider_id FROM provider_images WHERE provider_id IN (" + placeholders + ") ORDER BY id"
          ).bind(...ids).all();
          const byProvider = new Map();
          for (const image of (imageRows.results || [])) {
            if (!byProvider.has(image.provider_id)) byProvider.set(image.provider_id, []);
            byProvider.get(image.provider_id).push({ id: image.id, url: "/api/provider-image?id=" + image.id });
          }
          for (const provider of providers) provider.images = byProvider.get(provider.id) || [];
        }
        return respond({ providers });
      }

      // Register a provider for manual review
      if (
        path === "/api/provider-register" &&
        request.method === "POST"
      ) {
        const body = await request.json();

        const accountEmail = String(body.email || "").trim().toLowerCase();
        const accountPassword = String(body.password || "");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountEmail) || accountPassword.length < 10 || accountPassword.length > 200) {
          return respond({error:"A valid email and password of at least 10 characters are required to create your provider account."},400);
        }
        if (await env.DB.prepare("SELECT id FROM user_accounts WHERE email = ?").bind(accountEmail).first()) {
          return respond({error:"An account with this email already exists. Please sign in with another email."},409);
        }
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
          "town, address, description, years_experience, category_id, status, latitude, longitude" +
          ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)";

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
            categoryId,
            Number.isFinite(Number(body.latitude)) && body.latitude !== "" && Number(body.latitude) >= -90 && Number(body.latitude) <= 90 ? Number(body.latitude) : null,
            Number.isFinite(Number(body.longitude)) && body.longitude !== "" && Number(body.longitude) >= -180 && Number(body.longitude) <= 180 ? Number(body.longitude) : null
          )
          .run();

        const providerId = result.meta.last_row_id;
        const salt = randomToken();
        const passwordDigest = await derivePassword(accountPassword, salt);
        const accountResult = await env.DB.prepare("INSERT INTO user_accounts (email,display_name,password_salt,password_hash,role,provider_id) VALUES (?,?,?,?, 'provider', ?)").bind(accountEmail,contactName,salt,passwordDigest,providerId).run();
        const token = await issueSession(accountResult.meta.last_row_id, env.DB);
        return respond({
          ok: true,
          message: "Provider registration submitted for review. Your provider account is ready.",
          provider_id: providerId,
          status: "pending",
          token,
          account: {id:accountResult.meta.last_row_id,email:accountEmail,display_name:contactName,role:"provider",provider_id:providerId}
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
