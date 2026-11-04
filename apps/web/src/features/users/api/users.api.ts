import {
  authUserDataSchema,
  type AuthUserData,
  type UpdateProfileBody,
} from "@template/contracts";

import {
  apiClient,
  assertAuthSessionSubject,
  getAuthSessionEpoch,
  parseApiResponse,
} from "@/services/api/api-client";

/**
 * The own-account read. The epoch is captured before the request and the
 * returned subject is verified against it, so an obsolete or foreign result
 * never reaches the cache.
 */
export const usersApi = {
  async getMe(signal?: AbortSignal): Promise<AuthUserData> {
    const capturedEpoch = getAuthSessionEpoch();
    const response = await apiClient.get(
      "/users/me",
      signal === undefined ? {} : { signal },
    );
    const parsed = parseApiResponse(response.data, authUserDataSchema);
    assertAuthSessionSubject(parsed.data.user.id, capturedEpoch);
    return parsed.data;
  },
  async updateMe(body: UpdateProfileBody): Promise<AuthUserData> {
    const capturedEpoch = getAuthSessionEpoch();
    const response = await apiClient.patch("/users/me", body);
    const parsed = parseApiResponse(response.data, authUserDataSchema);
    assertAuthSessionSubject(parsed.data.user.id, capturedEpoch);
    return parsed.data;
  },
};
