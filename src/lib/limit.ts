// 軽量な同時実行リミッタ（p-limit 相当・依存なし）。
// 並列に積んだタスクのうち、同時に走るのを最大 maxConcurrent 件に抑える。
// 余りはキューで待機し、1件終わるごとに次を取り出す。
// 用途: 案件を並列マッチしても Anthropic への同時リクエストを上限内に保つ。
export function createLimiter(maxConcurrent: number) {
  const cap = Math.max(1, Math.floor(maxConcurrent));
  let active = 0;
  const queue: (() => void)[] = [];

  const pump = () => {
    while (active < cap && queue.length > 0) {
      const run = queue.shift()!;
      active++;
      run();
    }
  };

  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            pump();
          });
      };
      queue.push(run);
      pump();
    });
  };
}

/** 配列を最大 concurrency 並列で処理（順序は保持して結果配列を返す）。 */
export async function mapLimit<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = createLimiter(concurrency);
  return Promise.all(items.map((item, i) => limit(() => fn(item, i))));
}
