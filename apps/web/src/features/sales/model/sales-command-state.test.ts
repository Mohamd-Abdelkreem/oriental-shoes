import { AxiosError, AxiosHeaders } from "axios";
import { expect, it } from "vitest";
import { ApiContractError } from "@/services/api/api-client";
import { isUnknownSalesWrite } from "./sales-command-state";

const failure = (status: number) =>
  new AxiosError("operation failed", "ERR_BAD_RESPONSE", undefined, undefined, {
    status,
    statusText: "failed",
    data: null,
    headers: {},
    config: { headers: new AxiosHeaders() },
  });
it.each([0, 500, 501, 502, 503, 504])(
  "retains uncertainty for response status %i",
  (status) => {
    expect(
      isUnknownSalesWrite(
        status === 0 ? new AxiosError("lost response") : failure(status),
      ),
    ).toBe(true);
  },
);
it.each([400, 401, 403, 404, 409, 413, 429])(
  "classifies status %i as rejection of only the current attempt",
  (status) => {
    expect(isUnknownSalesWrite(failure(status))).toBe(false);
  },
);
it("keeps malformed success uncertain without treating it as a trusted receipt", () => {
  expect(isUnknownSalesWrite(new ApiContractError())).toBe(true);
});
