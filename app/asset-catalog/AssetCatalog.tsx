"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./AssetCatalog.module.css";

type SignalTone = "cyan" | "amber" | "violet" | "red";

type AgentEntry = {
  id: string;
  name: string;
  role: string;
  signal: string;
  tone: SignalTone;
  portrait: string;
  detail: string;
};

type ThreatEntry = {
  id: string;
  name: string;
  role: string;
  threat: string;
  tone: SignalTone;
  protocol: string;
};

type LootEntry = {
  id: string;
  name: string;
  type: string;
  tone: "cyan" | "amber" | "violet";
  quantity: string;
  detail: string;
};

type ProgressionEntry = {
  id: string;
  name: string;
  signal: string;
  tone: "cyan" | "amber" | "violet" | "red";
  detail: string;
};

const agentEntries: AgentEntry[] = [
  {
    id: "kairos",
    name: "Kairos",
    role: "Temporal support",
    signal: "SYNCED · 98%",
    tone: "cyan",
    portrait: "orbit",
    detail: "Slows breach vectors and keeps the squad's timing window open.",
  },
  {
    id: "kira",
    name: "Kira",
    role: "Precision sniper",
    signal: "LOCKED · 91%",
    tone: "violet",
    portrait: "scope",
    detail: "Marks priority targets before they cross the core perimeter.",
  },
  {
    id: "forge",
    name: "Forge",
    role: "Assault platform",
    signal: "ENGAGED · 86%",
    tone: "amber",
    portrait: "forge",
    detail: "Builds pressure with rotary fire when the network is overwhelmed.",
  },
  {
    id: "covenant",
    name: "Covenant",
    role: "Shield intelligence",
    signal: "STANDBY · 94%",
    tone: "cyan",
    portrait: "halo",
    detail: "Restores squad integrity and reinforces the Covenant Core.",
  },
];

const threatEntries: ThreatEntry[] = [
  {
    id: "virus",
    name: "Virus",
    role: "Melee hunter",
    threat: "TRACE: 12 ACTIVE",
    tone: "red",
    protocol: "Close-range corruption packet",
  },
  {
    id: "phisher",
    name: "Phisher",
    role: "Ranged deception",
    threat: "TRACE: 04 ACTIVE",
    tone: "violet",
    protocol: "Spoofs positions and launches hostile packets",
  },
  {
    id: "trojan",
    name: "Trojan",
    role: "Armoured breach unit",
    threat: "TRACE: 02 ACTIVE",
    tone: "amber",
    protocol: "Absorbs fire while advancing on the Core",
  },
  {
    id: "rootkit",
    name: "Rootkit Prime",
    role: "Multi-stage intrusion",
    threat: "TRACE: BOSS SIGNAL",
    tone: "red",
    protocol: "Splits into hostile processes after shell failure",
  },
];

const lootEntries: LootEntry[] = [
  {
    id: "repair",
    name: "Repair Cache",
    type: "CORE RESTORE",
    tone: "cyan",
    quantity: "+25 HP",
    detail: "Stabilises a damaged Covenant Core.",
  },
  {
    id: "component",
    name: "Sentry Component",
    type: "FIELD BUILD",
    tone: "amber",
    quantity: "+1 MODULE",
    detail: "A recoverable build part for automated defenses.",
  },
  {
    id: "shard",
    name: "Protocol Shard",
    type: "UPGRADE DATA",
    tone: "violet",
    quantity: "+1 DRAFT",
    detail: "Compressed intelligence used to evolve the squad.",
  },
];

const armorEntries: ProgressionEntry[] = [
  { id: "vanguard", name: "Vanguard", signal: "SURVIVABILITY", tone: "cyan", detail: "Armor plates raise operator durability and strengthen incoming repairs." },
  { id: "striker", name: "Striker", signal: "WEAPON OUTPUT", tone: "amber", detail: "Weapon cores raise direct damage and shorten the firing cadence." },
  { id: "relay", name: "Relay", signal: "EMP SUPPORT", tone: "violet", detail: "Relay arrays amplify EMP output and improve support recovery." },
];

