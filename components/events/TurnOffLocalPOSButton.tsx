// components/events/TurnOffLocalPOSButton.tsx
"use client";

import { useState } from "react";
import { Power, RefreshCw } from "lucide-react";

type Props = {
  eventId: number;
  onDone?: () => void | Promise<void>;
};

export function TurnOffLocalPOSButton({ eventId, onDone }: Props) {
  const [loading, setLoading] = useState(false);

  async function turnOff(force = false) {
    setLoading(true);

    try {
      const res = await fetch(
        `/api/local/events/${eventId}${force ? "?force=true" : ""}`,
        {
          method: "DELETE",
        }
      );

      const result = await res.json();

      if (!res.ok) {
        if (
          res.status === 409 &&
          confirm(
            `${result.error}\n\nDo you want to force turn off local POS and delete unsynced local sales?`
          )
        ) {
          setLoading(false);
          await turnOff(true);
          return;
        }

        throw new Error(result.error || "Failed to turn off local POS");
      }

      localStorage.removeItem("pos:last-event-id");

      await onDone?.();

      alert("Local POS has been turned off for this event.");
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Failed to turn off local POS"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={() => turnOff(false)}
      disabled={loading}
      className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold border disabled:opacity-50"
      style={{
        borderColor: "rgba(220,38,38,0.25)",
        background: "rgba(220,38,38,0.08)",
        color: "#dc2626",
      }}
    >
      {loading ? (
        <RefreshCw size={14} className="animate-spin" />
      ) : (
        <Power size={14} />
      )}
      {loading ? "Turning off..." : "Turn Off Local POS"}
    </button>
  );
}