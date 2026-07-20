import { defineConfig } from "wxt";

export default defineConfig({
  manifestVersion: 3,
  modules: ["@wxt-dev/module-react"],
  hooks: {
    "build:manifestGenerated": (_wxt, manifest) => {
      manifest.content_scripts ??= [];
      manifest.content_scripts.push(
        {
          matches: ["https://www.woolworths.com.au/*"],
          js: ["woolworths-collector.js"],
          run_at: "document_idle",
        },
        {
          matches: ["https://www.coles.com.au/*"],
          js: ["coles-collector.js"],
          run_at: "document_idle",
        },
      );
    },
  },
  manifest: {
    name: "Chook Check",
    description:
      "Track Australian supermarket prices, detect personalised pricing, and compare across Woolworths and Coles.",
    version: "0.1.0",
    permissions: ["storage", "alarms", "scripting"],
    host_permissions: [
      "https://www.woolworths.com.au/*",
      "https://www.coles.com.au/*",
      "https://chook-check-api.nevenit.workers.dev/*",
    ],
    browser_specific_settings: {
      gecko: {
        id: "chook-check@nevenit.com",
        strict_min_version: "140.0",
        data_collection_permissions: {
          required: ["none"],
          optional: [
            "websiteContent",
            "browsingActivity",
            "locationInfo",
            "technicalAndInteraction",
          ],
        },
      },
    },
  },
});
