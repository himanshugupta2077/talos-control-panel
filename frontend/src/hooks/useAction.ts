import { useCallback, useState } from "react";
import { useCommandLog } from "../state/CommandLogContext";
import { StepsResponse } from "../types";

export function useAction<TArgs extends any[]>(
  label: string,
  fn: (...args: TArgs) => Promise<StepsResponse>
) {
  const { log } = useCommandLog();
  const [running, setRunning] = useState(false);

  const run = useCallback(
    async (...args: TArgs) => {
      setRunning(true);
      try {
        const result = await fn(...args);
        log(label, result.steps || []);
        return result;
      } finally {
        setRunning(false);
      }
    },
    [fn, label, log]
  );

  return { run, running };
}
