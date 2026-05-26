import React from "react";

import { getRuntimeSettings, subscribeRuntimeSettings } from "../api/client";

export function useRuntimeSettings() {
  const [settings, setSettings] = React.useState(() => getRuntimeSettings());

  React.useEffect(() => subscribeRuntimeSettings(setSettings), []);

  return settings;
}
