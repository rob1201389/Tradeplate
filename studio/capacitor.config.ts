import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.carstudio.photos",
  appName: "Car Studio",
  webDir: "dist",
  android: {
    // Lets the app talk to a processing server on the local network over plain http.
    allowMixedContent: true,
  },
};

export default config;
