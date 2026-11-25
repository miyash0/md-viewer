import { useEffect, useState } from "preact/hooks";
import type { ConnectionStatus } from "../api";
import type { ViewState } from "../types";

const UPDATED_MS = 1500;

export function StatusIndicator({ state, connection }: { state: ViewState; connection: ConnectionStatus }) {
  const [showUpdated, setShowUpdated] = useState(false);
  useEffect(() => {
    if (state.updatedAt == null) return;
    setShowUpdated(true);
    const t = setTimeout(() => setShowUpdated(false), UPDATED_MS);
    return () => clearTimeout(t);
  }, [state.updatedAt]);

  return (
    <div class="md-status" aria-live="polite">
      {connection === "disconnected" && (
        <div class="md-status-item md-status-warn">サーバーとの接続が切れました（再接続を待っています）</div>
      )}
      {state.error && (
        <div class="md-status-item md-status-error" role="alert">
          {state.error}
        </div>
      )}
      {state.phase === "loading" && <div class="md-status-item">描画中…</div>}
      {state.phase === "ready" && showUpdated && <div class="md-status-item md-status-ok">更新しました</div>}
    </div>
  );
}
