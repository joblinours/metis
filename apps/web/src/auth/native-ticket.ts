import "server-only";
import { connectTicketIdentifier, parseConnectTicket } from "./native";
import { isNativeToken } from "./native-link";
import { getAuth } from "./server";

export async function consumeNativeConnectTicket(
  ticket: string,
  pathname: string,
): Promise<string | null> {
  if (!isNativeToken(ticket)) return null;
  const ctx = await getAuth().$context;
  const row = await ctx.internalAdapter.consumeVerificationValue(connectTicketIdentifier(ticket));
  const grant = row ? parseConnectTicket(row.value) : null;
  if (!grant || grant.pathname !== pathname) return null;
  return grant.userId;
}
