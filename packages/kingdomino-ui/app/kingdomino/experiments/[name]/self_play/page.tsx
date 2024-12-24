import Link from "next/link";
import * as fs from "node:fs/promises";
import { intersperse } from "studio-util";

export default async function Experiment({
  params,
}: {
  params: Promise<{ name: string }>;
}): Promise<JSX.Element> {
  const loadedParams = await params;
  const experimentName = decodeURIComponent(loadedParams.name);
  const filenames = await fs.readdir(
    `${process.env.HOME}/ckdata/experiments/${experimentName}/episodes`
  );
  const links = filenames.slice(filenames.length - 100).map((filename) => {
    return (
      <Link href={`/replay/${experimentName}/episodes/${filename}`}>
        {filename}
      </Link>
    );
  });
  return <>{intersperse(links, <br />)}</>;
}
