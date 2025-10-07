const UNSUPPORTED_KEYS = ['ANTHROPIC_API_TOKEN'];

for (const key of UNSUPPORTED_KEYS) {
  if (key in process.env) {
    delete process.env[key as keyof NodeJS.ProcessEnv];
  }
}

export const TEST_ENV_SANITIZED = true;
