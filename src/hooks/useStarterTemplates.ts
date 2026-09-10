import { useEffect, useState } from 'react';
import type { RoomStarterGoal, RoomStarterTemplate } from '../lib/roomStarterTemplates';
import {
  getResolvedStarterTemplates,
  liveTemplatesForGoal,
  loadStarterTemplateOverrides,
  subscribeStarterTemplates,
} from '../lib/starterTemplateOverrides';

export function useStarterTemplates(): RoomStarterTemplate[] {
  const [templates, setTemplates] = useState<RoomStarterTemplate[]>(() => getResolvedStarterTemplates());

  useEffect(() => {
    const unsub = subscribeStarterTemplates(setTemplates);
    void loadStarterTemplateOverrides();
    return unsub;
  }, []);

  return templates;
}

export function useStarterTemplatesForGoal(goal: RoomStarterGoal): RoomStarterTemplate[] {
  const templates = useStarterTemplates();
  return templates.filter((t) => t.goal === goal && !t.hidden);
}

export { liveTemplatesForGoal };
