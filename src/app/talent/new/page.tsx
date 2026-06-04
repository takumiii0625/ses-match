import { getCurrentOrg, getOrgUsers } from "@/lib/current-org";
import { TalentForm } from "@/components/talent-form";

export default async function NewTalentPage() {
  const org = await getCurrentOrg();
  const users = await getOrgUsers(org.id);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">新規人材登録</h1>
        <p className="text-sm text-slate-500 mt-1">人材情報を入力してください</p>
      </div>
      <TalentForm mode="create" users={users} />
    </div>
  );
}
