"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Shipment = {
  shipment_id: string;
  hawb: string | null;
  mawb: string | null;
  po_number: string | null;
  customer_reference: string | null;
  origin: string | null;
  destination: string | null;
  current_status: string | null;
  eta_updated: string | null;
  last_event_time: string | null;
};

type EventRow = {
  event_time: string | null;
  event_code: string | null;
  notes: string | null;
  location: string | null;
  source_column: string | null;
};

function fmtDateTime(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString();
}

function fmtDate(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString();
}

type Milestone = {
  key: string;
  label: string;
  codes: string[];
};

const MILESTONES: Milestone[] = [
  { key: "booked", label: "Booked", codes: ["BOOKED"] },
  { key: "ready", label: "Ready", codes: ["READY"] },
  { key: "docs", label: "Docs Received", codes: ["DOCS_RECEIVED"] },
  { key: "cargo", label: "Cargo Received", codes: ["CARGO_RECEIVED"] },
  { key: "departed", label: "Departed", codes: ["ATD"] },
  { key: "discharged", label: "Discharged", codes: ["DISCHARGED"] },
  { key: "customs", label: "Customs Released", codes: ["CUSTOMS_RELEASED"] },
  { key: "delivered", label: "Delivered", codes: ["DELIVERED"] },
];

function inferMilestoneIndex(events: EventRow[]): number {
  if (!events || events.length === 0) return 0;

  const codes = new Set(
    events
      .map((e) => (e.event_code ?? "").toUpperCase().trim())
      .filter(Boolean)
  );

  for (let i = MILESTONES.length - 1; i >= 0; i--) {
    if (MILESTONES[i].codes.some((c) => codes.has(c))) return i;
  }
  return 0;
}

