import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Convene — Make time for connection",
    short_name: "Convene",
    description: "Turn free time into real connection.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f7f2",
    theme_color: "#f7f7f2",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
