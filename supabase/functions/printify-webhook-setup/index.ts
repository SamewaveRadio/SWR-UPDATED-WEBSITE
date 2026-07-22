import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PRINTIFY_API_TOKEN = Deno.env.get("PRINTIFY_API_TOKEN");
const PRINTIFY_SHOP_ID = Deno.env.get("PRINTIFY_SHOP_ID");
const PRINTIFY_WEBHOOK_SECRET = Deno.env.get("PRINTIFY_WEBHOOK_SECRET");
const PRINTIFY_API_BASE = "https://api.printify.com/v1";

const WEBHOOK_TOPIC = "product:publish:started";
const WEBHOOK_URL = "https://samewaveradio.com/api/webhooks/printify";

interface PrintifyWebhook {
  id: string;
  topic: string;
  url: string;
  [key: string]: unknown;
}

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${PRINTIFY_API_TOKEN}`,
    "Content-Type": "application/json",
    "User-Agent": "SamewaveRadio-WebhookSetup/1.0",
  };
}

async function fetchExistingWebhooks(): Promise<PrintifyWebhook[]> {
  const url = `${PRINTIFY_API_BASE}/shops/${PRINTIFY_SHOP_ID}/webhooks.json`;
  const response = await fetch(url, { headers: authHeaders() });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Printify list webhooks failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  if (Array.isArray(data)) return data as PrintifyWebhook[];
  if (data && Array.isArray(data.data)) return data.data as PrintifyWebhook[];
  return [];
}

async function createWebhook(): Promise<PrintifyWebhook> {
  const url = `${PRINTIFY_API_BASE}/shops/${PRINTIFY_SHOP_ID}/webhooks.json`;
  const body = JSON.stringify({
    topic: WEBHOOK_TOPIC,
    url: WEBHOOK_URL,
    secret: PRINTIFY_WEBHOOK_SECRET,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: authHeaders(),
    body,
  });

  if (!response.ok) {
    const respBody = await response.text();
    throw new Error(`Printify create webhook failed (${response.status}): ${respBody}`);
  }

  return await response.json() as PrintifyWebhook;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!PRINTIFY_API_TOKEN || !PRINTIFY_SHOP_ID || !PRINTIFY_WEBHOOK_SECRET) {
    return new Response(
      JSON.stringify({ error: "Printify webhook secrets are not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const existing = await fetchExistingWebhooks();

    const duplicate = existing.find(
      (w) => w.topic === WEBHOOK_TOPIC && w.url === WEBHOOK_URL
    );

    if (duplicate) {
      return new Response(
        JSON.stringify({
          success: true,
          alreadyExists: true,
          webhook: {
            id: duplicate.id,
            topic: duplicate.topic,
            url: duplicate.url,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const created = await createWebhook();

    return new Response(
      JSON.stringify({
        success: true,
        alreadyExists: false,
        webhook: {
          id: created.id,
          topic: created.topic,
          url: created.url,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