const eliteLootEntries: ProgressionEntry[] = [
  { id: "plate", name: "Armor Plate", signal: "ELITE DROP", tone: "cyan", detail: "Rare plating funds one mission-long armor profile." },
  { id: "core", name: "Weapon Core", signal: "ELITE DROP", tone: "amber", detail: "A tuned core reinforces specialist damage and suppression routines." },
  { id: "memory", name: "Agent Memory Chip", signal: "ELITE DROP", tone: "violet", detail: "Memory chips unlock component ranks for the recruited agent who uses them." },
];

const componentUpgradeEntries: ProgressionEntry[] = [
  {
    id: "stasis-array",
    name: "Stasis Array",
    signal: "KAIROS · 2 COMPONENTS",
    tone: "cyan",
    detail: "Accelerates Kairos attack cycles by 12% per rank, up to rank two.",
  },
  {
    id: "hunter-core",
    name: "Hunter Core",
    signal: "KIRA · 3 COMPONENTS",
    tone: "violet",
    detail: "Raises Kira's precision damage by 22% per rank, up to rank two.",
  },
  {
    id: "breach-ammo",
    name: "Breach Ammo",
    signal: "FORGE · 3 COMPONENTS",
    tone: "amber",
    detail: "Adds 16% damage and 10% faster attacks per rank, up to rank two.",
  },
  {
    id: "nanite-reserve",
    name: "Nanite Reserve",
    signal: "COVENANT · 2 COMPONENTS",
    tone: "cyan",
    detail: "Strengthens Covenant healing by 30% per rank, up to rank two.",
  },
];

const terrainSignals: ProgressionEntry[] = [
  { id: "storm", name: "Relay Storm", signal: "EMP +15%", tone: "cyan", detail: "A charged relay field boosts EMP output while altering breach routes." },
  { id: "lanes", name: "Firewall Lanes", signal: "ROUTE SHIFT", tone: "amber", detail: "Firewall channels bend hostile paths into predictable defensive lanes." },
  { id: "fog", name: "Data Fog", signal: "VISIBILITY LOW", tone: "violet", detail: "Fog reduces targeting confidence and lowers reliable EMP output." },
  { id: "split", name: "Split Breach", signal: "TWO VECTORS", tone: "red", detail: "A forked intrusion spreads hostile routes across opposing approach angles." },
];

const disciplineEntries: ProgressionEntry[] = [
  {
    id: "emp-discipline",
    name: "EMP Discipline",
    signal: "CHARGE · PULSE · RECOVER",
    tone: "violet",
    detail: "Build the visible EMP charge through combat, then disrupt the arena with a full pulse before the next cooldown cycle.",
  },
  {
    id: "warband-slots",
    name: "Eight Warband Slots",
    signal: "01–08 · PERSISTENT",
    tone: "cyan",
    detail: "Recruit Kairos through Nova in order. Components and Shards recovered from boss caches fund the final four persistent slots.",
  },
  {
    id: "repair-bay",
    name: "Repair Bay",
    signal: "AGENT RETREAT ROUTE",
    tone: "cyan",
    detail: "Damaged agents withdraw to the separate bay, recover when it is functioning, and return to their autonomous role. The Core remains protect-only.",
  },
  {
    id: "field-kits",
    name: "Field Kits",
    signal: "REPAIR SUPPLIES",
    tone: "amber",
    detail: "Spend repair packs on vulnerable agents away from the bay, or Components on damaged sentries. Neither action restores the Core.",
  },
  {
    id: "temporary-children",
    name: "Temporary Children",
    signal: "4 PER PARENT · 10–20S",
    tone: "violet",
    detail: "Autonomous agents can deploy up to four material-funded children. Their lifetime bars show the 10, 15, or 20 second support window.",
  },
  {
    id: "skill-portraits",
    name: "Skill Portraits",
    signal: "4 ROLE SKILLS · COOLDOWN RINGS",
    tone: "cyan",
    detail: "Portrait controls show each recruited specialist’s ready state: slow, mark, armor break, or repair and barrier support.",
  },
  {
    id: "boss-telegraphs",
    name: "Boss Telegraphs",
    signal: "WAVE 3+ · ONE ACTIVE",
    tone: "red",
    detail: "Armored warbosses announce a targeted strike before it lands. Break armor, move out of the telegraph, and contain the reinforcements.",
  },
  {
    id: "rare-loot",
    name: "Rare Loot",
    signal: "BOSS CACHE · COMPONENTS · SHARDS",
    tone: "amber",
    detail: "Pooled enemy and loot cleanup keeps recovery stable between waves; pending boss drops are credited before the arena resets.",
  },
];

