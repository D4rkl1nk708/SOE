import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { trpc } from "@/lib/trpc";

const isAndroid = Capacitor.isNativePlatform();

export function useNotifications() {
  const { data: stats } = trpc.dashboard.getStats.useQuery(undefined, {
    enabled: isAndroid,
    staleTime: 1000 * 60 * 60, // 1 hour cache
  });

  const { data: revisions } = trpc.revision.list.useQuery(undefined, {
    enabled: isAndroid,
    staleTime: 1000 * 60 * 30,
  });

  useEffect(() => {
    if (!isAndroid) return;
    scheduleRevisionNotifications(revisions, stats?.disciplineStats as any[]);
  }, [stats, revisions]);
}

async function scheduleRevisionNotifications(revisions: any, disciplineStats: any[]) {
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");

    // Request permission
    const permResult = await LocalNotifications.requestPermissions();
    if (permResult.display !== "granted") return;

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const notifKey = `notif_scheduled_${todayStr}`;

    // Only schedule once per day
    if (localStorage.getItem(notifKey)) return;
    localStorage.setItem(notifKey, "1");

    // Cancel previous pending notifications to avoid duplicates
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({ notifications: pending.notifications });
    }

    const notifications: any[] = [];
    let id = 1000;

    // 1. Pending revisions today notification (at 8am)
    const pendingRevisions = Array.isArray(revisions) ? revisions.filter((r: any) => {
      if (r.status === "completed" || r.status === "ignored") return false;
      return r.scheduledDate <= todayStr;
    }) : [];

    if (pendingRevisions.length > 0) {
      const scheduleAt = new Date(today);
      scheduleAt.setHours(8, 0, 0, 0);
      if (scheduleAt > today) {
        notifications.push({
          id: id++,
          title: "Revisões pendentes",
          body: `Você tem ${pendingRevisions.length} revisão(ões) para fazer hoje. Não deixe acumular!`,
          schedule: { at: scheduleAt },
          sound: "default",
          smallIcon: "ic_stat_icon",
          channelId: "soe_revisions",
        });
      }

      // Evening reminder at 19h if still have pending
      const eveningAt = new Date(today);
      eveningAt.setHours(19, 0, 0, 0);
      if (eveningAt > today) {
        notifications.push({
          id: id++,
          title: "Lembrete de revisão",
          body: `Ainda tem ${pendingRevisions.length} revisão(ões) para hoje. Que tal revisar agora?`,
          schedule: { at: eveningAt },
          sound: "default",
          smallIcon: "ic_stat_icon",
          channelId: "soe_revisions",
        });
      }
    }

    // 2. Discipline neglect reminders
    if (disciplineStats) {
      const neglected = disciplineStats
        .filter((disc: any) => {
          const topics = disc.topics || [];
          const latest = topics.map((t: any) => t.studyDate || "").filter(Boolean).sort().reverse()[0];
          if (!latest) return false;
          const days = Math.floor((today.getTime() - new Date(latest).getTime()) / 86400000);
          return days >= 7;
        })
        .sort((a: any, b: any) => {
          const aLatest = (a.topics||[]).map((t:any)=>t.studyDate||"").filter(Boolean).sort().reverse()[0] || "";
          const bLatest = (b.topics||[]).map((t:any)=>t.studyDate||"").filter(Boolean).sort().reverse()[0] || "";
          return aLatest.localeCompare(bLatest);
        })
        .slice(0, 1)[0];

      if (neglected) {
        const topics = neglected.topics || [];
        const latest = topics.map((t:any) => t.studyDate||"").filter(Boolean).sort().reverse()[0];
        const days = Math.floor((today.getTime() - new Date(latest).getTime()) / 86400000);
        const notifAt = new Date(today);
        notifAt.setHours(10, 30, 0, 0);
        if (notifAt > today) {
          notifications.push({
            id: id++,
            title: "Disciplina esquecida",
            body: `Você não estuda ${neglected.name} há ${days} dias. Que tal revisar hoje?`,
            schedule: { at: notifAt },
            sound: "default",
            smallIcon: "ic_stat_icon",
            channelId: "soe_revisions",
          });
        }
      }
    }

    if (notifications.length > 0) {
      // Ensure channel exists on Android
      try {
        await LocalNotifications.createChannel({
          id: "soe_revisions",
          name: "Revisões SOE",
          description: "Lembretes de revisão e estudo",
          importance: 4,
          visibility: 1,
          sound: "default",
          vibration: true,
        });
      } catch { /* channel may already exist */ }

      await LocalNotifications.schedule({ notifications });
    }
  } catch (e) {
    // Fallback: Web Notifications API
    try {
      if (!("Notification" in window)) return;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;

      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];
      const key = `notif_web_${todayStr}`;
      if (localStorage.getItem(key)) return;

      const pendingCount = Array.isArray(revisions) ? revisions.filter((r: any) =>
        r.status !== "completed" && r.status !== "ignored" && r.scheduledDate <= todayStr
      ).length : 0;

      if (pendingCount > 0) {
        new Notification("Revisões pendentes — SOE", {
          body: `Você tem ${pendingCount} revisão(ões) para fazer hoje!`,
          icon: "/favicon.ico",
          tag: "soe-revisions",
        });
        localStorage.setItem(key, "1");
      }
    } catch { /* silently fail */ }
  }
}
