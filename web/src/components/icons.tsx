import {
  Boxes,
  Database,
  Cloud,
  Workflow,
  ShieldCheck,
  SlidersHorizontal,
  ArrowRightLeft,
  Radio,
  HardDrive,
  KeyRound,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import type { EdgeKind, NodeKind } from "@/lib/data";

export const NODE_ICON: Record<NodeKind, LucideIcon> = {
  service: Boxes,
  external: Cloud,
  database: Database,
  queue: Workflow,
  auth: ShieldCheck,
  config: SlidersHorizontal,
};

export const EDGE_ICON: Record<EdgeKind, LucideIcon> = {
  sync: ArrowRightLeft,
  async: Radio,
  db: HardDrive,
  config: SlidersHorizontal,
  auth: KeyRound,
  webhook: Webhook,
};
