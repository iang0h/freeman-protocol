import type { Metadata } from "next";
import AssetCatalog from "./AssetCatalog";

export const metadata: Metadata = {
  title: "Asset Ledger | Freeman Protocol",
  description:
    "Production inventory for Freeman Protocol characters, AI agents, enemies, world assets, VFX and audio.",
};

export default function AssetCatalogPage() {
  return <AssetCatalog />;
}
