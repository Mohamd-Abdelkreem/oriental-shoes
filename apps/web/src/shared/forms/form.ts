import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type {
  FieldPath,
  FieldValues,
  Resolver,
  UseFormProps,
  UseFormReturn,
  UseFormSetError,
} from "react-hook-form";
import type { ZodType } from "zod";

import { getApiError } from "@/services/api/api-client";
import { localValidationMessage } from "@/shared/validation/validation-copy";

function localizeValidationErrors(errors: object, path = ""): void {
  const entries: [string, unknown][] = Object.entries(errors);
  for (const [key, value] of entries) {
    if (key === "message" && typeof value === "string") {
      Reflect.set(errors, key, localValidationMessage(value, path));
    } else if (key !== "ref" && value !== null && typeof value === "object") {
      localizeValidationErrors(
        value,
        key === "types" ? path : path ? `${path}.${key}` : key,
      );
    }
  }
}

export function localizedZodResolver<
  TInput extends FieldValues,
  TOutput extends FieldValues,
  TContext = unknown,
>(schema: ZodType<TOutput, TInput>): Resolver<TInput, TContext, TOutput> {
  const resolve = zodResolver<TInput, TContext, TOutput>(schema);
  return async (values, context, options) => {
    const result = await resolve(values, context, options);
    localizeValidationErrors(result.errors);
    return result;
  };
}

export const useZodForm = <
  TInput extends FieldValues,
  TOutput extends FieldValues,
>(
  schema: ZodType<TOutput, TInput>,
  options: Omit<UseFormProps<TInput, TInput, TOutput>, "resolver"> = {},
): UseFormReturn<TInput, TInput, TOutput> =>
  useForm<TInput, TInput, TOutput>({
    ...options,
    resolver: localizedZodResolver(schema),
  });

type FormErrorTarget<TFields extends FieldValues> = Readonly<{
  getValues: () => TFields;
  setError: UseFormSetError<TFields>;
}>;

const isKnownField = <TFields extends FieldValues>(
  values: TFields,
  field: string,
): field is FieldPath<TFields> =>
  Object.prototype.hasOwnProperty.call(values, field);

export const applyApiFormError = <TFields extends FieldValues>(
  error: unknown,
  form: FormErrorTarget<TFields>,
): string => {
  const apiError = getApiError(error);
  for (const [rawField, messages] of Object.entries(apiError.fieldErrors)) {
    const field = rawField.replace(/^body\./u, "");
    const message = messages[0];
    if (!isKnownField(form.getValues(), field) || message === undefined)
      continue;
    form.setError(field, { type: "server", message });
  }
  return apiError.message;
};
