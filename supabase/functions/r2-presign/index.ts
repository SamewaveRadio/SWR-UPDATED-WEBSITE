import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3@3.637.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.637.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const PRESIGN_TTL_SECONDS = 60; // 1 minute

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const body = await req.json();
    const { productId, contentType, fileSize } = body as {
      productId?: string;
      contentType?: string;
      fileSize?: number;
    };

    if (!productId) {
      return jsonResponse({ error: "productId is required" }, 400);
    }
    if (!contentType || !ALLOWED_TYPES.includes(contentType)) {
      return jsonResponse({ error: "Only JPEG, PNG, and WebP images are allowed" }, 400);
    }
    if (!fileSize || fileSize <= 0 || fileSize > MAX_FILE_SIZE) {
      return jsonResponse({ error: "File size must be between 1 byte and 10 MB" }, 400);
    }

    // Verify the product exists and belongs to manual source (don't touch Printify)
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, source")
      .eq("id", productId)
      .maybeSingle();

    if (productError) {
      return jsonResponse({ error: productError.message }, 500);
    }
    if (!product) {
      return jsonResponse({ error: "Product not found" }, 404);
    }
    if (product.source !== "manual") {
      return jsonResponse({ error: "R2 uploads are only allowed for manual products" }, 403);
    }

    const ext = EXT_BY_TYPE[contentType];
    const objectKey = `shop/products/${productId}/${randomId()}.${ext}`;

    const accountId = Deno.env.get("R2_ACCOUNT_ID")!;
    const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID")!;
    const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY")!;
    const bucketName = Deno.env.get("R2_BUCKET_NAME")!;

    const s3 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      ContentType: contentType,
      ContentLength: fileSize,
    });

    const uploadUrl = await getSignedUrl(s3, command, {
      expiresIn: PRESIGN_TTL_SECONDS,
    });

    const publicBase = Deno.env.get("R2_PUBLIC_BASE_URL");
    const publicUrl = publicBase
      ? `${publicBase.replace(/\/$/, "")}/${objectKey}`
      : `${objectKey}`;

    return jsonResponse({
      uploadUrl,
      objectKey,
      publicUrl,
      headers: {
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