function SignalBadge({ label, tone }: { label: string; tone: SignalTone }) {
  return (
    <span className={`${styles.signalBadge} ${styles[`tone${tone}`]}`}>
      <i aria-hidden="true" />
      {label}
    </span>
  );
}

function AgentPortraitCard({
  agent,
  selected,
  onSelect,
}: {
  agent: AgentEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.agentCard} ${selected ? styles.agentCardSelected : ""}`}
      data-tone={agent.tone}
      onClick={onSelect}
    >
      <span className={`${styles.portrait} ${styles[agent.portrait]}`} aria-hidden="true">
        <i />
        <b />
        <em />
      </span>
      <span className={styles.cardMeta}>
        <SignalBadge label={agent.signal} tone={agent.tone} />
        <strong>{agent.name}</strong>
        <small>{agent.role}</small>
      </span>
    </button>
  );
}

function LootCard({ loot }: { loot: LootEntry }) {
  return (
    <article className={styles.lootCard} data-tone={loot.tone}>
      <div className={styles.lootVisual} aria-hidden="true">
        <i />
        <b />
        <em />
      </div>
      <div>
        <SignalBadge label={loot.type} tone={loot.tone} />
        <h3>{loot.name}</h3>
        <p>{loot.detail}</p>
      </div>
      <strong>{loot.quantity}</strong>
    </article>
  );
}

function ProgressionCard({ entry }: { entry: ProgressionEntry }) {
  return (
    <article className={styles.progressionCard} data-tone={entry.tone}>
      <SignalBadge label={entry.signal} tone={entry.tone} />
      <h3>{entry.name}</h3>
      <p>{entry.detail}</p>
    </article>
  );
}

export default function AssetCatalog() {
  const [selectedAgentId, setSelectedAgentId] = useState(agentEntries[0].id);
  const selectedAgent =
    agentEntries.find((agent) => agent.id === selectedAgentId) ?? agentEntries[0];

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/">
          <span>F</span>
          <strong>FREEMAN / PROTOCOL</strong>
        </Link>
        <Link className={styles.return} href="/">
          ← RETURN TO MISSION
        </Link>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>NETWORK OBSERVATORY · LIVE TELEMETRY</p>
          <h1>
            Living
            <em> Network</em>
          </h1>
          <p>
            A field catalog for the agents, intrusions and recovered components
            currently shaping the Freeman Protocol defense grid.
          </p>
        </div>
        <div className={styles.networkMap} aria-hidden="true">
          <i /><i /><i /><i /><i /><i /><i />
        </div>
        <dl className={styles.metrics}>
          <div><dt>04</dt><dd>LIVE AGENTS</dd></div>
          <div><dt>22</dt><dd>THREATS TRACED</dd></div>
          <div><dt>03</dt><dd>FIELD COMPONENTS</dd></div>
        </dl>
      </section>

      <section className={styles.section} aria-labelledby="live-agents-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>SQUAD SIGNALS</p>
            <h2 id="live-agents-title">Live Agents</h2>
          </div>
          <p>Click a signal card to inspect its current combat directive.</p>
        </div>
        <div className={styles.agentLayout}>
          <div className={styles.agentGrid}>
            {agentEntries.map((agent) => (
              <AgentPortraitCard
                agent={agent}
                key={agent.id}
                selected={selectedAgent.id === agent.id}
                onSelect={() => setSelectedAgentId(agent.id)}
              />
            ))}
          </div>
          <aside className={styles.agentReadout} data-tone={selectedAgent.tone}>
            <SignalBadge label="ACTIVE DIRECTIVE" tone={selectedAgent.tone} />
            <h3>{selectedAgent.name}</h3>
            <strong>{selectedAgent.role}</strong>
            <p>{selectedAgent.detail}</p>
            <span>LINK STATUS // {selectedAgent.signal}</span>
          </aside>
        </div>
      </section>

      <section className={`${styles.section} ${styles.threatSection}`} aria-labelledby="threat-archive-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>INTRUSION INDEX</p>
            <h2 id="threat-archive-title">Threat Archive</h2>
          </div>
          <p>Signatures are prioritised by their ability to reach the Core.</p>
        </div>
        <div className={styles.threatGrid}>
          {threatEntries.map((threat, index) => (
            <article className={styles.threatCard} data-tone={threat.tone} key={threat.id}>
              <span className={styles.threatIndex}>{String(index + 1).padStart(2, "0")}</span>
              <div className={styles.threatGlyph} aria-hidden="true"><i /><b /></div>
              <SignalBadge label={threat.threat} tone={threat.tone} />
              <h3>{threat.name}</h3>
              <strong>{threat.role}</strong>
              <p>{threat.protocol}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles.section} ${styles.lootSection}`} aria-labelledby="field-components-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>RECOVERED AFTER ACTION</p>
            <h2 id="field-components-title">Field Components</h2>
          </div>
          <p>Portable loot cards use the same colors visible in mission feedback.</p>
        </div>
        <div className={styles.lootGrid}>
          {lootEntries.map((loot) => <LootCard key={loot.id} loot={loot} />)}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="armor-profiles-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>MISSION LOADOUT</p>
            <h2 id="armor-profiles-title">Armor Profiles</h2>
          </div>
          <p>Choose one profile per mission; its bonuses appear in the in-game HUD.</p>
        </div>
        <div className={styles.progressionGrid}>
          {armorEntries.map((entry) => <ProgressionCard entry={entry} key={entry.id} />)}
        </div>
      </section>

      <section className={`${styles.section} ${styles.threatSection}`} aria-labelledby="elite-recovery-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>HIGH-VALUE RECOVERY</p>
            <h2 id="elite-recovery-title">Elite Recovery</h2>
          </div>
          <p>Elite breaches can return the components that deepen agent specialisation.</p>
        </div>
        <div className={styles.progressionGrid}>
          {eliteLootEntries.map((entry) => <ProgressionCard entry={entry} key={entry.id} />)}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="agent-components-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>SPECIALIST HARDWARE</p>
            <h2 id="agent-components-title">Agent Component Upgrades</h2>
          </div>
          <p>Install up to two ranks on recruited agents using recovered components.</p>
        </div>
        <div className={styles.progressionGrid}>
          {componentUpgradeEntries.map((entry) => <ProgressionCard entry={entry} key={entry.id} />)}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="terrain-signals-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>ENCOUNTER TELEMETRY</p>
            <h2 id="terrain-signals-title">Terrain Signals</h2>
          </div>
          <p>Terrain labels forecast routing, visibility, and EMP conditions before a wave begins.</p>
        </div>
        <div className={styles.progressionGrid}>
          {terrainSignals.map((entry) => <ProgressionCard entry={entry} key={entry.id} />)}
        </div>
      </section>

      <section className={`${styles.section} ${styles.disciplineSection}`} aria-labelledby="warband-discipline-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>PLAYER SYSTEMS</p>
            <h2 id="warband-discipline-title">Warband Discipline</h2>
          </div>
          <p>Every live mission system is cataloged here with the same status language used by the HUD.</p>
        </div>
        <div className={styles.disciplineGrid}>
          {disciplineEntries.map((entry) => <ProgressionCard entry={entry} key={entry.id} />)}
        </div>
      </section>

      <footer className={styles.footer}>
        <span>FREEMAN PROTOCOL · SIGNALS UPDATE IN REAL TIME</span>
        <span>CYAN / AMBER / VIOLET FIELD PALETTE</span>
      </footer>
    </main>
  );
}
