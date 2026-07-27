"use client";

import { useMemo, useState } from "react";
import styles from "./AssetCatalog.module.css";

type AssetStatus = "concept-ready" | "runtime" | "queued";

type Asset = {
  id: string;
  name: string;
  category: string;
  role: string;
  description: string;
  source: string;
  runtime: string;
  model: string;
  status: AssetStatus;
  image?: string;
  accent: string;
  target?: string;
  textures?: string;
  animations?: string[];
  next: string;
};

const assets: Asset[] = [
  {
    id: "operator-freeman",
    name: "Operator Freeman",
    category: "Characters",
    role: "Playable cyber operator",
    description:
      "Grounded human field operator with layered graphite armour, burnt-orange hardware and a pale-cyan visor.",
    source: "Generated 3D reference",
    runtime: "Procedural operator active",
    model: "Meshy GLB pending",
    status: "concept-ready",
    image: "/asset-catalog/ian-freeman.webp",
    accent: "#dc7540",
    target: "Humanoid · 20–30K triangles · ≤ 6 MB GLB",
    textures: "2K PBR · albedo, normal, roughness, metalness, emissive",
    animations: ["Idle", "Run", "Shoot", "Dash", "Hit", "Death"],
    next: "Confirm identity direction, convert in Meshy, rig and bind the six core animations.",
  },
  {
    id: "agent-kairos",
    name: "Kairos",
    category: "AI Agents",
    role: "Time-control support AI",
    description:
      "Floating temporal machine with a readable circular core, segmented armour and two orbital ring systems.",
    source: "Generated 3D reference",
    runtime: "Procedural drone active",
    model: "Meshy GLB pending",
    status: "concept-ready",
    image: "/asset-catalog/kairos-agent.webp",
    accent: "#83d7df",
    target: "Mechanical · 15–25K triangles · ≤ 5 MB GLB",
    textures: "2K PBR · restrained cyan and orange emissive channels",
    animations: ["Hover", "Orbit", "Beam attack", "Slow field", "Hit", "Shutdown"],
    next: "Convert as separated body and rings so the orbital parts can animate independently.",
  },
  {
    id: "enemy-virus",
    name: "Virus",
    category: "Enemies",
    role: "Basic melee hunter",
    description:
      "Corrupted quadruped machine with a strong infected core, grounded limbs and a silhouette readable from above.",
    source: "Generated 3D reference",
    runtime: "Procedural enemy active",
    model: "Meshy GLB pending",
    status: "concept-ready",
    image: "/asset-catalog/virus-enemy.webp",
    accent: "#d34f3d",
    target: "Quadruped · 15–22K triangles · ≤ 5 MB GLB",
    textures: "2K PBR · blackened metal and controlled red corruption",
    animations: ["Idle", "Run", "Lunge", "Hit", "Stagger", "Death"],
    next: "Convert with clean limb separation, rig as a quadruped and preserve the exposed core.",
  },
  {
    id: "agent-kira",
    name: "Kira",
    category: "AI Agents",
    role: "Heavy-damage sniper AI",
    description:
      "Long-range agent built around a narrow targeting silhouette and a disciplined precision weapon.",
    source: "Procedural Three.js",
    runtime: "Active",
    model: "Concept queued",
    status: "runtime",
    accent: "#9ebfc0",
    next: "Generate a clean sniper-drone reference after the first Meshy conversion proves the style.",
  },
  {
    id: "agent-forge",
    name: "Forge",
    category: "AI Agents",
    role: "Rapid-fire assault AI",
    description:
      "Aggressive close-support unit intended to read through rotating barrels and a compact armoured mass.",
    source: "Procedural Three.js",
    runtime: "Active",
    model: "Concept queued",
    status: "runtime",
    accent: "#d8a14b",
    next: "Design around a strong rotary weapon silhouette without turning it into a generic turret.",
  },
  {
    id: "agent-covenant",
    name: "Covenant",
    category: "AI Agents",
    role: "Healing and shield AI",
    description:
      "Protective support unit planned around folding shield wings and a calm restoration field.",
    source: "Procedural Three.js",
    runtime: "Active",
    model: "Concept queued",
    status: "runtime",
    accent: "#d2ddd7",
    next: "Generate after Kairos to keep the support agents related but immediately distinguishable.",
  },
  {
    id: "enemy-phisher",
    name: "Phisher",
    category: "Enemies",
    role: "Ranged deception unit",
    description:
      "Keeps distance and launches hostile packets. The future model needs a clear ranged telegraph.",
    source: "Procedural Three.js",
    runtime: "Active",
    model: "Concept queued",
    status: "runtime",
    accent: "#bf693e",
    next: "Build an antenna-led silhouette with a visible charge state before each projectile.",
  },
  {
    id: "enemy-trojan",
    name: "Trojan",
    category: "Enemies",
    role: "Armoured breach unit",
    description:
      "Slow heavy attacker designed to absorb fire and pressure the Core at close range.",
    source: "Procedural Three.js",
    runtime: "Active",
    model: "Concept queued",
    status: "runtime",
    accent: "#9f4638",
    next: "Create a siege-machine body with broad armour and an obvious breakable front plate.",
  },
  {
    id: "enemy-rootkit",
    name: "Rootkit",
    category: "Enemies",
    role: "Multi-stage boss",
    description:
      "Final breach organism that splits into hostile processes after its shell is damaged.",
    source: "Procedural Three.js",
    runtime: "Active",
    model: "Concept queued",
    status: "runtime",
    accent: "#e05a42",
    next: "Design the boss around a shell that can visibly open during its second phase.",
  },
  {
    id: "world-core",
    name: "Covenant Core",
    category: "World",
    role: "Primary defense objective",
    description:
      "Central network reactor whose light, shield and structural damage communicate mission health.",
    source: "Procedural Three.js",
    runtime: "Active",
    model: "Art pass queued",
    status: "runtime",
    accent: "#ffc29a",
    next: "Replace the floating crystal with a layered reactor and three visible damage states.",
  },
  {
    id: "world-arena",
    name: "Network District 01",
    category: "World",
    role: "Cyber-defense arena kit",
    description:
      "Isometric combat floor, server towers, perimeter structures, grid and camera-safe collision space.",
    source: "Procedural Three.js",
    runtime: "Active",
    model: "Modular kit queued",
    status: "runtime",
    accent: "#688c93",
    next: "Build reusable floor, wall, server, gate and hologram modules before adding another district.",
  },
  {
    id: "vfx-combat",
    name: "Combat VFX Pool",
    category: "VFX & Audio",
    role: "Hits, beams, bursts and telegraphs",
    description:
      "Runtime pool for projectiles, impact bursts, recruitment rings, boss portals and ability feedback.",
    source: "Runtime-generated",
    runtime: "Active",
    model: "No mesh import required",
    status: "runtime",
    accent: "#e28b58",
    next: "Add directional hit sparks, enemy death signatures and stronger boss-phase transitions.",
  },
  {
    id: "audio-combat",
    name: "Combat Audio System",
    category: "VFX & Audio",
    role: "Action and state feedback",
    description:
      "Procedural cues for firing, recruitment, damage, wave transitions, victory and defeat.",
    source: "Web Audio",
    runtime: "Active",
    model: "Authored sound pack queued",
    status: "runtime",
    accent: "#9ebfc0",
    next: "Replace shared tones with distinct weapon, agent, enemy and impact families.",
  },
  {
    id: "world-district-02",
    name: "Network District 02",
    category: "World",
    role: "Future mission environment",
    description:
      "A second combat district reserved for a different objective and environmental hazard.",
    source: "Not produced",
    runtime: "Inactive",
    model: "Queued after core loop",
    status: "queued",
    accent: "#59666a",
    next: "Do not produce until the first arena, squad commands and boss encounter are proven fun.",
  },
];

