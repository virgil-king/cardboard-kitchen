import { intersperse } from "game";
import Link from "next/link";
import * as fs from "node:fs/promises";

export default async function Experiment({
  params,
}: {
  params: Promise<{ name: string }>;
}): Promise<JSX.Element> {
  const loadedParams = await params;
  const experimentName = decodeURIComponent(loadedParams.name);
  const filenames = await fs.readdir(
    `${process.env.HOME}/ckdata/experiments/${experimentName}/eval_episodes`
  );
  const links = filenames.map((filename) => {
    return (
      <Link href={`/replay/${experimentName}/eval_episodes/${filename}`}>
        {filename}
      </Link>
    );
  });
  return <>{intersperse(links, <br />)}</>;
}
