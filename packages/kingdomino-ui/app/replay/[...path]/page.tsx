import fs from "fs/promises";
import { Replay } from "./replay";
import gzip from "node-gzip";

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
  const episodeBlob = await fs.readFile(
    `${process.env.HOME}/ckdata/experiments/${relativePath}`
  );
  const decompressed = await gzip.ungzip(episodeBlob);
  const episodeJsonString = decompressed.toString("utf-8");
  return <Replay episodeJsonString={episodeJsonString} />;
}
