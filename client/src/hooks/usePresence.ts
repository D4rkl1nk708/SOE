// @ts-nocheck
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useProfile } from "./useProfile";

export interface PresenceState {
  user_id: string;
  email: string;
  online_at: string;
  full_name: string;
}

export function usePresence() {
  const { profile } = useProfile();
  const [onlineUsers, setOnlineUsers] = useState<Record<string, PresenceState>>(
    {},
  );

  useEffect(() => {
    if (!profile) return;

    const channel = supabase.channel("online-users", {
      config: {
        presence: {
          key: profile.id,
        },
      },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const users: Record<string, PresenceState> = {};

        Object.keys(state).forEach((key: any) => {
          const presence = state[key][0] as any;
          users[key] = {
            user_id: key,
            email: presence.email,
            full_name: presence.full_name,
            online_at: presence.online_at,
          };
        });

        setOnlineUsers(users);
      })
      .on("presence", { event: "join" }, ({ key, newPresences }) => {
        console.log("User joined:", key, newPresences);
      })
      .on("presence", { event: "leave" }, ({ key, leftPresences }) => {
        console.log("User left:", key, leftPresences);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: profile.id,
            email: profile.email,
            full_name: profile.full_name,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [profile]);

  return { onlineUsers, count: Object.keys(onlineUsers).length };
}
