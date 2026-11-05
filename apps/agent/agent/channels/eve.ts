import { eveChannel } from "eve/channels/eve";
import { localDev, vercelOidc } from "eve/channels/auth";

import { withTravelerToken } from "../lib/traveler-auth";
import { supabaseSessionAuth } from "../lib/route-auth";

export default eveChannel({
  // Each authenticator is wrapped so the caller it accepts also carries the
  // Traveler's forwarded Supabase token (x-nomai-traveler-token) for
  // Traveler-scoped tools. The wrapper never admits a request on its own.
  auth: [
    // Lets the eve TUI and your Vercel deployments reach the deployed agent.
    vercelOidc(),
    // Production gate for browser callers: accepts a caller only on a
    // Supabase access token the Auth server verifies (see lib/route-auth.ts).
    // Signed-out visitors are declined with eve's 401.
    supabaseSessionAuth(),
    // Open on localhost for `eve dev` and the REPL; ignored in production.
    localDev(),
  ].map(withTravelerToken),
});
