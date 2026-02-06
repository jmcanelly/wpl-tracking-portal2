import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return NextResponse.json({ error: "Server env missing" }, { status: 500 });
  }

  // 1) Read Bearer token
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2) Verify token -> get user (this proves the token is real)
  const authed = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error: userErr,
  } = await authed.auth.getUser();

  if (userErr || !user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 3) Server-side admin client for allowlist + shipment fetch
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: memberships, error: membershipError } = await admin
    .from("allowed_users")
    .select("customer_id")
    .eq("email", user.email);

  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 500 });
  }

  if (!memberships?.length) {
    return NextResponse.json({ data: [], email: user.email });
  }

  const customerIds = memberships.map((m) => m.customer_id).filter(Boolean);

  if (customerIds.length === 0) {
    return NextResponse.json({ data: [], email: user.email });
  }

  // Build a case-insensitive OR query
  let query = admin
    .from("shipments")
    .select(
      "shipment_id, hawb, mawb, po_number, customer_reference, origin, destination, current_status, eta_updated, last_event_time"
    );

  // Use .or() with multiple .ilike() for case-insensitive matching
  const orConditions = customerIds.map((id) => `customer_id.ilike.${id}`).join(",");
  query = query.or(orConditions);

  const { data: shipments, error: shipmentError } = await query
    .order("last_event_time", { ascending: false })
    .limit(300);

  if (shipmentError) {
    return NextResponse.json({ error: shipmentError.message }, { status: 500 });
  }

  // For each shipment, get the latest event code
  const shipmentsWithStatus = await Promise.all(
    (shipments ?? []).map(async (shipment) => {
      const { data: latestEvent } = await admin
        .from("events")
        .select("event_code")
        .eq("shipment_id", shipment.shipment_id)
        .order("event_time", { ascending: false })
        .limit(1)
        .maybeSingle();

      return {
        ...shipment,
        latest_event_code: latestEvent?.event_code || null,
      };
    })
  );

  return NextResponse.json({ data: shipmentsWithStatus, email: user.email });
}
