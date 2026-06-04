import { getCurrentOrg, getOrgUsers } from "@/lib/current-org";
import { ProjectForm } from "@/components/project-form";
import Link from "next/link";

export default async function NewProjectPage() {
  const org = await getCurrentOrg();
  const users = await getOrgUsers(org.id);

  return (
    <div className="flex flex-col gap-4 p-6 min-h-full">
      <div className="flex items-center gap-3">
        <Link
          href="/projects"
          className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          ← 案件一覧
        </Link>
        <h1 className="text-xl font-bold text-slate-800">新規案件登録</h1>
      </div>
      <ProjectForm mode="create" users={users} />
    </div>
  );
}
