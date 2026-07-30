import type { MetadataRoute } from "next";

const siteUrl = "https://freeman.skillrivals.com";
const lastModified = new Date("2026-07-30T00:00:00.000Z");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteUrl}/asset-catalog`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.7,
    },
  ];
}
