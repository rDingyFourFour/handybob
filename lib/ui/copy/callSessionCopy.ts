import { assertBobTone } from "@/lib/domain/copy/bobVoice";

export const callSessionCopy = {
  header: {
    title: "Call session",
    subtitleTemplate:
      "Before you call {customerName} about {jobTitle}, choose Automated or Guided. After the call, record the outcome and generate the follow-up here.",
    subtitleFallback: "Choose Automated or Guided. Then record the outcome and generate the follow-up here.",
    backToCalls: "Back to calls",
  },
  callControl: {
    primaryLabel: "Primary",
    secondaryLabel: "Secondary",
    detailsLabel: "Details",
    inboundBadge: "Inbound",
    directionInbound: "Inbound call",
    directionOutbound: "Outbound call",
    fromLabel: "From",
    toLabel: "To",
    createdLabel: "Created",
  },
  mode: {
    kicker: "Call choice",
    title: "Choose your call path",
    helper: "Choose Automated or Guided. You can switch later.",
    unselectedHelper: "Choose a mode to start.",
    automated: {
      label: "Automated (AskBob)",
      description: "AskBob places the call, records it, and captures notes.",
      helper: "Use this when you want AskBob to run the call.",
      selectLabel: "Use automated",
    },
    manual: {
      label: "Guided (manual)",
      description: "You place the call. HandyBob keeps the script, prompts, and wrap-up in one place.",
      helper: "Use this when you want to lead the call.",
      selectLabel: "Use guided",
    },
    selectedLabel: "Selected",
    changeLabel: "Change",
    optionTagSelected: "Selected",
    optionTagDefault: "Option",
    switchPrompt: "Want to switch modes?",
    switchToAutomated: "Switch to Automated",
    switchToManual: "Switch to Guided",
  },
  statusStrip: {
    title: "Progress",
    labels: {
      created: "Session",
      status: "Call",
      terminal: "Terminal",
      outcome: "Outcome",
      afterCall: "Follow-up",
    },
    statuses: {
      notYet: "Not started",
      created: "Created",
      queued: "Queued",
      inProgress: "In progress",
      terminal: "Terminal",
      outcomeSaved: "Saved",
      outcomeNeedsReach: "Set reach",
      outcomeNeedsOutcome: "Set outcome",
      followupDraftReady: "Draft ready",
      followupReady: "Ready",
    },
  },
  primaryCta: {
    label: {
      startAutomated: "Start automated call",
      startGuided: "Start guided call",
      refreshStatus: "Refresh call status",
      captureOutcome: "Record outcome",
      generateFollowup: "Go to wrap-up",
      openComposer: "Open follow-up draft",
      disabled: "Choose a call mode",
      loadingAutomated: "Starting call...",
    },
    explanation: {
      start_automated_call: "AskBob is ready to place the call.",
      start_guided_call: "You're ready to place the call with guidance.",
      select_call_mode: "Choose Automated or Guided to continue.",
      ready: "Wrap-up is ready.",
      not_terminal: "Call is still running. Wrap-up unlocks when it ends.",
      missing_outcome: "Record the outcome to unlock the follow-up.",
      missing_reached_flag: "Confirm whether the customer was reached.",
      missing_call_context: "Add a script and customer phone number to start.",
      missing_followup_context: "Add outcome notes or a call summary to generate a follow-up.",
      missing_job_link: "Link a job to continue.",
      draft_ready: "Draft is ready to review and send.",
      draft_missing_body: "Draft is still generating.",
      draft_missing_job: "Link a job to open the composer.",
      no_call_session: "Call session data is missing. Refresh the page.",
      fallback: "Check the call details to continue.",
    },
  },
  secondaryActions: {
    title: "Secondary",
    openJob: "Open job",
    openCalls: "Open calls list",
    openMessages: "Open messages",
  },
  manualTools: {
    title: "Manual tools",
    helper: "Quick actions if you're placing the call yourself.",
    callCardTitle: "Call manually",
    callCardHelper: "Use this number if you’re calling outside HandyBob.",
    copyPhone: "Copy phone number",
    copyPhoneSuccess: "Copied",
    missingPhone: "Add a customer phone number to enable manual tools.",
  },
  manualToolsScript: {
    copyScript: "Copy call script",
    copyScriptSuccess: "Copied",
    missingScript: "Add a call script to enable script copy.",
  },
  workspace: {
    title: "Call workspace",
    helper: "Automated runs the call. Guided supports you while you call.",
    availabilityTitle: "Requirements",
    automatedLabel: "Automated call",
    manualLabel: "Manual call",
    ready: "Ready",
    missingAutomated: "Missing script or phone",
    missingManual: "Missing customer phone",
    automatedModeLabel: "Automated mode",
    manualModeLabel: "Manual mode",
    automatedTitle: "Automated call (AskBob)",
    automatedHelper: "Start the call, watch status, and capture notes.",
    manualTitle: "Guided call (manual)",
    manualHelper: "Use the script and prompts while you call.",
  },
  wrapUp: {
    badge: "Wrap-up",
    title: "Wrap up the call",
    helper: "Record what happened, then generate the follow-up.",
    outcomeRequiredBanner: "Call ended. Record the outcome.",
    outcome: {
      badge: "Call outcome",
      title: "Call outcome",
      helper: "Record what happened so follow-ups stay accurate.",
      askBobHint: "This was an AskBob-assisted call.",
      terminalBanner: "Call ended. Record the outcome.",
      inProgressBanner: "Call is in progress. You can record the outcome when it ends.",
      recordedTitle: "Outcome recorded",
      notRecorded: "Outcome not recorded.",
      edit: "Edit outcome",
      record: "Record outcome",
      reachedLabel: "Reached customer",
      reachOptions: {
        reached: "Reached",
        noAnswer: "No answer",
        notSure: "Not sure",
      },
      outcomeCodeLabel: "Outcome code",
      outcomeCodePlaceholder: "Select outcome...",
      notesLabel: "Notes (optional)",
      notesHelper:
        "Keep it concise (up to {maxLength} characters) and focused on what happened.",
      saving: "Saving...",
      savingHelper: "We will store the reach, outcome, and notes when you save.",
      savedJustNow: "Saved just now",
      cancel: "Cancel",
      save: "Save outcome",
      legacyRecorded: "Outcome recorded (legacy data).",
    },
    afterCall: {
      badge: "AskBob",
      title: "Follow-up (AskBob)",
      helper:
        "AskBob summarizes the call and drafts a message. You can edit before sending.",
      postCallStatus: "Post call status",
      statusLabels: {
        callState: "Call state",
        outcome: "Outcome",
        reached: "Reached flag",
        notes: "Notes",
        recording: "Recording",
        draft: "AskBob draft",
      },
      statusValues: {
        terminal: "Terminal",
        inProgress: "In progress",
        recorded: "Recorded",
        missing: "Missing",
        present: "Present",
        empty: "Empty",
        unavailable: "Unavailable",
      },
      generate: "Generate follow-up",
      regenerate: "Regenerate follow-up",
      generating: "Generating...",
      readiness: {
        notTerminal:
          "Call is still in progress. Wait until it finishes before generating a follow-up.",
        noCallSession: "Call session data is unavailable. Refresh the page to try again.",
        missingOutcome: "Record how the call went before generating a follow-up.",
        missingReached: "Mark whether the customer was reached before generating a follow-up.",
        missingContext:
          "AskBob needs outcome notes, a summary, or a script to draft the follow-up.",
        outcomeSavedHint: "Outcome saved. You can generate the follow-up now.",
        suggestedChannel: "Suggested channel:",
      },
      errorFallback: "AskBob could not summarize the call right now.",
      summaryLabel: "Call summary",
      draftLabel: "Draft message",
      draftEmpty: "AskBob did not propose a message draft.",
      draftCharacters: "characters",
      openComposer: "Open follow-up draft",
      reviewComposerHelper: "Review and send in the composer.",
    },
  },
  jobDetail: {
    openCallSessionCta: "Open call session",
    opening: "Opening call session...",
    helper: "Go to the call session to choose Automated or Guided calling.",
    nextActionActive: "Open the call session to place the call.",
    nextActionNew: "Open the call session to place the call.",
  },
  disabled: {
    missingPhone: "Add a customer phone number to continue.",
    missingScript: "Add a call script to continue.",
    notReady: "Not ready yet. Complete the required steps above.",
    safeFailure: "Something went wrong. Try again in a moment.",
  },
} as const;

