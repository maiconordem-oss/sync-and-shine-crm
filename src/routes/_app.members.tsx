import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { initials } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/labels";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/members")({
  component: MembersPage,
});

interface Member { id: string; full_name: string | null; email: string | null; job_title: string | null }
type Role = "admin" | "manager" | "member";

function MembersPage() {
  const { isAdmin } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<Record<string, Role>>({});

  const load = async () => {
    const [m, r] = await Promise.all([
      supabase.from("profiles").select("id,full_name,email,job_title"),
      supabase.from("user_roles").select("user_id,role"),
    ]);
    setMembers((m.data ?? []) as Member[]);
    const map: Record<string, Role> = {};
    ((r.data ?? []) as { user_id: string; role: Role }[]).forEach((row) => { map[row.user_id] = row.role; });
    setRoles(map);
  };
  useEffect(() => { void load(); }, []);

  const setRole = async (userId: string, role: Role) => {
    if (!isAdmin) return;
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabase.from("user_roles").insert([{ user_id: userId, role }]);
    if (error) { toast.error(error.message); return; }
    toast.success("Papel atualizado!");
    void load();
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Membros</h1>
        <p className="text-sm text-muted-foreground">Gerencie usuários e seus papéis.</p>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-3 font-medium">Usuário</th>
                <th className="p-3 font-medium">E-mail</th>
                <th className="p-3 font-medium">Cargo</th>
                <th className="p-3 font-medium">Papel</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7"><AvatarFallback className="text-xs">{initials(m.full_name)}</AvatarFallback></Avatar>
                      <span className="font-medium">{m.full_name ?? "—"}</span>
                    </div>
                  </td>
                  <td className="p-3 text-muted-foreground">{m.email}</td>
                  <td className="p-3 text-muted-foreground">{m.job_title ?? "—"}</td>
                  <td className="p-3">
                    {isAdmin ? (
                      <Select value={roles[m.id] ?? "member"} onValueChange={(v) => void setRole(m.id, v as Role)}>
                        <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(ROLE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span>{ROLE_LABEL[roles[m.id] ?? "member"]}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