const categories = ["All", "Characters", "AI Agents", "Enemies", "World", "VFX & Audio"];

const statusLabel: Record<AssetStatus, string> = {
  "concept-ready": "CONCEPT READY",
  runtime: "RUNTIME",
  queued: "QUEUED",
};

export default function AssetCatalog() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [selectedId, setSelectedId] = useState(assets[0].id);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return assets.filter((asset) => {
      const inCategory = category === "All" || asset.category === category;
      const inSearch =
        !needle ||
        `${asset.name} ${asset.category} ${asset.role} ${asset.source} ${asset.status}`
          .toLowerCase()
          .includes(needle);
      return inCategory && inSearch;
    });
  }, [category, query]);

  const selected = assets.find((asset) => asset.id === selectedId) ?? assets[0];
  const conceptCount = assets.filter((asset) => asset.status === "concept-ready").length;
  const runtimeCount = assets.filter((asset) => asset.runtime === "Active").length;

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <a className={styles.brand} href="/">
          <span>F</span>
          <strong>FREEMAN / PROTOCOL</strong>
        </a>
        <a className={styles.return} href="/">
          ← RETURN TO MISSION
        </a>
      </header>

      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>PRODUCTION INVENTORY · BUILD 004</p>
          <h1>
            Asset
            <em> Ledger</em>
          </h1>
          <p className={styles.lede}>
            Every concept, runtime system and pending 3D model is tracked separately.
            A reference image is not counted as a shipped model.
          </p>
        </div>
        <div className={styles.metrics} aria-label="Asset totals">
          <span>
            <strong>{String(assets.length).padStart(2, "0")}</strong>
            <small>TRACKED ASSETS</small>
          </span>
          <span>
            <strong>{String(conceptCount).padStart(2, "0")}</strong>
            <small>3D REFERENCES READY</small>
          </span>
          <span>
            <strong>00</strong>
            <small>IMPORTED GLB MODELS</small>
          </span>
          <span>
            <strong>{String(runtimeCount).padStart(2, "0")}</strong>
            <small>ACTIVE SYSTEMS</small>
          </span>
        </div>
      </section>

      <section className={styles.toolbar} aria-label="Asset filters">
        <label>
          <span>SEARCH ASSETS</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, role, source…"
          />
        </label>
        <div className={styles.filters}>
          {categories.map((item) => (
            <button
              type="button"
              key={item}
              className={category === item ? styles.activeFilter : ""}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      <div className={styles.workspace}>
        <section className={styles.catalog} aria-label="Asset catalog">
          <div className={styles.catalogHeading}>
            <span>{filtered.length} ENTRIES</span>
            <span>SELECT AN ASSET FOR PRODUCTION DETAILS</span>
          </div>
          <div className={styles.grid}>
            {filtered.map((asset) => (
              <button
                type="button"
                key={asset.id}
                className={`${styles.card} ${selected.id === asset.id ? styles.selectedCard : ""}`}
                style={{ "--asset-accent": asset.accent } as React.CSSProperties}
                onClick={() => setSelectedId(asset.id)}
              >
                <span className={styles.visual}>
                  {asset.image ? (
                    <img src={asset.image} alt={`${asset.name} 3D reference`} />
                  ) : (
                    <span className={styles.placeholder} aria-hidden="true">
                      <i />
                      <b>{asset.name.slice(0, 2).toUpperCase()}</b>
                    </span>
                  )}
                  <small className={`${styles.status} ${styles[asset.status]}`}>
                    {statusLabel[asset.status]}
                  </small>
                </span>
                <span className={styles.cardCopy}>
                  <small>{asset.category}</small>
                  <strong>{asset.name}</strong>
                  <span>{asset.role}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <aside
          className={styles.inspector}
          style={{ "--asset-accent": selected.accent } as React.CSSProperties}
        >
          <p className={styles.eyebrow}>PRODUCTION RECORD</p>
          <h2>{selected.name}</h2>
          <p className={styles.role}>{selected.role}</p>

          {selected.image && (
            <div className={styles.inspectorImage}>
              <img src={selected.image} alt={`${selected.name} production reference`} />
            </div>
          )}

          <p className={styles.description}>{selected.description}</p>

          <dl className={styles.facts}>
            <div>
              <dt>SOURCE</dt>
              <dd>{selected.source}</dd>
            </div>
            <div>
              <dt>GAME RUNTIME</dt>
              <dd>{selected.runtime}</dd>
            </div>
            <div>
              <dt>3D MODEL</dt>
              <dd>{selected.model}</dd>
            </div>
            {selected.target && (
              <div>
                <dt>MESH TARGET</dt>
                <dd>{selected.target}</dd>
              </div>
            )}
            {selected.textures && (
              <div>
                <dt>TEXTURES</dt>
                <dd>{selected.textures}</dd>
              </div>
            )}
          </dl>

          {selected.animations && (
            <div className={styles.animationBlock}>
              <small>REQUIRED ANIMATIONS</small>
              <div>
                {selected.animations.map((animation) => (
                  <span key={animation}>{animation}</span>
                ))}
              </div>
            </div>
          )}

          <div className={styles.nextAction}>
            <small>NEXT PRODUCTION ACTION</small>
            <p>{selected.next}</p>
          </div>
        </aside>
      </div>

      <footer className={styles.footer}>
        <span>FREEMAN PROTOCOL · IAN GOH</span>
        <span>CONCEPT ≠ MODEL ≠ RUNTIME</span>
      </footer>
    </main>
  );
}
