import fs from "fs/promises";
import { Replay } from "./replay";
import { intersperse } from "studio-util";

export default async function ReplayPage({
  params,
}: {
  params: Promise<{
    path: string[];
  }>;
}): Promise<JSX.Element> {
  const loadedParams = await params;
  const relativePath = loadedParams.path
    .map((it) => decodeURIComponent(it))
    .join("/");
  console.log(relativePath);
  const episodeJsonString = await fs.readFile(
    `${process.env.HOME}/ckdata/experiments/${relativePath}`,
    { encoding: "utf8" }
  );
  return <Replay episodeJsonString={episodeJsonString} />;
}
