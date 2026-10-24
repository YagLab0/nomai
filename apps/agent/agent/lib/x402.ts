import { getAddress, parseUnits } from "viem";
import {
  FACILITATOR_URL,
  NETWORK_CAIP2,
  networkName,
  payeeAddress,
  TOKENS,
  type TokenDef,
} from "./celo";

// Minimal x402 v2 seller flow against Celo's hosted facilitator.
// Wire format: PAYMENT-REQUIRED / PAYMENT-SIGNATURE / PAYMENT-RESPONSE
// (v1 clients send X-PAYMENT instead of PAYMENT-SIGNATURE — we accept both).
// Spec: https://docs.x402.org · Celo: https://x402.celo.org/skill.md
//
// Dormant until a paid channel uses it — eve channels are Request→Response
// handlers, so the @x402/hono middleware does not plug in here.

export interface PaymentRequirements {
  scheme: "exact";
  network: string;
  amount: string;
  asset: `0x${string}`;
  payTo: `0x${string}`;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string; assetTransferMethod?: string };
}

export interface PaymentPayload {
  x402Version: number;
  accepted: PaymentRequirements;
  payload: {
    signature: string;
    authorization?: Record<string, unknown>;
    [k: string]: unknown;
  };
}

export function paidToken(): TokenDef & { symbol: string } {
  const symbol = (process.env.PAID_ASSET ?? (networkName() === "sepolia" ? "usdc" : "wars"))
    .toLowerCase();
  const token = TOKENS[networkName()][symbol];
  if (!token) {
    throw new Error(
      `PAID_ASSET "${symbol}" is not supported on ${networkName()} — options: ${Object.keys(
        TOKENS[networkName()],
      ).join(", ")}`,
    );
  }
  return { symbol: symbol.toUpperCase(), ...token };
}

/** Whole-token price (e.g. "0.01" USDC, "10" wARS) -> base units string. */
function priceAmount(token: TokenDef): string {
  return parseUnits(process.env.PAID_PRICE ?? "0.01", token.decimals).toString();
}

export function buildRequirements(): PaymentRequirements {
  const token = paidToken();
  return {
    scheme: "exact",
    network: NETWORK_CAIP2[networkName()],
    amount: priceAmount(token),
    asset: getAddress(token.address),
    payTo: payeeAddress(),
    maxTimeoutSeconds: 60,
    extra: {
      name: token.eip712Name,
      version: token.eip712Version,
      ...(token.transferMethod === "permit2" ? { assetTransferMethod: "permit2" } : {}),
    },
  };
}

function paymentRequiredBody(resourceUrl: string, description: string) {
  return {
    x402Version: 2,
    resource: { url: resourceUrl, description, mimeType: "application/json" },
    accepts: [buildRequirements()],
    // Not optional for permit2 assets: without this key the buyer never signs
    // the sponsored EIP-2612 permit and first-time wallets get
    // 412 permit2_allowance_required.
    extensions: {
      eip2612GasSponsoring: {
        info: {
          description: "The facilitator sponsors the EIP-2612 permit to Permit2.",
          version: "1",
        },
      },
    },
  };
}

function b64json(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

/** The 402 response: PAYMENT-REQUIRED header + the same object as JSON body. */
export function paymentRequired(request: Request, description: string): Response {
  const body = paymentRequiredBody(new URL(request.url).pathname, description);
  return Response.json(body, {
    status: 402,
    headers: { "payment-required": b64json(body) },
  });
}

/** Reads the signed payment off the retry request (v2 or v1 header). */
export function decodePayment(request: Request): PaymentPayload | null {
  const raw = request.headers.get("payment-signature") ?? request.headers.get("x-payment");
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

interface FacilitatorResult {
  isValid?: boolean;
  payer?: string;
  invalidReason?: string;
  success?: boolean;
  transaction?: string;
  errorReason?: string;
}

async function facilitatorPost(
  path: "/verify" | "/settle",
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<FacilitatorResult> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (path === "/settle") {
    const key = process.env.X402_API_KEY;
    if (!key) throw new Error("X402_API_KEY is not set (get one at https://x402.celo.org)");
    headers["X-API-Key"] = key;
    headers["X-Idempotency-Key"] = crypto.randomUUID();
  }
  const res = await fetch(`${FACILITATOR_URL[networkName()]}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ x402Version: 2, paymentPayload, paymentRequirements }),
  });
  const body = await res.json().catch(() => ({}));
  // An invalid payment comes back as 400/402 with isValid:false — that is a
  // normal outcome the caller maps to a fresh 402, not an exception.
  if (!res.ok && !("isValid" in body) && !("invalidReason" in body)) {
    throw new Error(`facilitator ${path} → ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

export const verifyPayment = (p: PaymentPayload, r: PaymentRequirements) =>
  facilitatorPost("/verify", p, r);

/** /settle is key-gated; returns null when no key is configured (dev dry-run). */
export async function settlePayment(
  p: PaymentPayload,
  r: PaymentRequirements,
): Promise<FacilitatorResult | null> {
  if (!process.env.X402_API_KEY) return null;
  return facilitatorPost("/settle", p, r);
}

/** settlement receipt header for the 200 response. */
export function paymentResponseHeader(settle: FacilitatorResult): string {
  return b64json({
    success: settle.success,
    transaction: settle.transaction,
    network: NETWORK_CAIP2[networkName()],
    payer: settle.payer,
  });
}
