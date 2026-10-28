// Build-only exports for the explicit integration harness, never a renderer API.
export { WorkspaceController } from "../src/main/workspace/controller";
export { WorkspaceResume } from "../src/main/workspace/resume";
export { PersonalStore } from "../src/main/personal/store";
export { MeetingKeys, historyProfile } from "../src/main/meetings/keys";
export { AssistantController } from "../src/main/ai/controller";
export { ChatGptProvider } from "../src/main/ai/plan/provider";
export { ChatGptAccounts } from "../src/main/ai/plan/accounts";
export { planFetch } from "../src/main/ai/plan/http";
export { defaultConfig } from "../src/shared/modes";
export { HistoryWorker } from "../src/main/meetings/store";
