import fs from "fs";
import { Kingdomino } from "kingdomino";
import { Replay } from "./replay";
// import { EpisodeTrainingData } from "training-data";

export default function ReplayPage({
  params,
}: {
  params: { name: string };
}): JSX.Element {
  const episodeJsonString = fs.readFileSync(
    `${Kingdomino.GAMES_DIR}/${decodeURIComponent(params.name)}`,
    { encoding: "utf8" }
  );
  // const episodeJson = JSON.parse(episodeJsonString);
  return (
    <>
      {decodeURIComponent(params.name)}
      <br></br>
      <Replay episodeJsonString={episodeJsonString}></Replay>
    </>
  );
}
