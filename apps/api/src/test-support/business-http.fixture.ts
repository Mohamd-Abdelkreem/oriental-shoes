import { randomUUID } from "node:crypto";
import { generateTokenPair } from "../infrastructure/security/jwt.service.js";
// Signed fixture credential; production authentication and current-account guards still run.
export const businessTestHeaders = (userId: string) => ({
  Authorization: `Bearer ${generateTokenPair({ userId, tokenId: randomUUID(), role: "USER", email: `${userId}@example.test`, rememberMe: false, absoluteExpiresAt: new Date(Date.now() + 3600000) }).accessToken}`,
  Cookie: "csrfToken=owned-csrf",
  "x-csrf-token": "owned-csrf",
});
