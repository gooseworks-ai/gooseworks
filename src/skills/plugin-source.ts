import { createHash } from "node:crypto";
import generated from "./plugin-source.generated.json";
import pin from "./plugin-source-pin.json";

// JSON imports keep the published CLI independent of the private app checkout.
const expectedBytes = JSON.stringify(generated, null, 2) + "\n";
if (
  createHash("sha256").update(expectedBytes).digest("hex") !==
    pin.bundleSha256 ||
  generated.source.commit !== pin.commit ||
  generated.source.inputState !== "clean"
) {
  throw new Error(
    "Generated plugin source differs from its app pin; import a reviewed app export",
  );
}
export const pluginSource = generated;
