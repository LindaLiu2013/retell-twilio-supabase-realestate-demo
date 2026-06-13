export function env(name, fallback = undefined) {
  const value = process.env[name];
  if (value === undefined) return fallback;

  const trimmed = value.trim();
  if (
    trimmed === "" ||
    trimmed.startsWith("TODO") ||
    trimmed.includes("TODO_") ||
    trimmed.includes("your-") ||
    trimmed.includes("your_")
  ) {
    return fallback;
  }

  return trimmed;
}

export function requiredEnv(name) {
  const value = env(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").toLowerCase());
}
