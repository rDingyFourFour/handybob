import { assertBobTone } from "@/lib/domain/copy/bobVoice";

export type MobileHomeCopy = {
  title: string;
  greetingTemplate: string;
  greetingFallback: string;
  statement: string;
  recommendationLabel: string;
  recommendationTitleFallback: string;
  idleReassurance: string;
  recommendationCtaLabel: string;
};

export const mobileHomeCopy: MobileHomeCopy = {
  title: "Home",
  greetingTemplate: "Good morning, {name}",
  greetingFallback: "Good morning",
  statement: "I'm tracking the job that needs a small nudge.",
  recommendationLabel: "Next step",
  recommendationTitleFallback: "Untitled job",
  idleReassurance: "Everything else is up to date. I'll let you know if something changes.",
  recommendationCtaLabel: "Review job",
};

export function validateMobileHomeCopy(): void {
  const check = (value: string, label: string) => assertBobTone(value, label);

  check(mobileHomeCopy.title, "home.title");
  check(mobileHomeCopy.greetingTemplate, "home.greetingTemplate");
  check(mobileHomeCopy.greetingFallback, "home.greetingFallback");
  check(mobileHomeCopy.statement, "home.statement");
  check(mobileHomeCopy.recommendationLabel, "home.recommendationLabel");
  check(mobileHomeCopy.recommendationTitleFallback, "home.recommendationTitleFallback");
  check(mobileHomeCopy.idleReassurance, "home.idleReassurance");
  check(mobileHomeCopy.recommendationCtaLabel, "home.recommendationCtaLabel");
}
