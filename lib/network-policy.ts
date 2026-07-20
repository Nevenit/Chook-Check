import { CONSENT_VERSION } from "./settings";
import type { UserSettings } from "./types";

export type NetworkAction =
  | "register_contributor"
  | "download_snapshot"
  | "submit_history"
  | "submit_fairness"
  | "delete_contributions";

export interface NetworkRequestContext {
  userInitiated?: boolean;
  retryPendingDeletion?: boolean;
}

export function isNetworkActionAllowed(
  settings: UserSettings,
  action: NetworkAction,
  context: NetworkRequestContext = {},
): boolean {
  if (action === "delete_contributions") {
    return (
      (context.userInitiated === true ||
        (context.retryPendingDeletion === true &&
          settings.pendingServerDeletion !== null)) &&
      Boolean(settings.deletionToken)
    );
  }
  if (
    settings.reconsentRequired ||
    settings.consentVersion !== CONSENT_VERSION
  ) {
    return false;
  }
  if (action === "register_contributor") {
    return (
      context.userInitiated === true &&
      (settings.historyContributionEnabled || settings.fairnessStudyEnabled)
    );
  }
  if (action === "download_snapshot") {
    return settings.communityDownloadsEnabled;
  }
  if (action === "submit_history") {
    return settings.historyContributionEnabled;
  }
  return settings.fairnessStudyEnabled;
}

export function assertNetworkActionAllowed(
  settings: UserSettings,
  action: NetworkAction,
  context?: NetworkRequestContext,
): void {
  if (!isNetworkActionAllowed(settings, action, context)) {
    throw new Error(`Network action denied by privacy settings: ${action}`);
  }
}
