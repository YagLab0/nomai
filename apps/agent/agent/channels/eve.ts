import { eveChannel } from "eve/channels/eve";
import { localDev, placeholderAuth, vercelOidc } from "eve/channels/auth";

import { withTravelerToken } from "../lib/traveler-auth";

export default eveChannel({
  // Each authenticator is wrapped so the caller it accepts also carries the
  // Traveler's forwarded Supabase token (x-nomai-traveler-token) for
  // Traveler-scoped tools. The wrapper never admits a request on its own.
  auth: [
    // Lets the eve TUI and your Vercel deployments reach the deployed agent.
    vercelOidc(),
    // Open on localhost for `eve dev` and the REPL; ignored in production.
    localDev(),
    // This placeholder will not allow browser requests in production.
    // Replace it with your app's auth provider, like Auth.js or Clerk,
    // or use none() for a public demo.
    placeholderAuth(),
  ].map(withTravelerToken),
});
