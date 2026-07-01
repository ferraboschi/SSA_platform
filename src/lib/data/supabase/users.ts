import "server-only";

import type { UserRepository } from "../repository";
import { profileToUser } from "./mappers";
import type { ProfileRow } from "./rows";
import type { RepoContext } from "./context";

export function makeUsersRepo(ctx: RepoContext): UserRepository {
  const { sb, svc } = ctx;

  const usersRepo: UserRepository = {
    async list() {
      const { data, error } = await sb
        .from("profiles")
        .select("*")
        .order("first_name");
      if (error) throw error;
      return (data as ProfileRow[]).map(profileToUser);
    },

    async getById(id) {
      const { data, error } = await sb
        .from("profiles")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data ? profileToUser(data as ProfileRow) : null;
    },

    async getCurrent() {
      let authUser = null;
      try {
        const { data: authData } = await sb.auth.getUser();
        authUser = authData.user;
      } catch {
        authUser = null;
      }
      if (!authUser) {
        // No session — return a ZERO-CAPABILITY placeholder so SSR pages don't
        // crash, but every role check denies it. (Pages are already redirected
        // to /login by the (app) layout; server actions self-authorize on this.)
        return {
          id: "anonymous",
          first: "",
          last: "",
          name: "—",
          role: "Ospite",
          roleKey: "guest",
          email: "",
          phone: "",
          city: "",
          position: "",
          initials: "?",
          tone: "neutral",
        };
      }
      const { data, error } = await sb
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .maybeSingle();
      if (error) throw error;
      return data
        ? profileToUser(data as ProfileRow)
        : profileToUser({
            id: authUser.id,
            email: authUser.email ?? "",
            first_name: "",
            last_name: "",
            display_name: null,
            // Least privilege: a signed-in user whose profile row hasn't been
            // created yet (race with the AFTER INSERT trigger) must NOT default
            // to manager — that would be a transient privilege escalation.
            role: "guest",
            phone: "",
            city: "",
            position: "",
            photo_url: null,
            locale: "IT",
          });
    },

    async setCurrent() {
      // Switching user is a sign-in flow — handled by Supabase Auth, not here.
      throw new Error(
        "setCurrent is not supported with Supabase auth — use sign-in/out instead.",
      );
    },

    async updateProfile(id, patch) {
      const update: Record<string, unknown> = {};
      if (patch.first !== undefined) update.first_name = patch.first;
      if (patch.last !== undefined) update.last_name = patch.last;
      if (patch.email !== undefined) update.email = patch.email;
      if (patch.phone !== undefined) update.phone = patch.phone;
      if (patch.city !== undefined) update.city = patch.city;
      if (patch.position !== undefined) update.position = patch.position;
      if (patch.photo !== undefined) update.photo_url = patch.photo ?? null;

      const { data, error } = await svc
        .from("profiles")
        .update(update)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return profileToUser(data as ProfileRow);
    },
  };

  return usersRepo;
}
