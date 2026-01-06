import { assertBobTone } from "@/lib/domain/copy/bobVoice";

export type MobileHomeCopy = {
  title: string;
  greetingTemplate: string;
  greetingFallback: string;
  recommendationLabel: string;
  recommendationTitleFallback: string;
  idleReassurance: string;
  recommendationCtaLabel: string;
};

export const mobileHomeCopy: MobileHomeCopy = {
  title: "HandyBob",
  greetingTemplate: "Good morning, {name}",
  greetingFallback: "Good morning",
  recommendationLabel: "Next step",
  recommendationTitleFallback: "Untitled job",
  idleReassurance: "Everything else is up to date. I'll let you know if something changes.",
  recommendationCtaLabel: "Send follow-up",
};

export function validateMobileHomeCopy(): void {
  const check = (value: string, label: string) => assertBobTone(value, label);

  check(mobileHomeCopy.title, "home.title");
  check(mobileHomeCopy.greetingTemplate, "home.greetingTemplate");
  check(mobileHomeCopy.greetingFallback, "home.greetingFallback");
  check(mobileHomeCopy.recommendationLabel, "home.recommendationLabel");
  check(mobileHomeCopy.recommendationTitleFallback, "home.recommendationTitleFallback");
  check(mobileHomeCopy.idleReassurance, "home.idleReassurance");
  check(mobileHomeCopy.recommendationCtaLabel, "home.recommendationCtaLabel");
}
