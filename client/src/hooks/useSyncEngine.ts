import { useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { supabase } from "@/lib/supabase";
import { useProfile } from "./useProfile";
import { toast } from "sonner";

export function useSyncEngine() {
  const { profile } = useProfile();

  // Queries for local data
  const { data: disciplines } = trpc.discipline.list.useQuery(undefined, {
    enabled: !!profile,
  });
  const { data: topicsData } = trpc.topic.list.useQuery(undefined, {
    enabled: !!profile,
  });
  const { data: revisions } = trpc.revision.list.useQuery(
    {},
    { enabled: !!profile },
  );

  const topics = topicsData?.topics || [];

  const syncToCloud = useCallback(async () => {
    if (!profile) return;

    try {
      console.log("[SyncEngine] Starting synchronization...");

      // 1. Sync Disciplines
      if (disciplines && disciplines.length > 0) {
        const discToSync = disciplines.map((d) => ({
          user_id: profile.id,
          id: d.id, // Using the same ID as local to keep relationships
          name: d.name,
          color: d.color,
          weight: d.weight,
          study_time_seconds: d.studyTimeSeconds || 0,
          updated_at: new Date().toISOString(),
        }));

        const { error: dErr } = await supabase
          .from("disciplines")
          .upsert(discToSync, { onConflict: "user_id,id" });

        if (dErr) throw dErr;
      }

      // 2. Sync Topics
      if (topics && topics.length > 0) {
        const topicsToSync = topics.map((t) => ({
          user_id: profile.id,
          id: t.id,
          discipline_id: t.disciplineId,
          name: t.name,
          study_date: t.studyDate,
          performance: t.performance,
          updated_at: new Date().toISOString(),
        }));

        const { error: tErr } = await supabase
          .from("topics")
          .upsert(topicsToSync, { onConflict: "user_id,id" });

        if (tErr) throw tErr;
      }

      // 3. Sync Revisions
      if (revisions && revisions.length > 0) {
        const revsToSync = revisions.map((r) => ({
          user_id: profile.id,
          id: r.id,
          topic_id: r.topicId,
          scheduled_date: r.scheduledDate,
          type: r.type,
          revision_number: r.revisionNumber,
          completed: r.completed,
          updated_at: new Date().toISOString(),
        }));

        const { error: rErr } = await supabase
          .from("revisions")
          .upsert(revsToSync, { onConflict: "user_id,id" });

        if (rErr) throw rErr;
      }

      console.log("[SyncEngine] Sync completed successfully.");
    } catch (err: any) {
      console.error("[SyncEngine] Sync failed:", err);
      // Silent fail in production, but we could toast if it's persistent
    }
  }, [profile, disciplines, topics, revisions]);

  // Run sync when data changes (with debounce)
  useEffect(() => {
    if (!profile) return;

    const timer = setTimeout(() => {
      syncToCloud();
    }, 5000); // Wait 5 seconds after last change

    return () => clearTimeout(timer);
  }, [disciplines, topics, revisions, syncToCloud, profile]);

  return { syncToCloud };
}
