import {
  Ghost,
  Skull,
  Bot,
  Cpu,
  Terminal as TerminalIcon,
  KeyRound,
  Shield,
  Bug,
  Eye,
  Zap,
  Radio,
  Cat,
  type LucideIcon,
} from "lucide-react";

export type AvatarPreset = {
  id: string;
  label: string;
  Icon: LucideIcon;
  color: string; // oklch or hex
};

// Hacker/cyber temalı hazır avatarlar. Kullanıcı bunlar dışında bir şey yükleyemez.
export const AVATARS: AvatarPreset[] = [
  { id: "ghost",    label: "Ghost",    Icon: Ghost,         color: "oklch(0.82 0.20 145)" },
  { id: "skull",    label: "Skull",    Icon: Skull,         color: "oklch(0.72 0.20 30)" },
  { id: "bot",      label: "Bot",      Icon: Bot,           color: "oklch(0.75 0.13 210)" },
  { id: "cpu",      label: "Cpu",      Icon: Cpu,           color: "oklch(0.72 0.20 320)" },
  { id: "terminal", label: "Terminal", Icon: TerminalIcon,  color: "oklch(0.82 0.20 145)" },
  { id: "key",      label: "Key",      Icon: KeyRound,      color: "oklch(0.85 0.16 90)" },
  { id: "shield",   label: "Shield",   Icon: Shield,        color: "oklch(0.70 0.18 260)" },
  { id: "bug",      label: "Bug",      Icon: Bug,           color: "oklch(0.78 0.20 130)" },
  { id: "eye",      label: "Eye",      Icon: Eye,           color: "oklch(0.75 0.18 190)" },
  { id: "zap",      label: "Zap",      Icon: Zap,           color: "oklch(0.85 0.20 100)" },
  { id: "radio",    label: "Radio",    Icon: Radio,         color: "oklch(0.72 0.18 350)" },
  { id: "cat",      label: "Cat",      Icon: Cat,           color: "oklch(0.80 0.15 60)" },
];

export const DEFAULT_AVATAR = AVATARS[4]; // terminal

export function getAvatar(id: string | null | undefined): AvatarPreset {
  if (!id) return DEFAULT_AVATAR;
  return AVATARS.find((a) => a.id === id) ?? DEFAULT_AVATAR;
}

export function UserAvatar({
  id,
  size = 36,
  className = "",
}: {
  id: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const a = getAvatar(id);
  const Icon = a.Icon;
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md border border-border/60 bg-background/60 ${className}`}
      style={{
        width: size,
        height: size,
        boxShadow: `0 0 0 1px ${a.color}33, 0 0 12px ${a.color}55`,
      }}
      aria-label={`Avatar: ${a.label}`}
    >
      <Icon style={{ color: a.color }} className="drop-shadow" size={Math.round(size * 0.55)} />
    </span>
  );
}
