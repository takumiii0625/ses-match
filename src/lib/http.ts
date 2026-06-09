// クライアントからAPIを叩くための安全なJSON取得ヘルパ。
//
// 関数がタイムアウト/クラッシュすると、プラットフォームは JSON ではなく
// 「An error occurred...」のようなテキスト/HTMLを返すことがある。
// それを素朴に res.json() するとブラウザが「Unexpected token 'A'... is not valid JSON」
// で落ちる。ここで一度 text() で受けてから安全に解析し、分かりやすいエラーにする。
export async function fetchJson<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    // fetch自体が失敗（接続断・タイムアウトで応答前に切断など）。
    throw new Error(
      "通信に失敗しました（接続が切れたか、処理が長すぎる可能性があります）。",
    );
  }
  const raw = await res.text();

  let data: unknown = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = null; // 非JSON（エラーページ等）
    }
  }

  if (!res.ok) {
    const apiError =
      data && typeof data === "object" && "error" in data &&
      typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : null;
    if (apiError) throw new Error(apiError);
    if (res.status === 504 || res.status === 408 || res.status === 524) {
      throw new Error(
        "処理がタイムアウトしました。対象件数を絞って再実行してください。",
      );
    }
    throw new Error(`エラーが発生しました (HTTP ${res.status})`);
  }

  if (data === null && raw.length > 0) {
    // 200 だが解析不能 ＝ タイムアウト/クラッシュのテキストが返ったケース。
    throw new Error(
      "サーバ応答を解釈できませんでした（処理がタイムアウトした可能性があります）。",
    );
  }

  return data as T;
}
