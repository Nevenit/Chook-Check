import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Chook Check",
    description:
      "Track Australian supermarket prices, detect personalised pricing, and compare across Woolworths and Coles.",
    version: "0.1.0",
    permissions: ["storage", "alarms"],
    host_permissions: [
      "https://www.woolworths.com.au/*",
      "https://www.coles.com.au/*",
    ],
    browser_specific_settings: {
      gecko: {
        id: "chook-check@nevenit.com",
        strict_min_version: "115.0",
      },
    },
  },
});
