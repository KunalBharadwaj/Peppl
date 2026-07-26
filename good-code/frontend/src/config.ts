export const CONFIG = {
  /**
   * Local dev defaults. Override via Vite env:
   * - VITE_CONTROL_PLANE_URL (ex: http://localhost:3001)
   * - VITE_ORCHESTRATOR_URL (ex: http://localhost:3002)
   * - VITE_OUTPUT_BASE_DOMAIN (ex: autogpt-cloud.com)
   * - VITE_GOOGLE_CLIENT_ID (OAuth 2.0 Web Client ID; must match the backend's
   *   GOOGLE_CLIENT_ID)
   */
  controlPlaneUrl:
    import.meta.env.VITE_CONTROL_PLANE_URL ?? "http://localhost:3001",
  orchestratorUrl:
    import.meta.env.VITE_ORCHESTRATOR_URL ?? "http://localhost:3002",
  outputBaseDomain:
    import.meta.env.VITE_OUTPUT_BASE_DOMAIN ?? "autogpt-cloud.com",
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "",
};

