import { CanceledError } from "axios";
import {
  authEmptyDataSchema,
  authNeutralDataSchema,
  authSessionDataSchema,
  authUserDataSchema,
  resetTokenValidationDataSchema,
  type AuthSessionData,
  type AuthUserData,
  type ChangePasswordBody,
  type EmailRequestBody,
  type LoginBody,
  type RegisterBody,
  type ResetPasswordBody,
} from "@template/contracts";

import {
  acceptCredentialLogin,
  apiClient,
  parseApiResponse,
  refreshAuthSession,
  type ApiResponse,
} from "@/services/api/api-client";

type NeutralMessage = Readonly<{ message: string }>;
type EmptyResult = Record<string, never>;
type ResetTokenValidation = Readonly<{ valid: true }>;

export const authApi = {
  async register(body: RegisterBody): Promise<ApiResponse<AuthUserData>> {
    const response = await apiClient.post("/auth/register", body);
    return parseApiResponse(response.data, authUserDataSchema);
  },
  async verifyEmail(token: string): Promise<ApiResponse<AuthUserData>> {
    const response = await apiClient.post(
      "/auth/verify-email",
      {},
      {
        params: { token },
      },
    );
    return parseApiResponse(response.data, authUserDataSchema);
  },
  async resendVerification(
    body: EmailRequestBody,
  ): Promise<ApiResponse<NeutralMessage>> {
    const response = await apiClient.post("/auth/resend-verification", body);
    return parseApiResponse(response.data, authNeutralDataSchema);
  },
  /**
   * The explicit credential attempt. The complete session result is parsed
   * before any credential is accepted, and acceptance uses the credential-only
   * path so a passive result can never open the gate.
   */
  async login(
    body: LoginBody,
    expectedEpoch: number,
  ): Promise<ApiResponse<AuthSessionData>> {
    const response = await apiClient.post("/auth/login", body, {
      _templateAuthEpoch: expectedEpoch,
    });
    const parsed = parseApiResponse(response.data, authSessionDataSchema);
    const accepted = acceptCredentialLogin(
      parsed.data.tokens.accessToken,
      expectedEpoch,
      parsed.data.user.id,
    );
    if (!accepted) {
      throw new CanceledError(
        "The credential result no longer matches the current session.",
      );
    }
    return parsed;
  },
  /**
   * Joins the one transport-owned refresh. The waiter signal is checked before
   * joining and after settlement, and it is never forwarded to the shared
   * cookie attempt.
   */
  async refresh(
    expectedEpoch: number,
    signal?: AbortSignal,
  ): Promise<ApiResponse<AuthSessionData>> {
    const abortedBefore = signal?.aborted ?? false;
    if (abortedBefore) {
      throw new CanceledError("The refresh request was cancelled.");
    }
    const result = await refreshAuthSession(expectedEpoch);
    const abortedAfter = signal?.aborted ?? false;
    if (abortedAfter) {
      throw new CanceledError("The refresh request was cancelled.");
    }
    return result;
  },
  async logout(): Promise<ApiResponse<EmptyResult>> {
    const response = await apiClient.post("/auth/logout", {});
    return parseApiResponse(response.data, authEmptyDataSchema);
  },
  async logoutAll(): Promise<ApiResponse<EmptyResult>> {
    const response = await apiClient.post("/auth/logout-all", {});
    return parseApiResponse(response.data, authEmptyDataSchema);
  },
  async forgotPassword(
    body: EmailRequestBody,
  ): Promise<ApiResponse<NeutralMessage>> {
    const response = await apiClient.post("/auth/forgot-password", body);
    return parseApiResponse(response.data, authNeutralDataSchema);
  },
  async validateResetToken(
    token: string,
    signal?: AbortSignal,
  ): Promise<ApiResponse<ResetTokenValidation>> {
    const response = await apiClient.get(
      "/auth/validate-reset-token",
      signal === undefined
        ? { params: { token } }
        : { params: { token }, signal },
    );
    return parseApiResponse(response.data, resetTokenValidationDataSchema);
  },
  async resetPassword(
    token: string,
    body: ResetPasswordBody,
  ): Promise<ApiResponse<AuthUserData>> {
    const response = await apiClient.post("/auth/reset-password", body, {
      params: { token },
    });
    return parseApiResponse(response.data, authUserDataSchema);
  },
  async changePassword(
    body: ChangePasswordBody,
  ): Promise<ApiResponse<AuthUserData>> {
    const response = await apiClient.patch("/auth/change-password", body);
    return parseApiResponse(response.data, authUserDataSchema);
  },
};
