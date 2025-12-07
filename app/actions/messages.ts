"use server";

import { sendCustomerSmsAction as sendCustomerSmsActionImpl } from "@/app/(app)/messages/actions";

type SendCustomerSmsAction = typeof sendCustomerSmsActionImpl;

export async function sendCustomerSmsAction(
  ...args: Parameters<SendCustomerSmsAction>
) {
  return sendCustomerSmsActionImpl(...args);
}
