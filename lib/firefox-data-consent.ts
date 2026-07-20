import type { PrivacyModeKey } from "./types";

type DataCollectionPermission =
  | "websiteContent"
  | "browsingActivity"
  | "locationInfo"
  | "technicalAndInteraction";

interface FirefoxPermissionsResult {
  data_collection?: DataCollectionPermission[];
}

interface FirefoxPermissionRequest {
  data_collection: DataCollectionPermission[];
}

const REQUIRED_BY_MODE: Record<PrivacyModeKey, DataCollectionPermission[]> = {
  communityDownloadsEnabled: ["technicalAndInteraction"],
  historyContributionEnabled: ["websiteContent", "browsingActivity"],
  fairnessStudyEnabled: [
    "websiteContent",
    "browsingActivity",
    "locationInfo",
    "technicalAndInteraction",
  ],
  inlineOverlayEnabled: [],
};

function isFirefox(): boolean {
  return navigator.userAgent.includes("Firefox");
}

async function getFirefoxPermissions(): Promise<FirefoxPermissionsResult> {
  return (await browser.permissions.getAll()) as FirefoxPermissionsResult;
}

export async function hasFirefoxDataConsent(
  mode: PrivacyModeKey,
): Promise<boolean> {
  if (!isFirefox() || REQUIRED_BY_MODE[mode].length === 0) return true;
  const granted = (await getFirefoxPermissions()).data_collection;
  if (!granted) return false;
  return REQUIRED_BY_MODE[mode].every((permission) =>
    granted.includes(permission),
  );
}

export async function requestFirefoxDataConsent(
  mode: PrivacyModeKey,
): Promise<boolean> {
  if (!isFirefox() || REQUIRED_BY_MODE[mode].length === 0) return true;
  const permissionsApi = browser.permissions as unknown as {
    request: (request: FirefoxPermissionRequest) => Promise<boolean>;
  };
  return permissionsApi.request({
    data_collection: REQUIRED_BY_MODE[mode],
  });
}

export async function modesMissingFirefoxConsent(): Promise<PrivacyModeKey[]> {
  if (!isFirefox()) return [];
  const modes = Object.keys(REQUIRED_BY_MODE) as PrivacyModeKey[];
  const results = await Promise.all(
    modes.map(async (mode) => ({
      mode,
      granted: await hasFirefoxDataConsent(mode),
    })),
  );
  return results.filter(({ granted }) => !granted).map(({ mode }) => mode);
}
