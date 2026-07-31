"use client";

import { useState } from "react";
import FreemanProtocol from "./FreemanProtocol";
import { createOverlayState, toggleOverlay } from "./game/combat-presentation-rules.mjs";

export default function Home() {
  const [overlayState, setOverlayState] = useState(createOverlayState);

  return (
    <FreemanProtocol
      overlayState={overlayState}
      onToggleOverlay={(panel) =>
        setOverlayState(toggleOverlay(overlayState, panel))
      }
    />
  );
}
