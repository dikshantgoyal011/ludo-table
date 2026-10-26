"use client";

import { useEffect, useState } from "react";

/** false during the server render and the first client render. */
export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
