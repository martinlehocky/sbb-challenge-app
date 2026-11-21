import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lyne ships modern ESM web components (Lit); let Next compile them.
  transpilePackages: [
    "@sbb-esta/lyne-elements",
    "@sbb-esta/lyne-elements-experimental",
    "@sbb-esta/lyne-react",
    "@sbb-esta/lyne-react-experimental",
    "@lit/react",
    "@lit/reactive-element",
    "lit",
    "lit-html",
    "lit-element",
  ],
};

export default nextConfig;
