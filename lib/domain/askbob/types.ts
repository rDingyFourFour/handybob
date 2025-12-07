import { z } from "zod";

export type AskBobSection = "steps" | "materials" | "safety" | "costTime" | "escalation";

export type AskBobMaterialItem = {
  name: string;
  quantity?: string | null;
  notes?: string | null;
};

export interface AskBobResponseData {
  steps: string[];
  materials?: AskBobMaterialItem[];
  safetyCautions?: string[];
  costTimeConsiderations?: string[];
  escalationGuidance?: string[];
  rawModelOutput?: unknown;
}

export interface AskBobSession {
  id: string;
  workspaceId: string;
  userId: string;
  prompt: string;
  jobId?: string | null;
  customerId?: string | null;
  quoteId?: string | null;
  createdAt: string;
}

export interface AskBobResponse extends AskBobResponseData {
  id: string;
  sessionId: string;
  createdAt: string;
}

export type AskBobLinkEntityType = "job" | "message" | "quote";

export interface AskBobLink {
  id: string;
  workspaceId: string;
  askbobResponseId: string;
  entityType: AskBobLinkEntityType;
  entityId: string;
  createdAt: string;
}

export interface AskBobContext {
  workspaceId: string;
  userId: string;
  jobId?: string | null;
  customerId?: string | null;
  quoteId?: string | null;
}

export interface AskBobRequestInput {
  prompt: string;
  workspaceId: string;
  jobId?: string | null;
  customerId?: string | null;
  quoteId?: string | null;
}

export interface AskBobResponseDTOSection {
  type: AskBobSection;
  title: string;
  items: string[];
}

export interface AskBobResponseDTO {
  sessionId: string;
  responseId: string;
  createdAt: string;
  sections: AskBobResponseDTOSection[];
  materials?: AskBobMaterialItem[];
}

// Zod schemas for validation

export const askBobRequestInputSchema = z.object({
  prompt: z.string().min(10, "Please provide a bit more detail about the problem."),
  workspaceId: z.string().min(1, "Workspace is required."),
  jobId: z.string().min(1).optional().nullable(),
  customerId: z.string().min(1).optional().nullable(),
  quoteId: z.string().min(1).optional().nullable(),
});

export const askBobMaterialItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const askBobResponseDataSchema = z.object({
  steps: z.array(z.string()).default([]),
  materials: z.array(askBobMaterialItemSchema).optional(),
  safetyCautions: z.array(z.string()).optional(),
  costTimeConsiderations: z.array(z.string()).optional(),
  escalationGuidance: z.array(z.string()).optional(),
  rawModelOutput: z.unknown().optional(),
});

export type AskBobRequestInputSchema = z.infer<typeof askBobRequestInputSchema>;
export type AskBobResponseDataSchema = z.infer<typeof askBobResponseDataSchema>;
