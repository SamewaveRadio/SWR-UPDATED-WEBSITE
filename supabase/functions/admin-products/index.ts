import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface VariantInput {
  id?: string;
  sku?: string;
  title: string;
  options?: Record<string, string>;
  priceCents?: number;
  position?: number;
  isEnabled?: boolean;
  inventoryQuantity?: number;
  colorwayId?: string | null;
}

interface ImageInput {
  id?: string;
  src: string;
  alt?: string;
  position?: number;
  r2Key?: string | null;
  colorwayId?: string | null;
  isPrimary?: boolean;
}

interface ColorwayInput {
  id?: string;
  name: string;
  slug?: string;
  hexColor?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

interface ProductInput {
  id?: string;
  slug?: string;
  title: string;
  description?: string;
  source: 'printify' | 'manual';
  basePriceCents?: number;
  currency?: string;
  sku?: string;
  category?: string;
  tags?: string[];
  shippingClass?: string;
  visibility?: 'public' | 'unlisted' | 'draft' | 'archived';
  trackInventory?: boolean;
  allowBackorders?: boolean;
  password?: string | null;
  variants?: VariantInput[];
  images?: ImageInput[];
  colorways?: ColorwayInput[];
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const url = new URL(req.url);
    const method = req.method;

    // GET: list all products (admin) or get single product
    if (method === "GET") {
      const productId = url.searchParams.get("id");

      if (productId) {
        const { data: product, error } = await supabase
          .from("products")
          .select("*")
          .eq("id", productId)
          .maybeSingle();

        if (error) return jsonResponse({ error: error.message }, 500);
        if (!product) return jsonResponse({ error: "Product not found" }, 404);

        const { data: variants } = await supabase
          .from("product_variants")
          .select("*")
          .eq("product_id", product.id)
          .order("position", { ascending: true });

        const { data: images } = await supabase
          .from("product_images")
          .select("*")
          .eq("product_id", product.id)
          .order("position", { ascending: true });

        const { data: colorways } = await supabase
          .from("product_colorways")
          .select("*")
          .eq("product_id", product.id)
          .order("sort_order", { ascending: true });

        const variantIds = (variants ?? []).map((v: any) => v.id);
        let inventoryMap: Record<string, number> = {};
        if (variantIds.length > 0) {
          const { data: inventory } = await supabase
            .from("inventory_transactions")
            .select("variant_id, quantity")
            .in("variant_id", variantIds);
          for (const tx of inventory ?? []) {
            inventoryMap[tx.variant_id] = (inventoryMap[tx.variant_id] ?? 0) + tx.quantity;
          }
        }

        return jsonResponse({
          product,
          variants: variants ?? [],
          images: images ?? [],
          colorways: colorways ?? [],
          inventory: inventoryMap,
        });
      }

      // List all products
      const { data: products, error } = await supabase
        .from("products")
        .select("id, slug, title, source, base_price_cents, visibility, updated_at, shipping_class, track_inventory, allow_backorders")
        .order("updated_at", { ascending: false });

      if (error) return jsonResponse({ error: error.message }, 500);

      const productIds = (products ?? []).map((p: any) => p.id);
      let primaryImages: Record<string, string> = {};
      let inventoryStatuses: Record<string, string> = {};

      if (productIds.length > 0) {
        const { data: images } = await supabase
          .from("product_images")
          .select("product_id, src, position, is_primary, colorway_id")
          .in("product_id", productIds)
          .order("position", { ascending: true });

        for (const img of images ?? []) {
          if (!primaryImages[img.product_id]) {
            primaryImages[img.product_id] = img.src;
          }
        }

        const { data: variants } = await supabase
          .from("product_variants")
          .select("id, product_id, is_enabled")
          .in("product_id", productIds);

        const { data: inventory } = await supabase
          .from("inventory_transactions")
          .select("variant_id, quantity")
          .in("variant_id", (variants ?? []).map((v: any) => v.id));

        const invByVariant: Record<string, number> = {};
        for (const tx of inventory ?? []) {
          invByVariant[tx.variant_id] = (invByVariant[tx.variant_id] ?? 0) + tx.quantity;
        }

        const variantsByProduct: Record<string, number[]> = {};
        for (const v of variants ?? []) {
          if (!variantsByProduct[v.product_id]) variantsByProduct[v.product_id] = [];
          variantsByProduct[v.product_id].push(v.id);
        }

        for (const p of products ?? []) {
          if (!p.track_inventory) {
            inventoryStatuses[p.id] = 'not_tracked';
          } else {
            const vIds = variantsByProduct[p.id] ?? [];
            const totalStock = vIds.reduce((sum, vid) => sum + (invByVariant[vid] ?? 0), 0);
            if (totalStock > 0) {
              inventoryStatuses[p.id] = 'in_stock';
            } else if (p.allow_backorders) {
              inventoryStatuses[p.id] = 'backorder';
            } else {
              inventoryStatuses[p.id] = 'out_of_stock';
            }
          }
        }
      }

      const items = (products ?? []).map((p: any) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        source: p.source,
        basePriceCents: p.base_price_cents,
        visibility: p.visibility,
        primaryImageSrc: primaryImages[p.id] ?? null,
        inventoryStatus: inventoryStatuses[p.id] ?? 'not_tracked',
        updatedAt: p.updated_at,
      }));

