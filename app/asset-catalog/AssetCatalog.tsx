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

      <footer className={styles.footer}>
        <span>FREEMAN PROTOCOL · SIGNALS UPDATE IN REAL TIME</span>
        <span>CYAN / AMBER / VIOLET FIELD PALETTE</span>
      </footer>
    </main>
  );
}
