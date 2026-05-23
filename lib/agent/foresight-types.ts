/** Shared types for Foresight Engine modules (breaks circular imports) */

export type PersonaArchetype =
  | "regulator"
  | "industry"
  | "academic"
  | "ngo"
  | "media"
  | "public"
  | "investor"
  | "labor"
  | "state";

export type PersonaActionType = "speak" | "react" | "shift_position" | "form_coalition";

export interface SwarmLeader {
  id: string;
  archetype: PersonaArchetype;
  positions: Record<string, number>;
  influence: number;
  memory: Array<{ tick: number; observation: string }>;
  beliefs: string[];
}

export interface SimulationTickEventLite {
  personaId: string;
  action: PersonaActionType;
  content: string;
  cost: number;
  scenarioLean?: string;
}
