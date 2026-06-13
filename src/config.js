export function env(name, fallback = undefined) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return value;
}

export function requiredEnv(name) {
  const value = env(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").toLowerCase());
}
