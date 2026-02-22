import { apiFetchSafe, ApiResult } from "./apiFetchSafe";

export type AnalyzeRequest = {
  imageBase64?: string;
  imageUrl?: string;
  locale?: string;
  source?: "camera" | "upload" | "paste";
};

export type AnalyzeResponse = any;

export async function analyzeScan(payload: AnalyzeRequest): Promise<ApiResult<AnalyzeResponse>> {
  return apiFetchSafe<AnalyzeResponse>("/api/analyze", {
    method: "POST",
    json: { ...payload, __client: { feature: "scan", endpoint: "analyze" } },
    timeoutMs: 60000,
  });
}
