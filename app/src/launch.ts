import { Capacitor, registerPlugin } from "@capacitor/core";
import { markLaunchRevealed } from "./startup";
import { version } from "../package.json";
export const appVersion = version;
const launchBridge = registerPlugin<{
  ready(): Promise<void>;
  theme(options: { theme: string }): Promise<{ dark: boolean }>;
}>("CaillouteLaunch");
let finishing: ReturnType<typeof setTimeout> | undefined;
export function finishLaunch() {
  if (finishing) return;
  const launch = document.getElementById("launch-screen");
  finishing = setTimeout(
    () => {
      markLaunchRevealed();
      performance.mark("cailloute:ready");
      launch?.remove();
      document.getElementById("root")?.removeAttribute("inert");
      document.getElementById("root")?.removeAttribute("aria-hidden");
      if (Capacitor.isNativePlatform())
        void launchBridge.ready().catch(() => {});
    },
    0,
  );
}
export async function nativeLaunchTheme(theme: string): Promise<boolean | undefined> {
  if (!Capacitor.isNativePlatform()) return undefined;
  try { return (await launchBridge.theme({ theme })).dark; }
  catch { return undefined; }
}

