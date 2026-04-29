import { useProfile } from "@/hooks/useProfile";
import { usePresence } from "@/hooks/usePresence";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users, Shield, Zap, Globe } from "lucide-react";
import { motion } from "framer-motion";

export default function AdminDashboard() {
  const { profile, isAdmin } = useProfile();
  const { onlineUsers, count } = usePresence();

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-zinc-500">
        Acesso restrito a administradores.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Central do Administrador
          </h1>
          <p className="text-zinc-400">
            Gerenciamento global do ecossistema SOE
          </p>
        </div>
        <Badge
          variant="outline"
          className="border-amber-500/50 text-amber-500 px-3 py-1 bg-amber-500/10"
        >
          ADMIN MODE
        </Badge>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">
              Usuários Online
            </CardTitle>
            <Globe className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{count}</div>
            <p className="text-xs text-zinc-500">Atividade em tempo real</p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">
              Total de Cadastros
            </CardTitle>
            <Users className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">--</div>
            <p className="text-xs text-zinc-500">Sincronizado com Supabase</p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">
              Assinaturas Premium
            </CardTitle>
            <Zap className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">--</div>
            <p className="text-xs text-zinc-500">Crescimento mensal</p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">
              Alertas de Sistema
            </CardTitle>
            <Shield className="w-4 h-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">0</div>
            <p className="text-xs text-zinc-500">Nenhuma anomalia detectada</p>
          </CardContent>
        </Card>
      </div>

      {/* Online Users Table */}
      <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
        <CardHeader>
          <CardTitle className="text-white">Usuários Ativos Agora</CardTitle>
          <CardDescription>
            Lista de conexões via Supabase Presence
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-zinc-800/50">
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">Nome</TableHead>
                <TableHead className="text-zinc-400">Email</TableHead>
                <TableHead className="text-zinc-400">ID do Usuário</TableHead>
                <TableHead className="text-zinc-400 text-right">
                  Desde
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.values(onlineUsers).map((user) => (
                <TableRow
                  key={user.user_id}
                  className="border-zinc-800 hover:bg-zinc-800/30 transition-colors"
                >
                  <TableCell className="font-medium text-white">
                    {user.full_name}
                  </TableCell>
                  <TableCell className="text-zinc-400">{user.email}</TableCell>
                  <TableCell className="text-zinc-500 font-mono text-xs">
                    {user.user_id}
                  </TableCell>
                  <TableCell className="text-zinc-400 text-right">
                    {new Date(user.online_at).toLocaleTimeString()}
                  </TableCell>
                </TableRow>
              ))}
              {count === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center py-10 text-zinc-500"
                  >
                    Nenhum usuário online no momento.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
