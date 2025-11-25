// Quote domain surface: re-export the AI helpers so routes can import `generateQuoteForJob` and `prepareMediaInsightsForQuote` via domain/.
export { generateQuoteForJob, prepareMediaInsightsForQuote } from "@/lib/domain/quotes";
