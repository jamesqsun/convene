import {
  communicationPlatforms,
  phoneSchema,
  type CommunicationPlatform,
  type Data,
  type PlanContact,
  type Profile,
} from "./domain";

export function contactValue(
  profile: Profile,
  platform: CommunicationPlatform,
): string | undefined {
  if (!profile.platforms?.includes(platform)) return;
  const value =
    platform === "Phone" ? profile.phone : profile.handles?.[platform];
  if (!value) return;
  if (platform === "Phone" || platform === "WhatsApp") {
    const parsed = phoneSchema.safeParse(value);
    return parsed.success ? parsed.data : undefined;
  }
  return /^@?[A-Za-z0-9_.#-]{1,100}$/.test(value)
    ? value.replace(/^@/, "")
    : undefined;
}

export function sharedCommunication(
  a: Profile,
  b: Profile,
): CommunicationPlatform | undefined {
  // Prefer a shared app; the explicitly enabled phone option is a fallback.
  return [
    ...communicationPlatforms.filter((p) => p !== "Phone"),
    "Phone" as const,
  ].find((p) => contactValue(a, p) && contactValue(b, p));
}

// Contacts are never attached to public person cards or returned to nonparticipants.
export function planContactsFor(data: Data, userId: string): PlanContact[] {
  const me = data.people.find((p) => p.id === userId);
  if (!me) return [];
  return data.hangouts
    .filter(
      (h) => h.status !== "cancelled" && h.participantIds.includes(userId),
    )
    .flatMap((h) =>
      h.participantIds
        .filter((id) => id !== userId)
        .flatMap((id) => {
          if (
            data.connections.some(
              (c) =>
                ((c.userId === userId && c.otherId === id) ||
                  (c.userId === id && c.otherId === userId)) &&
                ["blocked", "declined"].includes(c.status),
            )
          )
            return [];
          const person = data.people.find((p) => p.id === id);
          if (!person) return [];
          const platform =
            h.communicationPlatform ??
            sharedCommunication(me.profile, person.profile);
          if (!platform || !contactValue(me.profile, platform)) return [];
          const value = contactValue(person.profile, platform);
          return value
            ? [
                {
                  hangoutId: h.id,
                  userId: id,
                  platform,
                  value,
                  seeded: person.seeded,
                },
              ]
            : [];
        }),
    );
}
