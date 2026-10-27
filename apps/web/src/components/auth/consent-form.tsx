'use client';

import { Button } from '@heroui/react';

// Approve/deny buttons for the /oauth/consent screen — a plain POST form to
// /api/oauth/decision carrying the authorization_id.
export function ConsentForm({ authorizationId }: { authorizationId: string }) {
  return (
    <form action="/api/oauth/decision" method="POST" className="mt-8 flex flex-col gap-3">
      <input type="hidden" name="authorization_id" value={authorizationId} />
      <Button type="submit" name="decision" value="approve" fullWidth size="lg">
        Autorizar
      </Button>
      <Button type="submit" name="decision" value="deny" variant="tertiary" fullWidth>
        Denegar
      </Button>
    </form>
  );
}
