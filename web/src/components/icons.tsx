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
  Package,
  Webhook,
  Folder,
  FileCode2,
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
  folder: Folder,
  file: FileCode2,
};

export const EDGE_ICON: Record<EdgeKind, LucideIcon> = {
  sync: ArrowRightLeft,
  async: Radio,
  db: HardDrive,
  package: Package,
  config: SlidersHorizontal,
  auth: KeyRound,
  webhook: Webhook,
};