export function validateCallSessionCopy(): void {
  const check = (value: string, label: string) => assertBobTone(value, label);

  check(callSessionCopy.header.title, "header.title");
  check(callSessionCopy.header.subtitleTemplate, "header.subtitleTemplate");
  check(callSessionCopy.header.subtitleFallback, "header.subtitleFallback");
  check(callSessionCopy.header.backToCalls, "header.backToCalls");

  check(callSessionCopy.mode.kicker, "mode.kicker");
  check(callSessionCopy.mode.title, "mode.title");
  check(callSessionCopy.mode.helper, "mode.helper");
  check(callSessionCopy.mode.unselectedHelper, "mode.unselectedHelper");

  Object.entries(callSessionCopy.primaryCta.label).forEach(([labelKey, labelText]) => {
    check(labelText, `primaryCta.label.${labelKey}`);
  });

  Object.entries(callSessionCopy.primaryCta.explanation).forEach(([explanationKey, explanationText]) => {
    check(explanationText, `primaryCta.explanation.${explanationKey}`);
  });

  check(callSessionCopy.statusStrip.title, "statusStrip.title");
  Object.entries(callSessionCopy.statusStrip.labels).forEach(([labelKey, labelText]) => {
    check(labelText, `statusStrip.labels.${labelKey}`);
  });

  Object.entries(callSessionCopy.statusStrip.statuses).forEach(([statusKey, statusText]) => {
    check(statusText, `statusStrip.statuses.${statusKey}`);
  });
}
