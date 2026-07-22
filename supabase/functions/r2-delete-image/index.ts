import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { S3Client, DeleteObjectCommand } from "npm:@aws-sdk/client-s3@3.637.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
    const { imageId } = body as { imageId?: string };

    if (!imageId) {
      return jsonResponse({ error: "imageId is required" }, 400);
    }

    // Fetch the image record (only those with an r2_key are R2-managed)
    const { data: image, error: imageError } = await supabase
      .from("product_images")
      .select("id, product_id, r2_key, src")
      .eq("id", imageId)
      .maybeSingle();

    if (imageError) {
      return jsonResponse({ error: imageError.message }, 500);
    }
    if (!image) {
      return jsonResponse({ error: "Image not found" }, 404);
    }
    if (!image.r2_key) {
      return jsonResponse({ error: "This image is not R2-managed and cannot be deleted via R2" }, 400);
    }

    // Verify the parent product is manual (don't touch Printify)
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("source")
      .eq("id", image.product_id)
      .maybeSingle();

    if (productError) {
      return jsonResponse({ error: productError.message }, 500);
    }
    if (!product || product.source !== "manual") {
      return jsonResponse({ error: "R2 deletion is only allowed for manual products" }, 403);
    }

    // Delete from R2
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

    await s3.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: image.r2_key,
      }),
    );

    // Delete the database record
    const { error: deleteError } = await supabase
      .from("product_images")
      .delete()
      .eq("id", imageId);

    if (deleteError) {
      return jsonResponse({ error: deleteError.message }, 500);
    }

    return jsonResponse({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
