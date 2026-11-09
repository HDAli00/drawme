import type { Profile } from "./types";

type NamedProfile = Pick<Profile, "display_name" | "email">;

// The name shown in the app chrome: the chosen display name, else the
// part of the email before the @.
export function displayName(profile: NamedProfile) {
  return profile.display_name?.trim() || profile.email.split("@")[0];
}

export function firstName(profile: NamedProfile) {
  return displayName(profile).split(/\s+/)[0];
}

// Up to two initials for the avatar.
export function initials(profile: NamedProfile) {
  const parts = displayName(profile)
    .split(/[\s._-]+/)
    .filter(Boolean);
  const letters =
    parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.slice(0, 2) ?? "?";
  return letters.toUpperCase();
}