function ProgressBar({
  origin,
  destination,
  currentIndex,
}: {
  origin: string;
  destination: string;
  currentIndex: number;
}) {
  return (
    <div className="rounded-2xl border border-[var(--wpl-border)] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold">{origin}</div>
        <div className="text-sm font-semibold text-right">{destination}</div>
      </div>

      <div className="mt-4">
        <div className="flex items-center">
          {MILESTONES.map((m, idx) => {
            const done = idx < currentIndex;
            const current = idx === currentIndex;

            return (
              <div key={m.key} className="flex flex-1 items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={[
                      "h-4 w-4 rounded-full border",
                      done
                        ? "bg-[var(--wpl-blue)] border-[var(--wpl-blue)]"
                        : current
                        ? "bg-white border-[var(--wpl-blue)]"
                        : "bg-white border-[var(--wpl-border)]",
                    ].join(" ")}
                    title={m.label}
                  />
                </div>

                {idx !== MILESTONES.length - 1 && (
                  <div
                    className={[
                      "mx-2 h-[3px] flex-1 rounded",
                      idx < currentIndex
                        ? "bg-[var(--wpl-blue)]"
                        : "bg-[var(--wpl-border)]",
                    ].join(" ")}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-3 grid grid-cols-8 gap-2 text-center text-[11px] text-[var(--wpl-gray)]">
          {MILESTONES.map((m, idx) => (
            <div
              key={m.key}
              className={[
                "leading-tight",
                idx === currentIndex ? "font-semibold text-[var(--wpl-blue)]" : "",
              ].join(" ")}
            >
              {m.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ShipmentDetailPage() {
  const params = useParams<{ shipment_id: string }>();
  const shipmentId = decodeURIComponent(params.shipment_id);

  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        // Get session token
        const { data } = await supabase.auth.getSession();
        const session = data.session;

        if (!session) {
          window.location.href = "/login";
          return;
        }

        // Call API with Bearer token
        const res = await fetch(`/api/shipments/${encodeURIComponent(shipmentId)}`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }

        const json = await res.json();

        if (!res.ok) {
          setError(json.error || "Unable to load shipment");
          setLoading(false);
          return;
        }

        setShipment(json.shipment);
        setEvents(json.events ?? []);
      } catch (err) {
        console.error("Failed to load shipment", err);
        setError("Failed to load shipment");
      } finally {
        setLoading(false);
      }
    })();
  }, [shipmentId]);

  const reference = useMemo(() => {
    if (!shipment) return shipmentId;
    return shipment.hawb || shipment.mawb || shipment.po_number || shipment.shipment_id;
  }, [shipment, shipmentId]);

  const milestoneIndex = useMemo(() => inferMilestoneIndex(events), [events]);

  const originLabel = shipment?.origin ?? "Origin";
  const destinationLabel = shipment?.destination ?? "Destination";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link
          href="/shipments"
          className="text-sm font-semibold text-[var(--wpl-blue)] hover:underline"
        >
          ← Back to shipments
        </Link>
      </div>

      <ProgressBar
        origin={originLabel}
        destination={destinationLabel}
        currentIndex={milestoneIndex}
      />

      <div className="rounded-2xl border border-[var(--wpl-border)] bg-white p-5 shadow-sm">
        {loading ? (
          <div className="text-[var(--wpl-gray)]">Loading shipment…</div>
        ) : error ? (
          <div className="text-[var(--wpl-red)]">{error}</div>
        ) : !shipment ? (
          <div className="text-[var(--wpl-red)]">Shipment not found.</div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <h1 className="text-xl font-semibold">{reference}</h1>
                <div className="mt-1 text-sm text-[var(--wpl-gray)]">
                  {shipment.origin ?? "—"} → {shipment.destination ?? "—"}
                </div>
                <div className="mt-1 text-xs text-[var(--wpl-gray)]">
                  Shipment ID: {shipment.shipment_id}
                </div>
              </div>

              <div className="flex flex-col items-start gap-2 md:items-end">
                <span className="rounded-full bg-[var(--wpl-blue)]/10 px-3 py-1 text-xs font-semibold text-[var(--wpl-blue)]">
                  {shipment.current_status ?? "In progress"}
                </span>
                <div className="text-xs text-[var(--wpl-gray)]">
                  Updated: {fmtDateTime(shipment.last_event_time)}
                </div>
                <div className="text-xs text-[var(--wpl-gray)]">
                  ETA: {fmtDate(shipment.eta_updated)}
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-[var(--wpl-border)] p-4">
                <div className="text-xs font-semibold text-[var(--wpl-gray)]">HAWB</div>
                <div className="mt-1 text-sm">{shipment.hawb ?? "—"}</div>
              </div>
              <div className="rounded-xl border border-[var(--wpl-border)] p-4">
                <div className="text-xs font-semibold text-[var(--wpl-gray)]">MAWB</div>
                <div className="mt-1 text-sm">{shipment.mawb ?? "—"}</div>
              </div>
              <div className="rounded-xl border border-[var(--wpl-border)] p-4">
                <div className="text-xs font-semibold text-[var(--wpl-gray)]">PO Number</div>
                <div className="mt-1 text-sm">{shipment.po_number ?? "—"}</div>
              </div>
              <div className="rounded-xl border border-[var(--wpl-border)] p-4">
                <div className="text-xs font-semibold text-[var(--wpl-gray)]">
                  Customer Reference
                </div>
                <div className="mt-1 text-sm">{shipment.customer_reference ?? "—"}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-[var(--wpl-border)] bg-white shadow-sm">
        <div className="border-b border-[var(--wpl-border)] px-5 py-4">
          <h2 className="text-sm font-semibold">Tracking Timeline</h2>
          <p className="text-xs text-[var(--wpl-gray)]">Latest events first</p>
        </div>

        {loading ? (
          <div className="px-5 py-6 text-sm text-[var(--wpl-gray)]">Loading events…</div>
        ) : events.length === 0 ? (
          <div className="px-5 py-6 text-sm text-[var(--wpl-gray)]">No events found.</div>
        ) : (
          <div className="divide-y">
            {events.map((e, idx) => (
              <div key={idx} className="flex gap-4 px-5 py-4">
                <div className="w-44 shrink-0 text-xs text-[var(--wpl-gray)]">
                  {fmtDateTime(e.event_time)}
                </div>

                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {e.event_code && (
                      <span className="rounded bg-black/5 px-2 py-0.5 text-xs font-semibold">
                        {e.event_code}
                      </span>
                    )}
                    <span className="text-sm font-medium">{e.notes ?? "Event"}</span>
                  </div>

                  <div className="mt-1 text-xs text-[var(--wpl-gray)]">
                    {e.location ?? "—"}
                    {e.source_column ? ` • ${e.source_column}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
