import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import "./styles.css";
import { subscribeEvents, type ConnectionStatus } from "./api";
import { Content } from "./components/Content";
import { StatusIndicator } from "./components/StatusIndicator";
import type { ViewState } from "./types";

// 仮のエントリ（Task 5 で App に置き換える）
function Preview() {
  const path = decodeURIComponent(location.pathname.slice(1));
  const [state, setState] = useState<ViewState>({ phase: "loading", error: null, updatedAt: null });
  const [conn, setConn] = useState<ConnectionStatus>("connecting");
  const [token, setToken] = useState(0);
  useEffect(
    () => subscribeEvents({ onChange: (p) => p === path && setToken((t) => t + 1), onTree: () => {}, onStatus: setConn }),
    [],
  );
  return (
    <>
      <Content path={path} reloadToken={token} onToc={() => {}} onState={setState} />
      <StatusIndicator state={state} connection={conn} />
    </>
  );
}

render(<Preview />, document.getElementById("app")!);
