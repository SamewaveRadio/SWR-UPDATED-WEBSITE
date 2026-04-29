import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const rawStoreDomain = Deno.env.get("SHOPIFY_STORE_DOMAIN") || "";
const SHOPIFY_STORE_DOMAIN = rawStoreDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
const SHOPIFY_STOREFRONT_ACCESS_TOKEN = Deno.env.get("SHOPIFY_STOREFRONT_ACCESS_TOKEN");

async function shopifyFetch(query: string, variables: Record<string, unknown> = {}) {
  if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_STOREFRONT_ACCESS_TOKEN) {
    throw new Error("Shopify not configured");
  }

  const response = await fetch(
    `https://${SHOPIFY_STORE_DOMAIN}/api/2025-01/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": SHOPIFY_STOREFRONT_ACCESS_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
    }
  );

  const json = await response.json();

  if (json.errors) {
    throw new Error(json.errors[0]?.message || "Shopify API error");
  }

  return json.data;
}

const CART_CREATE_MUTATION = `
  mutation CartCreate {
    cartCreate {
      cart {
        id
        checkoutUrl
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const CART_ADD_MUTATION = `
  mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart {
        id
        checkoutUrl
        totalQuantity
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const CART_UPDATE_MUTATION = `
  mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) {
      cart {
        id
        checkoutUrl
        totalQuantity
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const CART_REMOVE_MUTATION = `
  mutation CartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
    cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
      cart {
        id
        checkoutUrl
        totalQuantity
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const CART_QUERY = `
  query GetCart($cartId: ID!) {
    cart(id: $cartId) {
      id
      checkoutUrl
      totalQuantity
      cost {
        subtotalAmount {
          amount
          currencyCode
        }
      }
      lines(first: 100) {
        edges {
          node {
            id
            quantity
            merchandise {
              ... on ProductVariant {
                id
                title
                price {
                  amount
                  currencyCode
                }
                product {
                  title
                  handle
                  featuredImage {
                    url
                    altText
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

interface CartLine {
  id: string;
  quantity: number;
  merchandise: {
    id: string;
    title: string;
    price: { amount: string; currencyCode: string };
    product: {
      title: string;
      handle: string;
      featuredImage: { url: string; altText: string | null } | null;
    };
  };
}

interface CartData {
  id: string;
  checkoutUrl: string;
  totalQuantity: number;
  cost: { subtotalAmount: { amount: string; currencyCode: string } };
  lines: { edges: { node: CartLine }[] };
}

function normalizeCart(cart: CartData) {
  return {
    cartId: cart.id,
    checkoutUrl: cart.checkoutUrl,
    totalQuantity: cart.totalQuantity,
    subtotal: parseFloat(cart.cost.subtotalAmount.amount),
    currencyCode: cart.cost.subtotalAmount.currencyCode,
    lines: cart.lines.edges.map((edge) => {
      const line = edge.node;
      return {
        lineId: line.id,
        quantity: line.quantity,
        variantId: line.merchandise.id,
        variantTitle: line.merchandise.title,
        productTitle: line.merchandise.product.title,
        productHandle: line.merchandise.product.handle,
        price: parseFloat(line.merchandise.price.amount),
        currencyCode: line.merchandise.price.currencyCode,
        imageUrl: line.merchandise.product.featuredImage?.url || null,
      };
    }),
  };
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_STOREFRONT_ACCESS_TOKEN) {
      return new Response(
        JSON.stringify({ error: "Shopify not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const action = pathParts[pathParts.length - 1];

    if (req.method === "GET") {
      const cartId = url.searchParams.get("cartId");
      if (!cartId) {
        return new Response(
          JSON.stringify({ error: "Missing cartId parameter" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await shopifyFetch(CART_QUERY, { cartId });
      
      if (!data.cart) {
        return new Response(
          JSON.stringify({ error: "Cart not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify(normalizeCart(data.cart)), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));

      if (action === "create") {
        const data = await shopifyFetch(CART_CREATE_MUTATION);
        
        if (data.cartCreate.userErrors?.length > 0) {
          throw new Error(data.cartCreate.userErrors[0].message);
        }

        return new Response(
          JSON.stringify({
            cartId: data.cartCreate.cart.id,
            checkoutUrl: data.cartCreate.cart.checkoutUrl,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } }
        );
      }

      if (action === "add") {
        const { cartId, variantId, quantity = 1 } = body;
        
        if (!cartId || !variantId) {
          return new Response(
            JSON.stringify({ error: "Missing cartId or variantId" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const data = await shopifyFetch(CART_ADD_MUTATION, {
          cartId,
          lines: [{ merchandiseId: variantId, quantity }],
        });

        if (data.cartLinesAdd.userErrors?.length > 0) {
          throw new Error(data.cartLinesAdd.userErrors[0].message);
        }

        return new Response(
          JSON.stringify({
            cartId: data.cartLinesAdd.cart.id,
            checkoutUrl: data.cartLinesAdd.cart.checkoutUrl,
            totalQuantity: data.cartLinesAdd.cart.totalQuantity,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } }
        );
      }

      if (action === "update") {
        const { cartId, lines } = body;
        
        if (!cartId || !lines) {
          return new Response(
            JSON.stringify({ error: "Missing cartId or lines" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const formattedLines = lines.map((line: { lineId: string; quantity: number }) => ({
          id: line.lineId,
          quantity: line.quantity,
        }));

        const data = await shopifyFetch(CART_UPDATE_MUTATION, {
          cartId,
          lines: formattedLines,
        });

        if (data.cartLinesUpdate.userErrors?.length > 0) {
          throw new Error(data.cartLinesUpdate.userErrors[0].message);
        }

        return new Response(
          JSON.stringify({
            cartId: data.cartLinesUpdate.cart.id,
            checkoutUrl: data.cartLinesUpdate.cart.checkoutUrl,
            totalQuantity: data.cartLinesUpdate.cart.totalQuantity,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } }
        );
      }

      if (action === "remove") {
        const { cartId, lineIds } = body;
        
        if (!cartId || !lineIds) {
          return new Response(
            JSON.stringify({ error: "Missing cartId or lineIds" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const data = await shopifyFetch(CART_REMOVE_MUTATION, {
          cartId,
          lineIds,
        });

        if (data.cartLinesRemove.userErrors?.length > 0) {
          throw new Error(data.cartLinesRemove.userErrors[0].message);
        }

        return new Response(
          JSON.stringify({
            cartId: data.cartLinesRemove.cart.id,
            checkoutUrl: data.cartLinesRemove.cart.checkoutUrl,
            totalQuantity: data.cartLinesRemove.cart.totalQuantity,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Unknown action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
