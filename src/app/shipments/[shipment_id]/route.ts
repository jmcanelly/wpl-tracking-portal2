import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: { shipment_id: string } }
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return NextResponse.json({ error: "Server env missing" }, { status: 500 });
  }

  const shipmentId = params.shipment_id;

  // 1) Read Bearer token
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2) Verify token -> get user
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

  // 3) Server-side admin client
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Get user's allowed customer_ids
  const { data: memberships, error: membershipError } = await admin
    .from("allowed_users")
    .select("customer_id")
    .eq("email", user.email);

  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 500 });
  }

  if (!memberships?.length) {
    return NextResponse.json(
      { error: "No customer access" },
      { status: 403 }
    );
  }

  const customerIds = memberships.map((m) => m.customer_id).filter(Boolean);

  // Fetch the shipment
  const { data: shipment, error: shipmentError } = await admin
    .from("shipments")
    .select(
      "shipment_id, hawb, mawb, po_number, customer_reference, origin, destination, current_status, eta_updated, last_event_time, customer_id"
    )
    .eq("shipment_id", shipmentId)
    .maybeSingle();

  if (shipmentError) {
    return NextResponse.json({ error: shipmentError.message }, { status: 500 });
  }

  if (!shipment) {
    return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
  }

  // Verify user has access to this shipment's customer
  const hasAccess = customerIds.some(
    (id) => id.toLowerCase() === shipment.customer_id?.toLowerCase()
  );

  if (!hasAccess) {
    return NextResponse.json(
      { error: "You don't have access to this shipment" },
      { status: 403 }
    );
  }

  // Fetch events for this shipment
  const { data: events, error: eventsError } = await admin
    .from("events")
    .select("event_time, event_code, notes, location, source_column")
    .eq("shipment_id", shipmentId)
    .order("event_time", { ascending: false });

  if (eventsError) {
    return NextResponse.json({ error: eventsError.message }, { status: 500 });
  }

  return NextResponse.json({
    shipment,
    events: events ?? [],
  });
}
