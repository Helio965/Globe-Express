import { Explorer } from "@/components/Explorer";

export const dynamic = "force-dynamic";
export default function Page() {
  // Indirect lookup avoids Next's build-time NEXT_PUBLIC substitution for this server-only read.
  const runtimeEnvironment = process.env;
  return <Explorer config={{ googleMapsKey: runtimeEnvironment.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "", googlePlacesEnabled: Boolean(runtimeEnvironment.GOOGLE_MAPS_SERVER_API_KEY) }} />;
}
