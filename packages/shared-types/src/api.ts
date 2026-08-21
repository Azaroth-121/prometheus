/**
 * Contract for POST /api/v1/optimize.
 * Kept stable across the Make.com-backed V1 and the future cloud-backend V2
 * (doc section 18) — the extension and web app should never need to change
 * shape when the orchestration engine behind this endpoint is swapped out.
 */

export type OptimizationMode = 'standard' | 'image' | 'code';

export const OPTIMIZATION_MODES: readonly OptimizationMode[] = ['standard', 'image', 'code'];

export type OptimizeRequestSource =
  | 'extension_popup'
  | 'extension_context_menu'
  | 'extension_inline'
  | 'web_dashboard';

export interface OptimizeRequestBody {
  input: string;
  source: OptimizeRequestSource;
  mode: OptimizationMode;
  page_context: string | null;
  client_request_id: string;
}

export interface OptimizeResponseUsage {
  remaining_requests: number;
}

export interface OptimizeSuccessResponse {
  request_id: string;
  optimized_prompt: string;
  upgrade_notes: string[];
  usage: OptimizeResponseUsage;
}

export type OptimizeErrorCode =
  | 'UNAUTHENTICATED'
  | 'ACCOUNT_INACTIVE'
  | 'USAGE_LIMIT_REACHED'
  | 'INPUT_TOO_LONG'
  | 'INVALID_REQUEST'
  | 'GUARDRAIL_VALIDATION_FAILED'
  | 'UPSTREAM_ERROR'
  | 'NOT_IMPLEMENTED';

export interface OptimizeErrorResponse {
  request_id: string;
  error: {
    code: OptimizeErrorCode;
    message: string;
  };
}

export type OptimizeResponse = OptimizeSuccessResponse | OptimizeErrorResponse;

export function isOptimizeError(
  response: OptimizeResponse,
): response is OptimizeErrorResponse {
  return 'error' in response;
}

/**
 * Preferred structured output the model should return (doc section 7),
 * before the API layer reshapes it into OptimizeSuccessResponse.
 */
export interface PrometheusModelOutput {
  improved_prompt: string;
  upgrade_notes: string[];
  classification: {
    task_type: string;
    execution_risk: boolean;
  };
}

/** Contract for GET /api/v1/usage. */
export interface UsageSummary {
  plan_code: string;
  plan_name: string;
  expires_at: string | null;
  requests_used: number;
  requests_limit: number;
  tokens_used: number;
  tokens_limit: number;
}

/**
 * Contract for POST /api/v1/optimize/outcome. `accepted` is inferred client-side
 * from the existing Copy/Replace actions; `rejected`/`retried` are explicit new
 * buttons. `edited` is deliberately not included -- there's no edit affordance
 * anywhere in the UI yet.
 */
export type OptimizeOutcome = 'accepted' | 'rejected' | 'retried';

export interface SubmitOutcomeRequestBody {
  request_id: string;
  outcome: OptimizeOutcome;
}
