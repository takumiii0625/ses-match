import { Placeholder } from "@/components/placeholder";
import { getCurrentOrg, getOrgUsers } from "@/lib/current-org";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function Page() {
  const org = await getCurrentOrg();
  const users = await getOrgUsers(org.id);

  if (users.length === 0) {
    return <Placeholder title="メンバー" />;
  }

  return (
    <div className="p-8">
      <h1 className="mb-1 text-xl font-bold text-slate-800">メンバー</h1>
      <p className="mb-6 text-sm text-slate-500">{org.name}</p>
      <Card className="divide-y divide-border">
        {users.map((u) => (
          <div key={u.id} className="flex items-center gap-3 px-5 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500 text-sm font-medium text-white">
              {u.name.slice(0, 1)}
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-slate-800">{u.name}</div>
              <div className="text-xs text-slate-400">{u.email}</div>
            </div>
            <Badge tone={u.role === "ADMIN" ? "indigo" : "slate"}>
              {u.role === "ADMIN" ? "管理者" : "メンバー"}
            </Badge>
          </div>
        ))}
      </Card>
    </div>
  );
}
