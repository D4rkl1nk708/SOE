import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Clock,
  Target,
  TrendingUp,
  BookOpen,
  Flame,
  CheckCircle2,
  AlertTriangle,
  Calendar,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { format, isToday, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  valueClass = "",
  loading = false,
}: {
  title: string;
  value: number | string;
  subtitle: string;
  icon: React.ElementType;
  valueClass?: string;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-16 mb-1" />
        ) : (
          <div className={`text-2xl font-bold ${valueClass}`}>{value}</div>
        )}
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const { data: stats, isLoading } = trpc.dashboard.getStats.useQuery();

  const today = new Date().toISOString().split("T")[0];
  const streak = stats?.settings?.studyStreak;
  const examDate = stats?.settings?.exams?.[0]?.date;
  const examName = stats?.settings?.exams?.[0]?.name;
  const daysUntilExam = examDate
    ? Math.ceil((new Date(examDate).getTime() - Date.now()) / 86400000)
    : null;

  const hasData = !isLoading && (stats?.totalTopics ?? 0) > 0;

  return (
    <div className="space-y-6">
      {/* Welcome / Exam Banner */}
      <div className="bg-gradient-to-r from-primary to-accent rounded-lg p-6 text-primary-foreground">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-1">
              {hasData ? "Bom estudo! 💪" : "Bem-vindo ao SOE!"}
            </h1>
            <p className="text-lg opacity-90">
              {hasData
                ? `Você tem ${stats!.pendingRevisions} revisão(ões) pendente(s) hoje.`
                : "Organize seus estudos com o método 25+50, acompanhe seu progresso e alcance seus objetivos"}
            </p>
          </div>
          {streak && streak.current > 0 && (
            <div className="flex-shrink-0 bg-white/20 rounded-lg px-4 py-2 flex flex-col items-center">
              <Flame className="h-6 w-6 mb-1" />
              <span className="text-2xl font-bold leading-none">
                {streak.current}
              </span>
              <span className="text-xs opacity-80">dias seguidos</span>
            </div>
          )}
        </div>
        {daysUntilExam !== null && daysUntilExam >= 0 && (
          <div className="mt-3 bg-white/15 rounded-md px-3 py-2 flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 flex-shrink-0" />
            <span>
              <strong>{examName}</strong> em{" "}
              <strong>
                {daysUntilExam} dia{daysUntilExam !== 1 ? "s" : ""}
              </strong>{" "}
              ({format(parseISO(examDate!), "dd/MM/yyyy", { locale: ptBR })})
            </span>
          </div>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Temas Estudados"
          value={stats?.totalTopics ?? 0}
          subtitle="temas registrados"
          icon={BookOpen}
          loading={isLoading}
        />
        <StatCard
          title="Disciplinas"
          value={stats?.totalDisciplines ?? 0}
          subtitle="áreas de estudo"
          icon={Target}
          loading={isLoading}
        />
        <StatCard
          title="Pendentes"
          value={stats?.pendingRevisions ?? 0}
          subtitle="revisões/testes atrasados"
          icon={Clock}
          valueClass={
            (stats?.pendingRevisions ?? 0) > 0
              ? "text-amber-600"
              : "text-green-600"
          }
          loading={isLoading}
        />
        <StatCard
          title="Concluídos"
          value={stats?.completedRevisions ?? 0}
          subtitle="atividades realizadas"
          icon={CheckCircle2}
          valueClass="text-green-600"
          loading={isLoading}
        />
      </div>

      {/* Discipline Overview — shown only when there's data */}
      {hasData && (stats?.disciplineStats?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Desempenho por Disciplina
            </CardTitle>
            <CardDescription>
              Questões resolvidas e acerto acumulado
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats!.disciplineStats
              .filter((d: any) => (d.performance?.questionsResolved ?? 0) > 0)
              .slice(0, 6)
              .map((d: any) => (
                <div key={d.disciplineId} className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: d.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium truncate">{d.name}</span>
                      <span className="text-muted-foreground ml-2 flex-shrink-0">
                        {d.performance?.accuracy ?? 0}% •{" "}
                        {d.performance?.questionsResolved ?? 0}q
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${d.performance?.accuracy ?? 0}%`,
                          backgroundColor: d.color,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            {stats!.disciplineStats.every(
              (d: any) => (d.performance?.questionsResolved ?? 0) === 0,
            ) && (
              <p className="text-sm text-muted-foreground text-center py-2">
                Nenhuma questão registrada ainda. Importe dados do TEC ou
                registre manualmente no Dashboard.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Ações Rápidas</CardTitle>
          <CardDescription>
            {hasData
              ? "Acesse as áreas mais usadas do sistema"
              : "Comece criando uma disciplina e registrando seus temas de estudo"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link href="/disciplines">
            <Button>Criar Disciplina</Button>
          </Link>
          <Link href="/topics">
            <Button variant="outline">Registrar Tema</Button>
          </Link>
          <Link href="/calendar">
            <Button variant="outline">Ver Calendário</Button>
          </Link>
          {hasData && (
            <>
              <Link href="/revisions">
                <Button variant="outline">Revisões</Button>
              </Link>
              <Link href="/flashcards">
                <Button variant="outline">Flashcards</Button>
              </Link>
            </>
          )}
        </CardContent>
      </Card>

      {/* Getting Started — shown only for new users */}
      {!hasData && (
        <Card>
          <CardHeader>
            <CardTitle>Como Começar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              {
                n: 1,
                title: "Crie uma Disciplina",
                desc: "Comece criando as disciplinas ou áreas de estudo que você quer estudar",
              },
              {
                n: 2,
                title: "Registre Seus Temas",
                desc: "Adicione os temas que você estuda e o sistema criará automaticamente um cronograma de revisões",
              },
              {
                n: 3,
                title: "Acompanhe o Calendário",
                desc: "Veja todas as revisões e testes programados no calendário interativo",
              },
              {
                n: 4,
                title: "Marque Suas Atividades",
                desc: "Marque revisões e testes como concluídos e acompanhe seu progresso",
              },
            ].map(({ n, title, desc }) => (
              <div key={n} className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                  {n}
                </div>
                <div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="text-sm text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
