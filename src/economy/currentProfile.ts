import { PlayerProfile, createProfile } from './Profile';

let profile: PlayerProfile | null = null;

/** The player's profile for this session (shared by every scene). The save system loads/stores it in Milestone 14. */
export function getProfile(): PlayerProfile {
  if (!profile) profile = createProfile();
  return profile;
}

export function setProfile(p: PlayerProfile): void {
  profile = p;
}
