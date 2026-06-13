import Retell from "retell-sdk";
import { env, isTruthy } from "./config.js";

export function verifyRetellSignature(rawBody, signature) {
  if (!isTruthy(env("RETELL_VERIFY_SIGNATURE", "true"))) {
    return { ok: true, skipped: true };
  }

  const apiKey = env("RETELL_API_KEY");
  if (!apiKey) {
    return { ok: false, reason: "RETELL_API_KEY is required when signature verification is enabled." };
  }

  if (!signature) {
    return { ok: false, reason: "Missing X-Retell-Signature header." };
  }

  return {
    ok: Retell.verify(rawBody, apiKey, signature),
    skipped: false
  };
}