      return jsonResponse({ items });
    }

    // POST: create product
    if (method === "POST") {
      const body: ProductInput = await req.json();

      let slug = body.slug?.trim() || slugify(body.title);
      if (!slug) return jsonResponse({ error: "Slug is required" }, 400);

      // Ensure slug uniqueness
      const { data: existing } = await supabase
        .from("products")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();

      if (existing) {
        slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
      }

      const { data: product, error: createError } = await supabase
        .from("products")
        .insert({
          slug,
          title: body.title,
          description: body.description ?? '',
          source: body.source,
          base_price_cents: body.basePriceCents ?? 0,
          currency: body.currency ?? 'USD',
          sku: body.sku ?? null,
          category: body.category ?? null,
          tags: body.tags ?? [],
          shipping_class: body.shippingClass ?? 'standard',
          visibility: body.visibility ?? 'draft',
          track_inventory: body.trackInventory ?? false,
          allow_backorders: body.allowBackorders ?? false,
          password: body.password ?? null,
          created_by: user.id,
          updated_by: user.id,
        })
        .select()
        .single();

      if (createError) return jsonResponse({ error: createError.message }, 500);

      // Insert colorways
      if (body.colorways && body.colorways.length > 0) {
        const colorwayRows = body.colorways.map((cw, i) => ({
          product_id: product.id,
          name: cw.name,
          slug: cw.slug?.trim() || slugify(cw.name),
          hex_color: cw.hexColor ?? null,
          sort_order: cw.sortOrder ?? i,
          is_active: cw.isActive ?? true,
        }));

        const { error: cwError } = await supabase
          .from("product_colorways")
          .insert(colorwayRows);

        if (cwError) return jsonResponse({ error: cwError.message }, 500);
      }

      // Insert variants
      if (body.variants && body.variants.length > 0) {
        const variantRows = body.variants.map((v, i) => ({
          product_id: product.id,
          sku: v.sku ?? null,
          title: v.title,
          options: v.options ?? {},
          price_cents: v.priceCents ?? body.basePriceCents ?? 0,
          position: v.position ?? i,
          is_enabled: v.isEnabled ?? true,
          colorway_id: v.colorwayId ?? null,
        }));

        const { data: insertedVariants, error: variantError } = await supabase
          .from("product_variants")
          .insert(variantRows)
          .select();

        if (variantError) return jsonResponse({ error: variantError.message }, 500);

        // Insert initial inventory transactions
        if (body.trackInventory) {
          const invRows = body.variants
            .map((v, i) => ({
              product_id: product.id,
              variant_id: insertedVariants[i].id,
              quantity: v.inventoryQuantity ?? 0,
              reason: 'initial',
            }))
            .filter((r: any) => r.quantity !== 0);

          if (invRows.length > 0) {
            const { error: invError } = await supabase
              .from("inventory_transactions")
              .insert(invRows);
            if (invError) return jsonResponse({ error: invError.message }, 500);
          }
        }
      }

      // Insert images
      if (body.images && body.images.length > 0) {
        const imageRows = body.images.map((img, i) => ({
          product_id: product.id,
          src: img.src,
          alt: img.alt ?? null,
          position: img.position ?? i,
          r2_key: img.r2Key ?? null,
          colorway_id: img.colorwayId ?? null,
          is_primary: img.isPrimary ?? (i === 0),
        }));

        const { error: imgError } = await supabase
          .from("product_images")
          .insert(imageRows);
        if (imgError) return jsonResponse({ error: imgError.message }, 500);
      }

      return jsonResponse({ product, id: product.id });
    }

    // PUT: update product
    if (method === "PUT") {
      const body: ProductInput = await req.json();
      if (!body.id) return jsonResponse({ error: "Product ID is required" }, 400);

      const updateData: Record<string, unknown> = {
        updated_by: user.id,
      };
      if (body.title !== undefined) updateData.title = body.title;
      if (body.slug !== undefined) updateData.slug = slugify(body.slug) || body.slug;
      if (body.description !== undefined) updateData.description = body.description;
      if (body.basePriceCents !== undefined) updateData.base_price_cents = body.basePriceCents;
      if (body.currency !== undefined) updateData.currency = body.currency;
      if (body.sku !== undefined) updateData.sku = body.sku;
      if (body.category !== undefined) updateData.category = body.category;
      if (body.tags !== undefined) updateData.tags = body.tags;
      if (body.shippingClass !== undefined) updateData.shipping_class = body.shippingClass;
      if (body.visibility !== undefined) updateData.visibility = body.visibility;
      if (body.trackInventory !== undefined) updateData.track_inventory = body.trackInventory;
      if (body.allowBackorders !== undefined) updateData.allow_backorders = body.allowBackorders;
      if (body.password !== undefined) updateData.password = body.password || null;

      const { data: product, error: updateError } = await supabase
        .from("products")
        .update(updateData)
        .eq("id", body.id)
        .select()
        .single();

      if (updateError) return jsonResponse({ error: updateError.message }, 500);

      // Sync colorways
      if (body.colorways !== undefined) {
        const { data: existingColorways } = await supabase
          .from("product_colorways")
          .select("id")
          .eq("product_id", body.id);

        const existingCwIds = new Set((existingColorways ?? []).map((cw: any) => cw.id));
        const keptCwIds = new Set(body.colorways.filter(cw => cw.id).map(cw => cw.id!));
        const toDeleteCw = [...existingCwIds].filter(id => !keptCwIds.has(id));

        if (toDeleteCw.length > 0) {
          await supabase.from("product_colorways").delete().in("id", toDeleteCw);
        }

        for (const cw of body.colorways) {
          if (cw.id && existingCwIds.has(cw.id)) {
            await supabase
              .from("product_colorways")
              .update({
                name: cw.name,
                slug: cw.slug?.trim() || slugify(cw.name),
                hex_color: cw.hexColor ?? null,
                sort_order: cw.sortOrder ?? 0,
                is_active: cw.isActive ?? true,
              })
              .eq("id", cw.id);
          } else {
            await supabase
              .from("product_colorways")
              .insert({
                product_id: body.id,
                name: cw.name,
                slug: cw.slug?.trim() || slugify(cw.name),
                hex_color: cw.hexColor ?? null,
                sort_order: cw.sortOrder ?? 0,
                is_active: cw.isActive ?? true,
              });
          }
        }
      }

      // Sync variants: replace all
      if (body.variants !== undefined) {
        // Get existing variants
        const { data: existingVariants } = await supabase
          .from("product_variants")
          .select("id")
          .eq("product_id", body.id);

        const existingIds = new Set((existingVariants ?? []).map((v: any) => v.id));
        const keptIds = new Set(body.variants.filter(v => v.id).map(v => v.id!));
        const toDelete = [...existingIds].filter(id => !keptIds.has(id));

        if (toDelete.length > 0) {
          await supabase.from("product_variants").delete().in("id", toDelete);
        }

        for (const v of body.variants) {
          if (v.id && existingIds.has(v.id)) {
            await supabase
              .from("product_variants")
              .update({
                sku: v.sku ?? null,
                title: v.title,
                options: v.options ?? {},
                price_cents: v.priceCents ?? body.basePriceCents ?? 0,
                is_enabled: v.isEnabled ?? true,
                colorway_id: v.colorwayId ?? null,
              })
              .eq("id", v.id);
          } else {
            const { data: newVariant } = await supabase
              .from("product_variants")
              .insert({
                product_id: body.id,
                sku: v.sku ?? null,
                title: v.title,
                options: v.options ?? {},
                price_cents: v.priceCents ?? body.basePriceCents ?? 0,
                is_enabled: v.isEnabled ?? true,
                colorway_id: v.colorwayId ?? null,
              })
              .select()
              .single();

            if (newVariant && body.trackInventory && (v.inventoryQuantity ?? 0) !== 0) {
              await supabase
                .from("inventory_transactions")
                .insert({
                  product_id: body.id,
                  variant_id: newVariant.id,
                  quantity: v.inventoryQuantity ?? 0,
                  reason: 'initial',
                });
            }
          }
        }
      }

      // Sync images: replace all (preserving r2_key for R2-managed images)
      if (body.images !== undefined) {
        // Fetch existing images so we can delete orphaned R2 objects
        const { data: existingImages } = await supabase
          .from("product_images")
          .select("id, r2_key")
          .eq("product_id", body.id);

        const existingR2Keys = new Map(
          (existingImages ?? []).filter((img: any) => img.r2_key).map((img: any) => [img.id, img.r2_key]),
        );

        await supabase.from("product_images").delete().eq("product_id", body.id);
        if (body.images.length > 0) {
          const imageRows = body.images.map((img, i) => ({
            product_id: body.id,
            src: img.src,
            alt: img.alt ?? null,
            position: img.position ?? i,
            r2_key: img.r2Key ?? null,
            colorway_id: img.colorwayId ?? null,
            is_primary: img.isPrimary ?? (i === 0),
          }));
          await supabase.from("product_images").insert(imageRows);
        }
      }

      return jsonResponse({ product });
    }

    // DELETE: delete product
    if (method === "DELETE") {
      const id = url.searchParams.get("id");
      if (!id) return jsonResponse({ error: "Product ID is required" }, 400);

      const { error: deleteError } = await supabase
        .from("products")
        .delete()
        .eq("id", id);

      if (deleteError) return jsonResponse({ error: deleteError.message }, 500);

      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
