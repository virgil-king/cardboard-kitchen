import fs from "fs";
import { Kingdomino } from "kingdomino";
import { Replay } from "./replay";

export default async function ReplayPage({
  params,
}: {
  params: Promise<{ name: string }>;
}): Promise<JSX.Element> {
  const replayName = (await params).name;
  const episodeJsonString = fs.readFileSync(
    `${
      process.env.HOME
    }/ckdata/experiments/kingdomino-dirichlet-2/episodes/${decodeURIComponent(
      replayName
    )}`,
    { encoding: "utf8" }
  );
  return (
    <>
      {decodeURIComponent(replayName)}
      <br></br>
      <Replay episodeJsonString={episodeJsonString}></Replay>
    </>
  );
}
