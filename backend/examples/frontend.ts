/** Framework-neutral integration example; call from your app, not as a standalone program.
 * Keep access tokens in memory. Never log them, put them in URLs, or commit them.
 */
const API_BASE = "http://localhost:8000";

export class SafetyAPI {
  constructor(private token?: string) {}

  private async request(path: string, method = "GET", body?: unknown, key?: string) {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 204) return;
    const data = await response.json();
    if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(data.detail)}`);
    return data;
  }

  register(name: string, email: string, password: string) {
    return this.request("/v1/auth/register", "POST", { name, email, password });
  }

  async login(email: string, password: string) {
    const session = await this.request("/v1/auth/login", "POST", { email, password });
    this.token = session.access_token;
    return session;
  }

  async logout() {
    await this.request("/v1/auth/logout", "POST");
    this.token = undefined;
  }

  addContact(name: string, email: string) {
    return this.request("/v1/contacts", "POST", { name, email });
  }

  contacts() { return this.request("/v1/contacts"); }

  createTrip(plan: {
    title: string;
    route: { type: "LineString"; coordinates: [number, number][] };
    expected_return_at: string; // new Date(localInput).toISOString(); require timezone.
    contact_ids: string[];
    grace_minutes?: number;
    notes?: string;
  }, requestId: string) {
    // Generate requestId ONCE per intended trip; reuse it with identical data on retries.
    return this.request("/v1/trips", "POST", plan, requestId);
  }

  startTrip(id: string) { return this.request(`/v1/trips/${id}/start`, "POST"); }

  checkIn(id: string, event: {
    event_id: string; // crypto.randomUUID(); keep stable on offline/retry uploads.
    kind: "progress" | "returned";
    recorded_at?: string;
    note?: string;
    position?: {
      latitude: number;
      longitude: number;
      source: "manual" | "landmark" | "gps_untrusted";
      accuracy_m?: number;
    };
  }) { return this.request(`/v1/trips/${id}/check-ins`, "POST", event); }

  notifications() { return this.request("/v1/notifications"); }

  // Demo only. Contains private simulated consent links; never display as real sent emails.
  demoInbox() { return this.request("/v1/demo/mail"); }
}

// UI rule: show "Returned — waiting to sync" until the server accepts a returned check-in.
// A progress check-in does NOT extend the return deadline.
// Show "Monitoring active" only after /start succeeds; this is separate from worker readiness.
// For server alert health, poll /health/ready and label demo mode explicitly.

