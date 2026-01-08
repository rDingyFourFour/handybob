import { describe, expect, it } from "vitest";

import { bobFlowScenarioList } from "@/lib/domain/bobflow/bobFlowScenario";
import { resolveHomePrimaryCardPayload } from "@/lib/domain/bobflow/resolveHomePrimaryCardPayload";
import { assertValidHomePayload } from "@/lib/domain/bobflow/homePrimaryCardPayload";
import { INTERNAL_REASSURANCE_SUBCOPY } from "@/lib/domain/bobflow/homePrimaryCardCopy";

const BASE_JOB_ID = "job-contract";
const BASE_WORKSPACE_ID = "workspace-contract";
const BASE_CUSTOMER_NAME = "Contract customer";
const BASE_TELEMETRY = { contract: true };

describe("BobFlow home primary card payload contract", () => {
  for (const scenario of bobFlowScenarioList) {
    it(`produces a valid payload for ${scenario}`, () => {
      const payload = resolveHomePrimaryCardPayload({
        scenario,
        jobId: BASE_JOB_ID,
        jobTitle: `${scenario} job`,
        workspaceId: BASE_WORKSPACE_ID,
        telemetryPayload: BASE_TELEMETRY,
        fallbackHref: `/m/jobs/${BASE_JOB_ID}`,
        customerName: BASE_CUSTOMER_NAME,
      });
      expect(payload).not.toBeNull();
      if (!payload) {
        return;
      }
      assertValidHomePayload(payload);
      if (scenario.startsWith("External.")) {
        expect(payload.requiresUserIntervention).toBe(true);
        expect(payload.href).toBeTruthy();
        if (!payload.href) {
          throw new Error(`Payload missing href for ${scenario}`);
        }
        const isFollowupScenario = scenario.includes(".followup.");
        if (isFollowupScenario) {
          expect(payload.href).toContain("/m/follow-up");
        } else {
          expect(payload.href).toContain("/m/action");
          const [, queryString] = payload.href.split("?");
          const searchParams = new URLSearchParams(queryString ?? "");
          expect(searchParams.get("scenario")).toBe(scenario);
          expect(searchParams.get("jobId")).toBe(BASE_JOB_ID);
          expect(searchParams.get("workspaceId")).toBe(BASE_WORKSPACE_ID);
        }
      } else {
        expect(payload.requiresUserIntervention).toBe(false);
        expect(payload.ctaLabel).toBe("Move on");
        expect(payload.ctaIntent).toBe("move_on");
        expect(payload.href).toBeTruthy();
        if (!payload.href) {
          throw new Error(`Payload missing href for ${scenario}`);
        }
        expect(payload.href).toContain("/m/action");
        const [, queryString] = payload.href.split("?");
        const searchParams = new URLSearchParams(queryString ?? "");
        expect(searchParams.get("scenario")).toBe(scenario);
        expect(searchParams.get("jobId")).toBe(BASE_JOB_ID);
        expect(searchParams.get("workspaceId")).toBe(BASE_WORKSPACE_ID);
        expect(searchParams.get("intent")).toBe("move_on");
      }
      if (scenario.startsWith("Internal.")) {
        expect(payload.customerLine).toBe(BASE_CUSTOMER_NAME);
        expect(payload.title).toBe(`${scenario} job`);
        expect(payload.subcopy).toBe(INTERNAL_REASSURANCE_SUBCOPY);
      } else if (scenario.includes(".followup.")) {
        expect(payload.customerLine).toBe(BASE_CUSTOMER_NAME);
      } else {
        expect(payload.customerLine).toBeUndefined();
      }
    });
  }

  it("throws when Internal scenarios lack a customer", () => {
    expect(() =>
      resolveHomePrimaryCardPayload({
        scenario: "Internal.diagnose",
        jobId: BASE_JOB_ID,
        jobTitle: "Diagnostics job",
        workspaceId: BASE_WORKSPACE_ID,
        telemetryPayload: BASE_TELEMETRY,
        fallbackHref: `/m/jobs/${BASE_JOB_ID}`,
        customerName: null,
      }),
    ).toThrow(/Internal scenario .* requires a customer name/);
  });

  it("keeps consistent CTA labels for representative scenarios", () => {
    const internalDiagnose = resolveHomePrimaryCardPayload({
      scenario: "Internal.diagnose",
      jobId: BASE_JOB_ID,
      jobTitle: "Diagnostics job",
      workspaceId: BASE_WORKSPACE_ID,
      telemetryPayload: BASE_TELEMETRY,
      customerName: BASE_CUSTOMER_NAME,
    });
    expect(internalDiagnose?.ctaLabel).toBe("Move on");
    expect(internalDiagnose?.ctaIntent).toBe("move_on");
    expect(internalDiagnose?.title).toBe("Diagnostics job");
    expect(internalDiagnose?.customerLine).toBe(BASE_CUSTOMER_NAME);
    expect(internalDiagnose?.subcopy).toBe(INTERNAL_REASSURANCE_SUBCOPY);

    const internalMaterials = resolveHomePrimaryCardPayload({
      scenario: "Internal.materials",
      jobId: BASE_JOB_ID,
      jobTitle: "Materials job",
      workspaceId: BASE_WORKSPACE_ID,
      telemetryPayload: BASE_TELEMETRY,
      customerName: BASE_CUSTOMER_NAME,
    });
    expect(internalMaterials?.ctaLabel).toBe("Move on");
    expect(internalMaterials?.ctaIntent).toBe("move_on");
    expect(internalMaterials?.title).toBe("Materials job");
    expect(internalMaterials?.customerLine).toBe(BASE_CUSTOMER_NAME);
    expect(internalMaterials?.subcopy).toBe(INTERNAL_REASSURANCE_SUBCOPY);

    const internalMsg = resolveHomePrimaryCardPayload({
      scenario: "Internal.msg",
      jobId: BASE_JOB_ID,
      jobTitle: "Message job",
      workspaceId: BASE_WORKSPACE_ID,
      telemetryPayload: BASE_TELEMETRY,
      customerName: BASE_CUSTOMER_NAME,
    });
    expect(internalMsg?.ctaLabel).toBe("Move on");
    expect(internalMsg?.ctaIntent).toBe("move_on");
    expect(internalMsg?.title).toBe("Message job");
    expect(internalMsg?.customerLine).toBe(BASE_CUSTOMER_NAME);
    expect(internalMsg?.subcopy).toBe(INTERNAL_REASSURANCE_SUBCOPY);

    const externalMsgQuote = resolveHomePrimaryCardPayload({
      scenario: "External.msg.followup.quote",
      jobId: BASE_JOB_ID,
      jobTitle: "Message quote job",
      workspaceId: BASE_WORKSPACE_ID,
      telemetryPayload: BASE_TELEMETRY,
      customerName: BASE_CUSTOMER_NAME,
    });
    expect(externalMsgQuote?.ctaLabel).toBe("Send message");
    expect(externalMsgQuote?.ctaIntent).toBe("follow_up");
    expect(externalMsgQuote?.customerLine).toBe(BASE_CUSTOMER_NAME);

    const externalCallsSchedule = resolveHomePrimaryCardPayload({
      scenario: "External.calls.followup.schedule",
      jobId: BASE_JOB_ID,
      jobTitle: "Call schedule job",
      workspaceId: BASE_WORKSPACE_ID,
      telemetryPayload: BASE_TELEMETRY,
      customerName: BASE_CUSTOMER_NAME,
    });
    expect(externalCallsSchedule?.ctaLabel).toBe("Send follow-up");
    expect(externalCallsSchedule?.ctaIntent).toBe("follow_up");

    const externalEmailDelay = resolveHomePrimaryCardPayload({
      scenario: "External.email.notification.delay",
      jobId: BASE_JOB_ID,
      jobTitle: "Email delay job",
      workspaceId: BASE_WORKSPACE_ID,
      telemetryPayload: BASE_TELEMETRY,
    });
    expect(externalEmailDelay?.ctaLabel).toBe("Send follow-up");
    expect(externalEmailDelay?.ctaIntent).toBe("review");

    for (const scenario of bobFlowScenarioList) {
      if (scenario.startsWith("External.")) {
        const payload = resolveHomePrimaryCardPayload({
          scenario,
          jobId: BASE_JOB_ID,
          jobTitle: "External job",
          workspaceId: BASE_WORKSPACE_ID,
          telemetryPayload: BASE_TELEMETRY,
        });
        expect(payload?.requiresUserIntervention).toBe(true);
        if (scenario.includes(".followup.")) {
          expect(payload?.href).toContain("/m/follow-up");
        } else {
          expect(payload?.href).toContain("/m/action");
        }
      }
    }
  });
});
