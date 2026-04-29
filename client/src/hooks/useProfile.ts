import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "common" | "premium";
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();

        if (
          error &&
          (error.code === "PGRST116" || error.message.includes("not found"))
        ) {
          // Profile doesn't exist, create one
          const newProfile = {
            id: session.user.id,
            email: session.user.email,
            full_name:
              session.user.user_metadata?.full_name ||
              session.user.email?.split("@")[0] ||
              "Usuário SOE",
            role: "common",
          };

          const { data: insertedData, error: insertError } = await supabase
            .from("profiles")
            .insert(newProfile)
            .select()
            .single();

          if (!insertError) {
            setProfile(insertedData as Profile);
          } else {
            console.error("Error creating profile:", insertError);
            setProfile(newProfile as Profile); // Fallback to local state
          }
        } else if (data) {
          setProfile(data as Profile);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    }

    loadProfile();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      if (!session) {
        setProfile(null);
        setLoading(false);
      } else {
        loadProfile();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const isAdmin = profile?.role === "admin";
  const isPremium = profile?.role === "premium" || isAdmin;

  return { profile, isAdmin, isPremium, loading, setProfile };
}
