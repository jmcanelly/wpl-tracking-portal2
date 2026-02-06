"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  latest_event_code: string | null;
};

type SortKey =
  | "reference"
  | "route"
  | "status"
  | "eta_updated"
  | "last_event_time";

type SortDir = "asc" | "desc";

function asLower(v: unknown) {
  return String(v ?? "").toLowerCase();
}

function parseDateMs(v: string | null) {
  if (!v) return Number.NaN;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? Number.NaN : t;
}

function getReference(s: Shipment) {
  return s.hawb || s.mawb || s.po_number || s.shipment_id;
}

function getRoute(s: Shipment) {
  return `${s.origin ?? ""}→${s.destination ?? ""}`;
}

type DerivedStatus =
  | "Delivered"
  | "Customs Released"
  | "Discharged"
  | "In Transit"
  | "Pre-Departure";

function deriveStatus(s: Shipment): DerivedStatus {
  const eventCode = (s.latest_event_code ?? "").toUpperCase().trim();

  // Check event code first (most reliable)
  if (eventCode.includes("DELIVERED") || eventCode === "DEL") return "Delivered";
  if (eventCode.includes("CUSTOMS_RELEASED") || eventCode === "CUS" || eventCode.includes("CLEARED")) 
    return "Customs Released";
  if (eventCode.includes("DISCHARGED") || eventCode === "DIS") return "Discharged";
  if (eventCode.includes("ATD") || eventCode.includes("DEPARTED")) return "In Transit";
  if (eventCode.includes("BOOKED") || eventCode.includes("READY") || eventCode.includes("DOCS_RECEIVED") || eventCode.includes("CARGO_RECEIVED")) 
    return "Pre-Departure";

  // Fall back to current_status if event code doesn't match
  const raw = (s.current_status ?? "").trim().toLowerCase();
  if (raw.includes("deliver")) return "Delivered";
  if (raw.includes("custom") && (raw.includes("release") || raw.includes("cleared")))
    return "Customs Released";
  if (raw.includes("discharg")) return "Discharged";
  if (raw.includes("transit")) return "In Transit";
  if (raw.includes("pre") || raw.includes("booked") || raw.includes("ready"))
    return "Pre-Departure";

  // Default
  return "In Transit";
}

function statusBadgeClasses(status: DerivedStatus) {
  switch (status) {
    case "Delivered":
      return "bg-green-100 text-green-700";
    case "Customs Released":
      return "bg-amber-100 text-amber-800";
    case "Discharged":
      return "bg-purple-100 text-purple-700";
    case "Pre-Departure":
      return "bg-slate-100 text-slate-700";
    default:
      return "bg-[var(--wpl-blue)]/10 text-[var(--wpl-blue)]";
  }
}

export default function ShipmentsPage() {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");

  const [sortKey, setSortKey] = useState<SortKey>("last_event_time");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
  (async () => {
    try {
      // Get client session (localStorage)
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session) {
        window.location.href = "/login";
        return;
      }

      // Call server API with Bearer token
      const res = await fetch("/api/shipments", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      const json = await res.json();
      setRows(json.data ?? []);
      setEmail(json.email ?? "");
    } catch (err) {
      console.error("Failed to load shipments", err);
    } finally {
      setLoading(false);
    }
  })();
}, []);


  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" }).catch(() => {});
    window.location.href = "/";
  }

  function toggleSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(nextKey);
      setSortDir(
        nextKey === "reference" || nextKey === "route" || nextKey === "status"
          ? "asc"
          : "desc"
      );
    }
  }

  const filteredAndSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows;

    if (q) {
      list = rows.filter((s) =>
        [s.hawb, s.mawb, s.po_number, s.customer_reference, s.shipment_id]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      );
    }

    const dirMul = sortDir === "asc" ? 1 : -1;

    return [...list].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";

      switch (sortKey) {
        case "reference":
          av = asLower(getReference(a));
          bv = asLower(getReference(b));
          break;
        case "route":
          av = asLower(getRoute(a));
          bv = asLower(getRoute(b));
          break;
        case "status":
          av = asLower(deriveStatus(a));
          bv = asLower(deriveStatus(b));
          break;
        case "eta_updated":
          av = parseDateMs(a.eta_updated);
          bv = parseDateMs(b.eta_updated);
          break;
        case "last_event_time":
          av = parseDateMs(a.last_event_time);
          bv = parseDateMs(b.last_event_time);
          break;
      }

      if (Number.isNaN(av as number)) return 1;
      if (Number.isNaN(bv as number)) return -1;

      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dirMul;
      }
      return String(av).localeCompare(String(bv)) * dirMul;
    });
  }, [rows, query, sortKey, sortDir]);

  function Th({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k;
    const arrow = active ? (sortDir === "asc" ? "▲" : "▼") : "";
    return (
      <th className="px-4 py-3">
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className={`inline-flex items-center gap-2 font-semibold hover:underline ${
            active ? "text-[var(--wpl-blue)]" : ""
          }`}
        >
          {label} <span className="text-xs opacity-70">{arrow}</span>
        </button>
      </th>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Track Shipments</h1>
          <p className="text-sm text-[var(--wpl-gray)]">
            Search by HAWB, MAWB, PO, reference, or WPL ID
          </p>
          {email && (
            <p className="mt-1 text-xs text-[var(--wpl-gray)]">
              Signed in as {email}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm md:w-80"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            onClick={signOut}
            className="rounded-lg bg-black/5 px-3 py-2 text-sm font-semibold hover:bg-black/10"
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-[var(--wpl-bg)] text-left">
            <tr>
              <Th label="Reference" k="reference" />
              <Th label="Route" k="route" />
              <Th label="Status" k="status" />
              <Th label="ETA" k="eta_updated" />
              <Th label="Last Update" k="last_event_time" />
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[var(--wpl-gray)]">
                  Loading shipments…
                </td>
              </tr>
            ) : filteredAndSorted.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[var(--wpl-gray)]">
                  No shipments found.
                </td>
              </tr>
            ) : (
              filteredAndSorted.map((s) => {
                const status = deriveStatus(s);
                return (
                  <tr key={s.shipment_id} className="border-t hover:bg-black/[0.02]">
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/shipments/${encodeURIComponent(s.shipment_id)}`}
                        className="text-[var(--wpl-blue)] hover:underline"
                      >
                        {getReference(s)}
                      </Link>
                      <div className="text-xs text-[var(--wpl-gray)]">
                        ID: {s.shipment_id}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {s.origin ?? "—"} → {s.destination ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${statusBadgeClasses(
                          status
                        )}`}
                      >
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {s.eta_updated ? new Date(s.eta_updated).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {s.last_event_time
                        ? new Date(s.last_event_time).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-[var(--wpl-gray)]">
        Showing {filteredAndSorted.length} of {rows.length} shipments
      </div>
    </div>
  );
}
