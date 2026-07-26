export const CONFIG = {
  /**
   * Local dev defaults. Override via Vite env:
   * - VITE_CONTROL_PLANE_URL (ex: http://localhost:3001)
   * - VITE_ORCHESTRATOR_URL (ex: http://localhost:3002)
   * - VITE_WORKSPACE_BASE_DOMAIN: the wildcard domain workspace pods are reached
   *   at over Socket.IO, i.e. <replId>.<domain> (ex: peetcode.com)
   * - VITE_OUTPUT_BASE_DOMAIN: the domain for the output-preview iframe
   *   (ex: autogpt-cloud.com) — separate from the socket domain above
   * - VITE_GOOGLE_CLIENT_ID (OAuth 2.0 Web Client ID; must match the backend's
   *   GOOGLE_CLIENT_ID)
   */
  controlPlaneUrl:
    import.meta.env.VITE_CONTROL_PLANE_URL ?? "http://localhost:3001",
  orchestratorUrl:
    import.meta.env.VITE_ORCHESTRATOR_URL ?? "http://localhost:3002",
  workspaceBaseDomain:
    import.meta.env.VITE_WORKSPACE_BASE_DOMAIN ?? "peetcode.com",
  outputBaseDomain:
    import.meta.env.VITE_OUTPUT_BASE_DOMAIN ?? "autogpt-cloud.com",
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "",
};

