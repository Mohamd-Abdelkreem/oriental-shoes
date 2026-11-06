import { getEnvVariable } from "./env.js";

export const parseOrderBusinessTimeZone = (
  input: string | undefined,
): string | null => {
  const timeZone = input?.trim();
  if (!timeZone) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone }).resolvedOptions()
      .timeZone;
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
};

export const orderConfig = Object.freeze({
  businessTimeZone: parseOrderBusinessTimeZone(
    getEnvVariable("ORDER_BUSINESS_TIME_ZONE", ""),
  ),
});
