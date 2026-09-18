// ================================================================
// 统一错误处理：抛出 HttpApiError → onError 中间件包装成 ApiError JSON
// ================================================================

import type { ApiErrorCode } from "@dsh-guild/types/api";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export class HttpApiError extends HTTPException {
  code: ApiErrorCode;
  details?: Record<string, string[]>;

  constructor(
    status: ContentfulStatusCode,
    code: ApiErrorCode,
    message: string,
    details?: Record<string, string[]>,
  ) {
    super(status, { message });
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }

  static badRequest(msg = "bad request", details?: Record<string, string[]>) {
    return new HttpApiError(400, "BAD_REQUEST", msg, details);
  }
  static unauthorized(msg = "unauthorized") {
    return new HttpApiError(401, "UNAUTHORIZED", msg);
  }
  static forbidden(msg = "forbidden") {
    return new HttpApiError(403, "FORBIDDEN", msg);
  }
  static notFound(msg = "not found") {
    return new HttpApiError(404, "NOT_FOUND", msg);
  }
  static conflict(msg = "conflict") {
    return new HttpApiError(409, "CONFLICT", msg);
  }
  static tooLarge(msg = "payload too large") {
    return new HttpApiError(413, "PAYLOAD_TOO_LARGE", msg);
  }
  static rateLimited(code: ApiErrorCode, msg: string) {
    return new HttpApiError(429, code, msg);
  }
  static internal(msg = "internal error") {
    return new HttpApiError(500, "INTERNAL", msg);
  }
}

export interface ApiErrorShape {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, string[]> | undefined;
  requestId?: string | undefined;
}
