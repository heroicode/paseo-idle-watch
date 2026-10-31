import { useRpc } from "@getpaseo/plugin/client";
import type { RpcOutput } from "@getpaseo/plugin";
import { useEffect, useState } from "react";
import { statusRpc } from "../shared/contracts";

export type IdleStatus = RpcOutput<typeof statusRpc>;

const REFRESH_MS = 60_000;

export function useIdleStatus(): IdleStatus | null {
  const fetchStatus = useRpc(statusRpc);
  const [status, setStatus] = useState<IdleStatus | null>(null);

  useEffect(() => {
    let live = true;
    const refresh = () =>
      fetchStatus({}).then(
        (next) => {
          if (live) setStatus(next);
        },
        () => {
          if (live) setStatus(null);
        },
      );
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [fetchStatus]);

  return status;
}
