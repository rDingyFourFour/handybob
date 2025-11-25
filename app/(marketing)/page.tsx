import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

const marketingHighlights = [
  "Keep quotes and invoices tidy so customers always understand what they're paying for.",
  "Schedule calls, visits, and jobs without bouncing between calendars.",
  "Let the AI assistant summarize conversations and flag what needs attention next.",
];

const howItWorksSteps = [
  {
    title: "Capture leads",
    body: "Record calls, web form submissions, or jot them down manually so work never slips through the cracks.",
  },
  {
    title: "Turn into quotes & invoices",
    body: "Use the AI assistant to scope work and send polished quotes, then convert accepted ones into invoices.",
  },
  {
    title: "Stay on top of jobs & appointments",
    body: "Track work, calendar slots, and inbox items from the job dashboard so nothing falls behind.",
  },
];

const onboardingSteps = [
  {
    title: "Add your business details",
    description: "Personalize your workspace name, payment info, and public messaging.",
    href: "/settings/workspace",
  },
  {
    title: "Add your first customer",
    description: "Capture a contact so jobs, quotes, and calls have a home.",
    href: "/customers/new",
  },
  {
    title: "Create your first job",
    description: "Track leads, quotes, and schedules in one tidy job record.",
    href: "/jobs/new",
  },
  {
    title: "Generate your first quote with AI",
    description: "Use the AI assistant to scope work and send a proposal.",
    href: "/quotes",
  },
  {
    title: "Turn on your public booking link",
    description: "Share a link so customers can request service directly.",
    href: "/settings/workspace",
  },
];

async function getUser() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

function MarketingHero() {
  return (
    <div className="flex flex-col gap-10 rounded-3xl border border-slate-800 bg-slate-900/60 p-10 shadow-2xl shadow-slate-900/40">
      <div className="space-y-4 text-center">
        <p className="text-xs uppercase tracking-[0.4em] text-slate-500">HandyBob</p>
        <h1 className="text-4xl font-semibold text-slate-50">HandyBob</h1>
        <p className="text-lg text-slate-400">Full support office in an app for independent handypeople.</p>
      </div>
      <ul className="space-y-3 text-left text-lg text-slate-200">
        {marketingHighlights.map((highlight) => (
          <li className="flex items-start gap-3" key={highlight}>
            <span className="mt-1 h-2 w-2 rounded-full bg-slate-500" />
            <span>{highlight}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/signup" className="hb-button text-sm">
          Create account
        </Link>
        <Link href="/login" className="hb-button-ghost text-sm">
          Sign in
        </Link>
        <Link
          href="/appointments/new"
          className="hb-button px-4 py-3 text-sm shadow-xl shadow-slate-900"
        >
          Book a new appointment
        </Link>
      </div>
    </div>
  );
}

export default async function MarketingPage() {
  const user = await getUser();
  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-12">
      <MarketingHero />

      <section className="space-y-4">
        <div className="space-y-2 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">How HandyBob works</p>
          <h2 className="text-3xl font-semibold text-slate-100">Manage leads, billing, and jobs in one place.</h2>
          <p className="text-sm text-slate-400">
            Built for independent crews who need AI copilots, shared timelines, and billing that stays tidy.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {howItWorksSteps.map((step) => (
            <div key={step.title} className="rounded-2xl border border-slate-800/70 bg-slate-950/20 p-6">
              <p className="text-sm font-semibold text-slate-100">{step.title}</p>
              <p className="text-xs text-slate-400">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex flex-col gap-2 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Ready when you are</p>
          <h2 className="text-3xl font-semibold text-slate-100">Launch your workspace in minutes</h2>
          <p className="text-sm text-slate-400">
            Start with a few quick wins. Hand off tasks to the AI assistant, keep customers in the loop, and ship
            beautiful quotes.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {onboardingSteps.map((step) => (
            <Link
              key={step.title}
              href={step.href}
              className="group block rounded-2xl border border-slate-800/80 bg-slate-900/60 px-6 py-5 text-left transition hover:border-slate-600"
            >
              <p className="text-sm font-semibold text-slate-100">{step.title}</p>
              <p className="text-xs text-slate-400">{step.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
