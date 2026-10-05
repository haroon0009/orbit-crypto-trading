export interface JobStatus {
  state: string;
  progress?: unknown;
  result?: Record<string, unknown>;
  error?: string | null;
}

export function jobProgressPercent(
  status: Pick<JobStatus, "state" | "progress">,
) {
  if (status.state === "completed") return 100;
  const progress =
    typeof status.progress === "number" && Number.isFinite(status.progress)
      ? status.progress
      : 0;
  return Math.max(0, Math.min(100, Math.round(progress)));
}

export function jobStatusLabel(state: string) {
  if (
    state === "waiting" ||
    state === "waiting-children" ||
    state === "delayed"
  )
    return "Queued";
  if (state === "active") return "Running";
  if (state === "completed") return "Completed";
  if (state === "failed") return "Failed";
  return state;
}
